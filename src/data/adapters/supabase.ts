import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../../config';
import type { BudgetLine, Coverage, Kind, Payee, Review, Rule, Settings, Transaction } from '../types';
import type { Adapter, Loaded } from './adapter';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

const txToRow = (t: Transaction) => ({
  id: t.id, date: t.date, account: t.account, description: t.description, amount: t.amount,
  category: t.category, kind: t.kind, note: t.note ?? null, one_off: !!t.oneOff, manual: !!t.manual,
  needs_review: !!t.needsReview, source: t.source ?? null, updated_at: new Date().toISOString(),
});
const rowToTx = (r: any): Transaction => ({
  id: r.id, date: r.date, account: r.account, description: r.description, amount: Number(r.amount),
  category: r.category, kind: r.kind as Kind | null, note: r.note, oneOff: r.one_off, manual: r.manual,
  needsReview: r.needs_review, source: r.source,
});

async function check<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message || 'The database refused the request.');
  return data;
}

async function inBatches<T>(items: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

async function all(table: string, order: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = await check(supabase().from(table).select('*').order(order).range(from, from + 999));
    out.push(...(rows as any[]));
    if ((rows as any[]).length < 1000) break;
  }
  return out;
}

export const supabaseAdapter: Adapter = {
  kind: 'supabase',
  async load(): Promise<Loaded> {
    const [tx, rules, budgets, coverage, settings, reviews] = await Promise.all([
      all('transactions', 'date'), all('rules', 'created_at'), all('budgets', 'category'),
      all('coverage', 'account'), all('settings', 'key'), all('reviews', 'month'),
    ]);
    return {
      transactions: tx.map(rowToTx),
      rules: rules.map((r) => ({ id: r.id, pattern: r.pattern, category: r.category, kind: r.kind, sign: r.sign ?? undefined, account: r.account ?? undefined, user: true })),
      budgets: budgets.map((b) => ({ category: b.category, from: b.from_month, amount: Number(b.amount) })),
      coverage: coverage.map((c) => ({ account: c.account, from: c.from_date, to: c.to_date })),
      settings: (settings.find((s) => s.key === 'settings')?.value as Settings) ?? null,
      reviews: reviews.map((r) => ({ id: r.id, month: r.month, title: r.title, body: r.body, author: r.author, created: r.created })),
      // The payee list is kept as its own record in the settings table.
      payees: (settings.find((s) => s.key === 'payees')?.value as Payee[]) ?? [],
    };
  },
  async upsertTransactions(txs) {
    await inBatches(txs, 500, (b) => check(supabase().from('transactions').upsert(b.map(txToRow))));
  },
  async deleteTransactions(ids) {
    await inBatches(ids, 200, (b) => check(supabase().from('transactions').delete().in('id', b)));
  },
  async upsertRules(rules: Rule[]) {
    await check(supabase().from('rules').upsert(rules.map((r) => ({ id: r.id, pattern: r.pattern, category: r.category, kind: r.kind, sign: r.sign ?? null, account: r.account ?? null }))));
  },
  async deleteRule(id) { await check(supabase().from('rules').delete().eq('id', id)); },
  async upsertBudgets(lines: BudgetLine[]) {
    await check(supabase().from('budgets').upsert(lines.map((b) => ({ category: b.category, from_month: b.from, amount: b.amount }))));
  },
  async replaceCoverage(list: Coverage[]) {
    await check(supabase().from('coverage').delete().neq('account', ''));
    if (list.length) await check(supabase().from('coverage').insert(list.map((c) => ({ account: c.account, from_date: c.from, to_date: c.to }))));
  },
  async saveSettings(s) {
    await check(supabase().from('settings').upsert({ key: 'settings', value: s, updated_at: new Date().toISOString() }));
  },
  async upsertReviews(r: Review[]) {
    await check(supabase().from('reviews').upsert(r.map((x) => ({ id: x.id, month: x.month, title: x.title, body: x.body, author: x.author, created: x.created }))));
  },
  async deleteReview(id) { await check(supabase().from('reviews').delete().eq('id', id)); },
  async savePayees(p) {
    await check(supabase().from('settings').upsert({ key: 'payees', value: p, updated_at: new Date().toISOString() }));
  },
};
