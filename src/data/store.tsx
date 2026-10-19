import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isDemo } from '../config';
import type { Adapter } from './adapters/adapter';
import { localAdapter } from './adapters/local';
import { supabase, supabaseAdapter } from './adapters/supabase';
import { DEFAULT_BUDGETS, DEFAULT_SETTINGS } from './defaults';
import { mergeCoverage, splitNew, type ParsedImport } from './importers';
import { applyCustomCategories } from './categories';
import { categorise, RULES_VERSION } from './rules';
import { indexPayees, payeesFor, sortTransaction, type PayeeIndex } from './payees';
import { mergeSettings } from './settingsMerge';
import type { BudgetLine, Data, DataFile, Payee, Review, Rule, Settings, Transaction } from './types';

interface Store {
  data: Data;
  status: 'loading' | 'signed-out' | 'ready' | 'error';
  error: string | null;
  mode: Adapter['kind'];
  email: string | null;
  saving: boolean;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
  updateTransaction(id: string, patch: Partial<Transaction>): Promise<void>;
  /** Sort every matching transaction the same way from now on. */
  addRule(rule: Omit<Rule, 'id' | 'user'>): Promise<number>;
  deleteRule(id: string): Promise<void>;
  setBudget(category: string, from: string, amount: number): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
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
  const dataRef = useRef(data);
  dataRef.current = data;
  applyCustomCategories(data.settings.customCategories, data.settings.hiddenCategories, data.settings);

  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSaving(true);
    try { return await fn(); }
    catch (e: any) { setError(e?.message ?? String(e)); throw e; }
    finally { setSaving(false); }
  }, []);

  /** `quiet`: a background refresh. It never shows the loading or error screen. */
  const load = useCallback(async (quiet = false) => {
    try {
      const l = await adapter.load();
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
        if (fixed.length) await adapter.upsertTransactions(fixed);
      }
      // Every transaction gets a payee. The first time, this builds the whole list from the existing categories.
      const added = payeesFor(transactions, payees);
      if (added.length) { payees = [...payees, ...added]; await adapter.savePayees(payees); }
      // Things dated in the future (a house at settlement) must keep that start date once the date has passed.
      const today = new Date().toISOString().slice(0, 10);
      let fixWealth = false;
      settings.wealth = (settings.wealth ?? []).map((w) => {
        const first = [...w.values].sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!w.ownedSince && first && first.date > today) { fixWealth = true; return { ...w, ownedSince: first.date }; }
        return w;
      });
      if (resortAll) settings.rulesVersion = RULES_VERSION;
      if (resortAll || fixWealth) await adapter.saveSettings(settings);
      if (!l.budgets.length) await adapter.upsertBudgets(DEFAULT_BUDGETS);
      if (!l.settings) await adapter.saveSettings(settings);
      transactions.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      setData({ transactions, rules: userRules, budgets, coverage: l.coverage, settings, reviews: l.reviews, payees });
      setStatus('ready');
      setError(null);
    } catch (e: any) {
      if (quiet) return;
      setError(e?.message ?? String(e));
      setStatus('error');
    }
  }, [adapter]);

  useEffect(() => {
    if (adapter.kind === 'local') { setEmail('demo'); load(); return; }
    const sb = supabase();
    let first = true;
    let user: string | null = null;
    let loadedAt = 0;
    sb.auth.getSession().then(({ data: { session } }) => onSession(session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { if (!first) onSession(session); });
    // Supabase announces "signed in" again whenever the tab comes back into view and when it renews the login.
    // Only a different person (or signing in after signing out) shows the loading screen. For the same person,
    // after a long break the data is refreshed quietly in the background, so the other person's changes appear.
    function onSession(session: Session | null) {
      first = false;
      if (!session) { user = null; setEmail(null); setStatus('signed-out'); return; }
      setEmail(session.user.email ?? null);
      if (session.user.id !== user) { user = session.user.id; loadedAt = Date.now(); setStatus('loading'); load(); }
      else if (Date.now() - loadedAt > 10 * 60_000) { loadedAt = Date.now(); load(true); }
    }
    return () => sub.subscription.unsubscribe();
  }, [adapter, load]);

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

  const store = useMemo<Store>(() => ({
    data, status, error, mode: adapter.kind, email, saving, payeeIdx,
    async signIn(e, password) {
      const { error } = await supabase().auth.signInWithPassword({ email: e.trim(), password });
      return error ? (error.message.includes('Invalid') ? 'That email and password don\'t match. Check them and try again.' : error.message) : null;
    },
    async signOut() { if (adapter.kind === 'supabase') await supabase().auth.signOut(); },
    reload: () => load(),
    async updateTransaction(id, patch) {
      const cur = dataRef.current.transactions.find((t) => t.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch, manual: patch.category || patch.kind ? true : cur.manual, needsReview: patch.category || patch.kind ? false : (patch.needsReview ?? cur.needsReview) };
      setData((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === id ? next : t)) }));
      await guard(() => adapter.upsertTransactions([next]));
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
      await guard(() => adapter.upsertBudgets([line]));
    },
    async updateSettings(patch) {
      const settings = { ...dataRef.current.settings, ...patch };
      setData((d) => ({ ...d, settings }));
      await guard(() => adapter.saveSettings(settings));
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
      await guard(async () => {
        if (incomingRules.length) await adapter.upsertRules(incomingRules);
        if (payees.length !== d.payees.length) await adapter.savePayees(payees);
        if (fresh.length || resorted.length) await adapter.upsertTransactions([...fresh, ...resorted]);
        await adapter.replaceCoverage(coverage);
        if (reviews.length) await adapter.upsertReviews(reviews);
        if (budgets.length) await adapter.upsertBudgets(budgets);
        if (incomingSettings) await adapter.saveSettings(settings);
      });
      await load();
      return { added: fresh.length, duplicates };
    },
    async addReview(r) {
      setData((d) => ({ ...d, reviews: [...d.reviews.filter((x) => x.id !== r.id), r] }));
      await guard(() => adapter.upsertReviews([r]));
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
      await guard(async () => { await adapter.savePayees(payees); if (changed.length) await adapter.upsertTransactions(changed); });
      return changed.length;
    },
    async markChecked(ids) {
      const d = dataRef.current;
      const set = new Set(ids);
      const payees = d.payees.map((p) => (set.has(p.id) ? { ...p, checked: true } : p));
      setData({ ...d, payees });
      await guard(() => adapter.savePayees(payees));
    },
    async mergePayees(fromId, intoId) {
      const d = dataRef.current;
      const from = d.payees.find((p) => p.id === fromId), into = d.payees.find((p) => p.id === intoId);
      if (!from || !into || from.id === into.id) return 0;
      const merged: Payee = { ...into, match: [...new Set([...into.match, ...from.match])], patterns: [...new Set([...(into.patterns ?? []), ...(from.patterns ?? [])])] };
      const payees = d.payees.filter((p) => p.id !== fromId).map((p) => (p.id === intoId ? merged : p));
      const { all, changed } = resortFor(d.transactions, payees, new Set([intoId]), d.settings, d.rules);
      setData({ ...d, payees, transactions: all });
      await guard(async () => { await adapter.savePayees(payees); if (changed.length) await adapter.upsertTransactions(changed); });
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
      await guard(async () => { await adapter.upsertTransactions(changed); if (added.length) await adapter.savePayees(payees); });
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
  }), [data, status, error, adapter, email, saving, guard, load, payeeIdx]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
