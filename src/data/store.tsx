import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isDemo } from '../config';
import type { Adapter } from './adapters/adapter';
import { localAdapter } from './adapters/local';
import { supabase, supabaseAdapter } from './adapters/supabase';
import { DEFAULT_BUDGETS, DEFAULT_SETTINGS } from './defaults';
import { mergeCoverage, splitNew, type ParsedImport } from './importers';
import { applyCustomCategories } from './categories';
import { applyRules, categorise, RULES_VERSION } from './rules';
import { mergeSettings } from './settingsMerge';
import type { BudgetLine, Data, DataFile, Review, Rule, Settings, Transaction } from './types';

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
}

const empty: Data = { transactions: [], rules: [], budgets: DEFAULT_BUDGETS, coverage: [], settings: DEFAULT_SETTINGS, reviews: [] };
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
  applyCustomCategories(data.settings.customCategories, data.settings.hiddenCategories);

  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSaving(true);
    try { return await fn(); }
    catch (e: any) { setError(e?.message ?? String(e)); throw e; }
    finally { setSaving(false); }
  }, []);

  const load = useCallback(async () => {
    try {
      const l = await adapter.load();
      const settings = withDefaults(l.settings);
      const budgets = l.budgets.length ? l.budgets : DEFAULT_BUDGETS;
      const userRules = l.rules.map((r) => ({ ...r, user: true }));
      applyCustomCategories(settings.customCategories, settings.hiddenCategories);
      // New built-in rules: re-sort everything nobody sorted by hand. Otherwise only sort what has no category yet.
      const resortAll = (settings.rulesVersion ?? 1) < RULES_VERSION;
      const unsorted = l.transactions.filter((t) => resortAll ? !t.manual : !t.category || !t.kind);
      let transactions = l.transactions;
      if (unsorted.length) {
        const before = new Map(unsorted.map((t) => [t.id, `${t.category}|${t.kind}|${t.needsReview}`]));
        const fixed = applyRules(unsorted, userRules, settings).filter((t) => before.get(t.id) !== `${t.category}|${t.kind}|${t.needsReview}`);
        const byId = new Map(fixed.map((t) => [t.id, t]));
        transactions = l.transactions.map((t) => byId.get(t.id) ?? t);
        if (fixed.length) await adapter.upsertTransactions(fixed);
      }
      if (resortAll) { settings.rulesVersion = RULES_VERSION; await adapter.saveSettings(settings); }
      if (!l.budgets.length) await adapter.upsertBudgets(DEFAULT_BUDGETS);
      if (!l.settings) await adapter.saveSettings(settings);
      transactions.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      setData({ transactions, rules: userRules, budgets, coverage: l.coverage, settings, reviews: l.reviews });
      setStatus('ready');
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus('error');
    }
  }, [adapter]);

  useEffect(() => {
    if (adapter.kind === 'local') { setEmail('demo'); load(); return; }
    const sb = supabase();
    let first = true;
    sb.auth.getSession().then(({ data: { session } }) => onSession(session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { if (!first) onSession(session); });
    function onSession(session: Session | null) {
      first = false;
      if (session) { setEmail(session.user.email ?? null); setStatus('loading'); load(); }
      else { setEmail(null); setStatus('signed-out'); }
    }
    return () => sub.subscription.unsubscribe();
  }, [adapter, load]);

  const store = useMemo<Store>(() => ({
    data, status, error, mode: adapter.kind, email, saving,
    async signIn(e, password) {
      const { error } = await supabase().auth.signInWithPassword({ email: e.trim(), password });
      return error ? (error.message.includes('Invalid') ? 'That email and password don\'t match. Check them and try again.' : error.message) : null;
    },
    async signOut() { if (adapter.kind === 'supabase') await supabase().auth.signOut(); },
    reload: load,
    async updateTransaction(id, patch) {
      const cur = dataRef.current.transactions.find((t) => t.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch, manual: patch.category || patch.kind ? true : cur.manual, needsReview: patch.category || patch.kind ? false : cur.needsReview };
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
      const settings = p.file?.settings ? withDefaults(mergeSettings(d.settings, p.file.settings)) : d.settings;
      applyCustomCategories(settings.customCategories, settings.hiddenCategories);
      // Rules in a file replace rules with the same id, then everything nobody sorted by hand is re-sorted.
      const incomingRules = (p.file?.rules ?? []).map((r) => ({ ...r, user: true }));
      const rules = [...incomingRules, ...d.rules.filter((r) => !incomingRules.some((x) => x.id === r.id))];
      const resorted = incomingRules.length
        ? d.transactions.filter((t) => !t.manual).map((t) => ({ t, n: { ...t, ...categorise(t, rules, settings) } }))
          .filter(({ t, n }) => t.category !== n.category || t.kind !== n.kind || !!t.needsReview !== n.needsReview).map(({ n }) => n)
        : [];
      const sorted = applyRules(p.transactions.map((t) => (t.category && t.kind ? t : { ...t, category: null, kind: null })), rules, settings)
        .map((t, i) => (p.transactions[i].manual ? p.transactions[i] : t));
      const { fresh, duplicates } = splitNew(d.transactions, sorted);
      const coverage = mergeCoverage([...d.coverage, ...p.coverage]);
      const reviews = p.file?.reviews ?? [];
      const budgets = p.file?.budgets ?? [];
      await guard(async () => {
        if (incomingRules.length) await adapter.upsertRules(incomingRules);
        if (fresh.length || resorted.length) await adapter.upsertTransactions([...fresh, ...resorted]);
        await adapter.replaceCoverage(coverage);
        if (reviews.length) await adapter.upsertReviews(reviews);
        if (budgets.length) await adapter.upsertBudgets(budgets);
        if (p.file?.settings) await adapter.saveSettings(settings);
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
    backup() {
      const d = dataRef.current;
      return { app: 'family-budget', version: 1, exported: new Date().toISOString(),
        transactions: d.transactions, coverage: d.coverage, reviews: d.reviews, budgets: d.budgets, rules: d.rules, settings: d.settings };
    },
    async resetLocal() {
      if (adapter.kind !== 'local') return;
      const { clearLocal } = await import('./adapters/local');
      clearLocal();
      await load();
    },
  }), [data, status, error, adapter, email, saving, guard, load]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
