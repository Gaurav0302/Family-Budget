import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isDemo } from '../config';
import type { Adapter } from './adapters/adapter';
import { localAdapter } from './adapters/local';
import { rebasePayees, setHousehold, supabase, supabaseAdapter } from './adapters/supabase';
import { myHousehold, type Household } from './adapters/households';
import { DEFAULT_BUDGETS, DEFAULT_SETTINGS } from './defaults';
import { mergeCoverage, splitNew, type ParsedImport } from './importers';
import { applyCustomCategories, label } from './categories';
import { describeSettings, describeTransactions } from './activity';
import { categorise, RULES_VERSION } from './rules';
import { indexPayees, payeesFor, sortTransaction, type PayeeIndex } from './payees';
import { mergeSettings } from './settingsMerge';
import type { Activity, BudgetLine, Data, DataFile, Payee, Review, Rule, Settings, Transaction } from './types';
import { today as todayLocal } from '../lib/format';

interface Store {
  data: Data;
  /** 'no-household': signed in, but not yet in a household (start one, or accept an invitation). */
  status: 'loading' | 'signed-out' | 'no-household' | 'ready' | 'error';
  /** The signed-in person's household (shared database only). */
  household: Household | null;
  /** Look up the household again (after starting, joining, leaving or deleting one) and load its data. */
  enterHousehold(): Promise<void>;
  /** Create a login. Returns an error message, or null; `confirm` when the email must be confirmed before signing in. */
  signUp(email: string, password: string): Promise<{ error: string | null; confirm: boolean }>;
  error: string | null;
  mode: Adapter['kind'];
  email: string | null;
  saving: boolean;
  /** A change that didn't save (shown as a banner with Try again). */
  saveError: string | null;
  retrySave(): Promise<void>;
  dismissSaveError(): void;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  /** Change the signed-in person's password. Returns an error message, or null when it worked. */
  changePassword(password: string): Promise<string | null>;
  /** Email a link to set a new password (from the sign-in page). Returns an error message, or null. */
  resetPassword(email: string): Promise<string | null>;
  /** Arrived from a "set a new password" email: the app asks for the new password first. */
  recovering: boolean;
  finishRecovery(): void;
  reload(): Promise<void>;
  updateTransaction(id: string, patch: Partial<Transaction>): Promise<void>;
  /** The same change to several transactions at once (sorting many in one go), saved together. */
  updateTransactions(ids: string[], patch: Partial<Transaction>): Promise<void>;
  /** Sort every matching transaction the same way from now on. */
  addRule(rule: Omit<Rule, 'id' | 'user'>): Promise<number>;
  deleteRule(id: string): Promise<void>;
  setBudget(category: string, from: string, amount: number): Promise<void>;
  /** Budget lines and settings changed together in one step, so the screen never shows one without the other. */
  setBudgetWith(lines: BudgetLine[], patch: Partial<Settings>): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  /** A change worked out from the settings (one entry in a shared map): run again on the latest saved copy, so someone
   *  else's entries made meanwhile are kept. */
  updateSettingsBy(change: (s: Settings) => Partial<Settings>): Promise<void>;
  importParsed(p: ParsedImport): Promise<{ added: number; duplicates: number }>;
  addReview(r: Review): Promise<void>;
  deleteReview(id: string): Promise<void>;
  backup(): DataFile;
  resetLocal(): Promise<void>;
  /** Fast lookup of each transaction's payee. */
  payeeIdx: PayeeIndex;
  /** Change a payee. With applyPast, its earlier transactions (not sorted by hand) move too. Returns how many moved. */
  setPayee(id: string, patch: Partial<Payee>, applyPast: boolean): Promise<number>;
  /** Give PayPal bank payments the shop's name from a PayPal activity file, and sort them by it. Returns how many were named. */
  namePayPal(list: { id: string; description: string; note?: string }[]): Promise<number>;
  /** Fold one payee into another (same shop, different bank wording). */
  mergePayees(fromId: string, intoId: string): Promise<number>;
  markChecked(ids: string[]): Promise<void>;
  /** Who changed what, newest first (shared between everyone signed in). */
  activity: Activity[];
}

const empty: Data = { transactions: [], rules: [], budgets: DEFAULT_BUDGETS, coverage: [], settings: DEFAULT_SETTINGS, reviews: [], payees: [] };
const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

const withDefaults = (s: Settings | null): Settings => ({
  ...DEFAULT_SETTINGS, ...(s ?? {}),
  home: { ...DEFAULT_SETTINGS.home, ...(s?.home ?? {}) },
  accounts: s?.accounts?.length ? s.accounts : DEFAULT_SETTINGS.accounts,
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const adapter: Adapter = isDemo() ? localAdapter : supabaseAdapter;
  const [data, setData] = useState<Data>(empty);
  const [status, setStatus] = useState<Store['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [household, setHouseholdState] = useState<Household | null>(null);
  const userRef = useRef<string | null>(null);
  const householdRef = useRef<Household | null>(null);
  const emailRef = useRef<string | null>(null);
  emailRef.current = email;
  const dataRef = useRef(data);
  dataRef.current = data;
  applyCustomCategories(data.settings.customCategories, data.settings.hiddenCategories, data.settings);

  // Saves in flight (several can overlap) and the last one that failed, so it can be tried again.
  const inFlight = useRef(0);
  const failed = useRef<(() => Promise<unknown>)[]>([]);
  /** Run a save. A failure never passes silently: it waits in a list and a banner offers "Try again" (the screen keeps the
   *  change; trying again re-applies just that change to the latest saved data). Later saves that work don't clear it.
   *  `rethrow` is for callers that show their own message (adding statements). */
  const guard = useCallback(async <T,>(fn: () => Promise<T>, rethrow = false): Promise<T | undefined> => {
    inFlight.current++; setSaving(true);
    try { return await fn(); }
    catch (e: any) {
      if (rethrow) throw e;
      failed.current = [...failed.current, fn];
      setSaveError(e?.message ?? String(e));
      return undefined;
    }
    finally { inFlight.current--; if (!inFlight.current) setSaving(false); }
  }, []);

  // Closing the page while something is still saving asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (inFlight.current || failed.current.length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /** After a save: the screen takes what's now stored (someone else's changes included), except anything changed on this
   *  screen since this save was sent, which is still on its way and must not flicker back. */
  const adoptSettings = (stored: Settings, sent: Settings) => {
    if (JSON.stringify(stored) === JSON.stringify(sent)) return;
    setData((d) => {
      const out: any = { ...stored };
      for (const k of Object.keys(d.settings)) if (JSON.stringify((d.settings as any)[k]) !== JSON.stringify((sent as any)[k])) out[k] = (d.settings as any)[k];
      return { ...d, settings: withDefaults(out) };
    });
  };
  const adoptPayees = (stored: Payee[], sent: Payee[]) => {
    if (stored === sent || JSON.stringify(stored) === JSON.stringify(sent)) return;
    setData((d) => ({ ...d, payees: rebasePayees(d.payees, sent, stored) }));
  };

  /** `quiet`: a background refresh. It never shows the loading or error screen. */
  const load = useCallback(async (quiet = false) => {
    // If someone else signs in on this device while this is loading, stop: nothing of this household may be written to
    // theirs or shown to them.
    const startedFor = householdRef.current?.id;
    const moved = () => householdRef.current?.id !== startedFor;
    try {
      const l = await adapter.load();
      if (moved()) return;
      const settings = withDefaults(l.settings);
      const budgets = l.budgets.length ? l.budgets : DEFAULT_BUDGETS;
      const userRules = l.rules.map((r) => ({ ...r, user: true }));
      applyCustomCategories(settings.customCategories, settings.hiddenCategories, settings);
      let payees = l.payees ?? [];
      // New built-in rules: re-sort everything nobody sorted by hand. Otherwise only sort what has no category yet.
      const resortAll = (settings.rulesVersion ?? 1) < RULES_VERSION;
      const unsorted = l.transactions.filter((t) => resortAll ? !t.manual : !t.category || !t.kind);
      let transactions = l.transactions;
      if (unsorted.length) {
        const idx = indexPayees(payees);
        const before = new Map(unsorted.map((t) => [t.id, `${t.category}|${t.kind}|${t.needsReview}`]));
        const fixed = unsorted.map((t) => { const { payee: _p, ...x } = sortTransaction(t, idx, userRules, settings); return { ...t, ...x }; })
          .filter((t) => before.get(t.id) !== `${t.category}|${t.kind}|${t.needsReview}`);
        const byId = new Map(fixed.map((t) => [t.id, t]));
        transactions = l.transactions.map((t) => byId.get(t.id) ?? t);
        if (fixed.length && !moved()) await adapter.upsertTransactions(fixed);
      }
      // Every transaction gets a payee. The first time, this builds the whole list from the existing categories.
      const added = payeesFor(transactions, payees);
      if (added.length && !moved()) { const base = payees; payees = [...payees, ...added]; payees = await adapter.savePayees(payees, base); }
      // Things dated in the future (a house at settlement) must keep that start date once the date has passed.
      const today = todayLocal();
      let fixWealth = false;
      settings.wealth = (settings.wealth ?? []).map((w) => {
        const first = [...w.values].sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!w.ownedSince && first && first.date > today) { fixWealth = true; return { ...w, ownedSince: first.date }; }
        return w;
      });
      if (resortAll) settings.rulesVersion = RULES_VERSION;
      if (moved()) return;
      if (resortAll || fixWealth) Object.assign(settings, withDefaults(await adapter.saveSettings(settings, { rulesVersion: settings.rulesVersion, wealth: settings.wealth })));
      if (!l.budgets.length) await adapter.upsertBudgets(DEFAULT_BUDGETS);
      // A new household: its first settings carry the name it was started with.
      if (!l.settings && householdRef.current) settings.household = householdRef.current.name;
      if (!l.settings) await adapter.saveSettings(settings, settings);
      if (moved()) return;
      transactions.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      setData({ transactions, rules: userRules, budgets, coverage: l.coverage, settings, reviews: l.reviews, payees });
      setActivity(l.activity ?? []);
      setStatus('ready');
      setError(null);
    } catch (e: any) {
      if (quiet) return;
      setError(e?.message ?? String(e));
      setStatus('error');
    }
  }, [adapter]);

  /** Find the signed-in person's household, then load its data (or ask them to start or join one). */
  const enter = useCallback(async () => {
    const id = userRef.current;
    if (!id) return;
    setStatus('loading');
    try {
      const hh = await myHousehold(id);
      householdRef.current = hh; setHouseholdState(hh); setHousehold(hh?.id ?? null);
      if (!hh) { setData(empty); setStatus('no-household'); return; }
      await load();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setError(/household_id|households|does not exist/i.test(msg)
        ? 'The database needs its households update. In Supabase, run the setup script again (supabase/setup.sql), then try again.'
        : msg);
      setStatus('error');
    }
  }, [load]);

  useEffect(() => {
    if (adapter.kind === 'local') { setEmail('demo'); load(); return; }
    const sb = supabase();
    let first = true;
    let user: string | null = null;
    let loadedAt = 0;
    sb.auth.getSession().then(({ data: { session } }) => onSession(session));
    const { data: sub } = sb.auth.onAuthStateChange((e, session) => { if (e === 'PASSWORD_RECOVERY') setRecovering(true); if (!first) onSession(session); });
    // Supabase announces "signed in" again whenever the tab comes back into view and when it renews the login.
    // Only a different person (or signing in after signing out) shows the loading screen. For the same person,
    // after a long break the data is refreshed quietly in the background, so the other person's changes appear.
    function onSession(session: Session | null) {
      first = false;
      if (!session) { user = null; userRef.current = null; householdRef.current = null; setHouseholdState(null); setHousehold(null); setEmail(null); setStatus('signed-out'); return; }
      setEmail(session.user.email ?? null);
      if (session.user.id !== user) { user = session.user.id; userRef.current = user; loadedAt = Date.now(); enter(); }
      else if (Date.now() - loadedAt > 10 * 60_000) { loadedAt = Date.now(); load(true); }
    }
    return () => sub.subscription.unsubscribe();
  }, [adapter, load, enter]);

  const payeeIdx = useMemo(() => indexPayees(data.payees), [data.payees]);

  /** Re-sort transactions (not sorted by hand) that belong to the given payees, after a payee changed. */
  const resortFor = (txs: Transaction[], payees: Payee[], ids: Set<string>, settings: Settings, rules: Rule[]) => {
    const idx = indexPayees(payees);
    const changed: Transaction[] = [];
    const all = txs.map((t) => {
      if (t.manual) return t;
      const s = sortTransaction(t, idx, rules, settings);
      if (!s.payee || !ids.has(s.payee.id)) return t;
      // A person just decided this payee's category, so its transactions no longer need input (unless it's still 'not sure').
      const needsReview = s.category === 'other' || s.category === 'other-income';
      if (s.category === t.category && s.kind === t.kind && needsReview === !!t.needsReview) return t;
      const n = { ...t, category: s.category, kind: s.kind, needsReview };
      changed.push(n);
      return n;
    });
    return { all, changed };
  };

  /** Add a line to "who changed what". Never holds anything up, and a failure here isn't worth a banner. */
  const note = (what: string | null) => {
    if (!what) return;
    adapter.logActivity({ at: new Date().toISOString(), by: emailRef.current, what }).then(setActivity, () => {});
  };

  const store = useMemo<Store>(() => ({
    data, status, error, mode: adapter.kind, email, saving, payeeIdx, household,
    enterHousehold: enter,
    async signUp(e, password) {
      const { data: d, error } = await supabase().auth.signUp({ email: e.trim(), password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) return { error: /registered|exists/i.test(error.message) ? 'There is already a login for this email. Sign in instead, or reset the password.' : error.message, confirm: false };
      return { error: null, confirm: !d.session };
    },
    async signIn(e, password) {
      const { error } = await supabase().auth.signInWithPassword({ email: e.trim(), password });
      return error ? (error.message.includes('Invalid') ? 'That email and password don\'t match. Check them and try again.' : error.message) : null;
    },
    async signOut() {
      // Leave nothing behind on a shared computer: unsaved plan drafts, failed saves and the data on screen go too.
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('fb:draft:')) localStorage.removeItem(k); } catch { /* storage off */ }
      failed.current = []; setSaveError(null);
      if (adapter.kind === 'supabase') { await supabase().auth.signOut(); setData(empty); }
    },
    async changePassword(password) {
      if (adapter.kind !== 'supabase') return 'Passwords only apply when signed in to the family database.';
      const { error } = await supabase().auth.updateUser({ password });
      return error ? error.message : null;
    },
    async resetPassword(e) {
      const { error } = await supabase().auth.resetPasswordForEmail(e.trim(), { redirectTo: window.location.origin + window.location.pathname });
      return error ? error.message : null;
    },
    recovering,
    finishRecovery() { setRecovering(false); },
    saveError,
    async retrySave() {
      const list = failed.current;
      failed.current = [];
      setSaveError(null);
      for (const fn of list) await guard(fn);   // anything that fails again goes back on the list
    },
    dismissSaveError() { failed.current = []; setSaveError(null); },
    reload: () => load(),
    async updateTransaction(id, patch) {
      const cur = dataRef.current.transactions.find((t) => t.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch, manual: patch.category || patch.kind ? true : cur.manual, needsReview: patch.category || patch.kind ? false : (patch.needsReview ?? cur.needsReview) };
      setData((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === id ? next : t)) }));
      const ok = await guard(async () => { await adapter.upsertTransactions([next]); return true; });
      // Only what really changed (the editor sends every field).
      const real = Object.fromEntries(Object.entries(patch).filter(([k, v]) => ((cur as any)[k] ?? null) !== (v ?? null) && !(k === 'oneOff' && !!v === !!cur.oneOff))) as Partial<Transaction>;
      if (ok && Object.keys(real).length) note(describeTransactions([next], real));
    },
    async updateTransactions(ids, patch) {
      const set = new Set(ids);
      const sorting = !!(patch.category || patch.kind);
      const changed = dataRef.current.transactions.filter((t) => set.has(t.id))
        .map((t) => ({ ...t, ...patch, manual: sorting ? true : t.manual, needsReview: sorting ? false : (patch.needsReview ?? t.needsReview) }));
      const byId = new Map(changed.map((t) => [t.id, t]));
      setData((d) => ({ ...d, transactions: d.transactions.map((t) => byId.get(t.id) ?? t) }));
      const ok = await guard(async () => { await adapter.upsertTransactions(changed); return true; });
      if (ok && changed.length) note(describeTransactions(changed, patch));
    },
    async addRule(rule) {
      const full: Rule = { ...rule, id: `user:${Date.now().toString(36)}`, user: true };
      const d = dataRef.current;
      const rules = [full, ...d.rules];
      const changed: Transaction[] = [];
      const transactions = d.transactions.map((t) => {
        if (t.manual) return t;
        const s = categorise(t, rules, d.settings);
        if (s.category === t.category && s.kind === t.kind && s.needsReview === !!t.needsReview) return t;
        const n = { ...t, ...s };
        changed.push(n);
        return n;
      });
      setData({ ...d, rules, transactions });
      await guard(async () => { await adapter.upsertRules([full]); if (changed.length) await adapter.upsertTransactions(changed); });
      return changed.length;
    },
    async deleteRule(id) {
      setData((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
      await guard(() => adapter.deleteRule(id));
    },
    async setBudget(category, from, amount) {
      const line: BudgetLine = { category, from, amount };
      setData((d) => ({ ...d, budgets: [...d.budgets.filter((b) => !(b.category === category && b.from === from)), line] }));
      if (await guard(async () => { await adapter.upsertBudgets([line]); return true; })) note(`Changed the ${label(category)} budget`);
    },
    async setBudgetWith(lines, patch) {
      const settings = { ...dataRef.current.settings, ...patch };
      const same = (b: BudgetLine) => lines.some((l) => l.category === b.category && l.from === b.from);
      setData((d) => ({ ...d, settings, budgets: [...d.budgets.filter((b) => !same(b)), ...lines] }));
      if (await guard(async () => { if (lines.length) await adapter.upsertBudgets(lines); adoptSettings(await adapter.saveSettings(settings, patch), settings); return true; })) note(lines.length ? `Changed the ${[...new Set(lines.map((l) => label(l.category)))].join(', ')} budget` : describeSettings(patch));
    },
    async updateSettings(patch) {
      const settings = { ...dataRef.current.settings, ...patch };
      setData((d) => ({ ...d, settings }));
      if (await guard(async () => { adoptSettings(await adapter.saveSettings(settings, patch), settings); return true; })) note(describeSettings(patch));
    },
    async updateSettingsBy(change) {
      const patch = change(dataRef.current.settings);
      const settings = { ...dataRef.current.settings, ...patch };
      setData((d) => ({ ...d, settings }));
      if (await guard(async () => { adoptSettings(await adapter.saveSettings(settings, patch, change), settings); return true; })) note(describeSettings(patch));
    },
    async importParsed(p) {
      const d = dataRef.current;
      const incomingSettings = p.file?.settings || p.statements ? { ...(p.file?.settings ?? {}), ...(p.statements ? { statements: [...(p.file?.settings?.statements ?? []), ...p.statements] } : {}) } : null;
      const settings = incomingSettings ? withDefaults(mergeSettings(d.settings, incomingSettings)) : d.settings;
      applyCustomCategories(settings.customCategories, settings.hiddenCategories, settings);
      // Rules and payees in a file: rules with the same id are replaced; payees the family already has are kept as they are.
      const incomingRules = (p.file?.rules ?? []).map((r) => ({ ...r, user: true }));
      const rules = [...incomingRules, ...d.rules.filter((r) => !incomingRules.some((x) => x.id === r.id))];
      let payees = [...d.payees, ...(p.file?.payees ?? []).filter((x) => !d.payees.some((y) => y.id === x.id))];
      const idx = indexPayees(payees);
      const resorted = incomingRules.length || payees.length !== d.payees.length
        ? d.transactions.filter((t) => !t.manual).map((t) => { const { payee: _p, ...x } = sortTransaction(t, idx, rules, settings); return { t, n: { ...t, ...x } }; })
          .filter(({ t, n }) => t.category !== n.category || t.kind !== n.kind || !!t.needsReview !== n.needsReview).map(({ n }) => n)
        : [];
      const sorted = p.transactions.map((t) => {
        if (t.manual) return t;
        const { payee: _p, ...x } = sortTransaction({ ...t, category: null, kind: null }, idx, rules, settings, true);
        return { ...t, ...x };
      });
      payees = [...payees, ...payeesFor(sorted, payees)];
      const { fresh, duplicates } = splitNew(d.transactions, sorted);
      const coverage = mergeCoverage([...d.coverage, ...p.coverage]);
      const reviews = p.file?.reviews ?? [];
      const budgets = p.file?.budgets ?? [];
      // Transactions first, settings last. If something fails part-way, adding the same file again is safe: what's already
      // in is skipped and the rest is added. The screen reloads either way, so it shows what was really saved.
      try {
        await guard(async () => {
          if (fresh.length || resorted.length) await adapter.upsertTransactions([...fresh, ...resorted]);
          await adapter.replaceCoverage(coverage);
          if (incomingRules.length) await adapter.upsertRules(incomingRules);
          if (payees.length !== d.payees.length) await adapter.savePayees(payees, d.payees);
          if (reviews.length) await adapter.upsertReviews(reviews);
          if (budgets.length) await adapter.upsertBudgets(budgets);
          if (incomingSettings) await adapter.saveSettings(settings, Object.fromEntries(Object.keys(incomingSettings).map((k) => [k, (settings as any)[k]])) as Partial<Settings>);
        }, true);
      } finally { await load(true); }
      note(fresh.length ? `Added ${fresh.length} payments${p.transactions[0]?.source ? ` from ${p.transactions[0].source}` : ''}` : incomingSettings ? 'Added an update file' : null);
      return { added: fresh.length, duplicates };
    },
    async addReview(r) {
      setData((d) => ({ ...d, reviews: [...d.reviews.filter((x) => x.id !== r.id), r] }));
      await guard(() => adapter.upsertReviews([r]));
      note('Wrote a note in the money meeting');
    },
    async deleteReview(id) {
      setData((d) => ({ ...d, reviews: d.reviews.filter((x) => x.id !== id) }));
      await guard(() => adapter.deleteReview(id));
    },
    async setPayee(id, patch, applyPast) {
      const d = dataRef.current;
      const payees = d.payees.map((p) => (p.id === id ? { ...p, ...patch } : p));
      let changed: Transaction[] = [];
      let transactions = d.transactions;
      if (applyPast && (patch.category || patch.kind || patch.patterns)) {
        ({ all: transactions, changed } = resortFor(d.transactions, payees, new Set([id]), d.settings, d.rules));
      }
      setData({ ...d, payees, transactions });
      await guard(async () => { adoptPayees(await adapter.savePayees(payees, d.payees), payees); if (changed.length) await adapter.upsertTransactions(changed); });
      const who = d.payees.find((p) => p.id === id)?.name;
      note(patch.category ? `Sorted ${who ?? 'a payee'} into ${label(patch.category)}` : `Changed the payee ${who ?? ''}`.trim());
      return changed.length;
    },
    async markChecked(ids) {
      const d = dataRef.current;
      const set = new Set(ids);
      const payees = d.payees.map((p) => (set.has(p.id) ? { ...p, checked: true } : p));
      setData({ ...d, payees });
      await guard(async () => adoptPayees(await adapter.savePayees(payees, d.payees), payees));
    },
    async mergePayees(fromId, intoId) {
      const d = dataRef.current;
      const from = d.payees.find((p) => p.id === fromId), into = d.payees.find((p) => p.id === intoId);
      if (!from || !into || from.id === into.id) return 0;
      const merged: Payee = { ...into, match: [...new Set([...into.match, ...from.match])], patterns: [...new Set([...(into.patterns ?? []), ...(from.patterns ?? [])])] };
      const payees = d.payees.filter((p) => p.id !== fromId).map((p) => (p.id === intoId ? merged : p));
      const { all, changed } = resortFor(d.transactions, payees, new Set([intoId]), d.settings, d.rules);
      setData({ ...d, payees, transactions: all });
      await guard(async () => { adoptPayees(await adapter.savePayees(payees, d.payees), payees); if (changed.length) await adapter.upsertTransactions(changed); });
      return changed.length;
    },
    async namePayPal(list) {
      const d = dataRef.current;
      const byId = new Map(list.map((x) => [x.id, x]));
      const idx = indexPayees(d.payees);
      // New wording, then sort again: an existing payee for that shop wins, otherwise the built-in rules decide.
      const changed = d.transactions.filter((t) => byId.has(t.id)).map((t) => {
        const x = byId.get(t.id)!;
        const renamed: Transaction = { ...t, description: x.description, note: t.note || x.note || null };
        if (t.manual) return renamed;
        const { payee: _p, ...sorted } = sortTransaction({ ...renamed, category: null, kind: null }, idx, d.rules, d.settings);
        return { ...renamed, ...sorted };
      });
      const byChanged = new Map(changed.map((t) => [t.id, t]));
      const transactions = d.transactions.map((t) => byChanged.get(t.id) ?? t);
      const added = payeesFor(changed, d.payees);
      const payees = added.length ? [...d.payees, ...added] : d.payees;
      setData({ ...d, transactions, payees });
      await guard(async () => { await adapter.upsertTransactions(changed); if (added.length) adoptPayees(await adapter.savePayees(payees, d.payees), payees); }, true);
      return changed.length;
    },
    backup() {
      const d = dataRef.current;
      return { app: 'family-budget', version: 1, exported: new Date().toISOString(),
        transactions: d.transactions, coverage: d.coverage, reviews: d.reviews, budgets: d.budgets, rules: d.rules, settings: d.settings, payees: d.payees };
    },
    async resetLocal() {
      if (adapter.kind !== 'local') return;
      const { clearLocal } = await import('./adapters/local');
      clearLocal();
      await load();
    },
    activity,
  }), [data, status, error, adapter, email, saving, saveError, recovering, guard, load, payeeIdx, activity, household, enter]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
