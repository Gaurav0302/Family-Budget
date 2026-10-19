import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../../config';
import type { Activity, BudgetLine, Coverage, Kind, Payee, Review, Rule, Settings, Transaction } from '../types';
import { addActivity, type Adapter, type Loaded } from './adapter';

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

/** Every row of a table, 1,000 at a time. `order` must be unique (or end in a unique column) so no row is skipped or repeated
 *  between pages. */
async function all(table: string, order: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase().from(table).select('*');
    for (const o of order) q = q.order(o);
    const rows = await check(q.range(from, from + 999));
    out.push(...(rows as any[]));
    if ((rows as any[]).length < 1000) break;
  }
  return out;
}

/** Each settings record as this device last saw it in the database, and when it was saved. A save only goes through if
 *  nobody saved since; the change is always applied to this stored copy, never to an older copy held by a screen. */
const stamps: Record<string, string | null> = {};
const stored: Record<string, unknown> = {};

/** Save one settings record safely between devices and people. `build` makes the new value from the latest stored copy
 *  (it applies just this change). If someone else saved in between, their copy is fetched and `build` runs again on it.
 *  Trying a failed save again works the same way, so it can never put back an old copy over someone else's change. */
async function saveRecord<T>(key: string, build: (latest: T | undefined) => T): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = build(stored[key] as T | undefined);
    const now = new Date().toISOString();
    const stamp = stamps[key];
    if (stamp == null) {
      const { error } = await supabase().from('settings').insert({ key, value: next, updated_at: now });
      if (!error) { stamps[key] = now; stored[key] = next; return next; }
      if (error.code !== '23505' && !/duplicate|conflict/i.test(error.message ?? '')) throw new Error(error.message || 'The database refused the save.');
    } else {
      const rows = await check(supabase().from('settings').update({ value: next, updated_at: now }).eq('key', key).eq('updated_at', stamp).select('key'));
      if ((rows as unknown[]).length) { stamps[key] = now; stored[key] = next; return next; }
    }
    const theirs = await check(supabase().from('settings').select('value, updated_at').eq('key', key).maybeSingle());
    stamps[key] = (theirs as any)?.updated_at ?? null;
    stored[key] = (theirs as any)?.value;
  }
  throw new Error('Someone else is saving at the same moment. Try again in a few seconds.');
}

/** Re-apply one change to the payee list (what was added, edited and removed since `base`) on top of someone else's newer list. */
export function rebasePayees(mine: Payee[], base: Payee[], theirs: Payee[]): Payee[] {
  const before = new Map(base.map((p) => [p.id, JSON.stringify(p)]));
  const now = new Map(mine.map((p) => [p.id, p]));
  const removed = new Set(base.filter((p) => !now.has(p.id)).map((p) => p.id));
  const touched = mine.filter((p) => before.get(p.id) !== JSON.stringify(p));
  const out = theirs.filter((p) => !removed.has(p.id)).map((p) => touched.find((t) => t.id === p.id) ?? p);
  for (const t of touched) if (!out.some((p) => p.id === t.id)) out.push(t);
  return out;
}

export const supabaseAdapter: Adapter = {
  kind: 'supabase',
  async load(): Promise<Loaded> {
    const [tx, rules, budgets, coverage, settings, reviews] = await Promise.all([
      all('transactions', ['date', 'id']), all('rules', ['created_at', 'id']), all('budgets', ['category', 'from_month']),
      all('coverage', ['account', 'from_date', 'to_date']), all('settings', ['key']), all('reviews', ['month', 'id']),
    ]);
    for (const r of settings) { stamps[r.key] = r.updated_at; stored[r.key] = r.value; }
    return {
      transactions: tx.map(rowToTx),
      rules: rules.map((r) => ({ id: r.id, pattern: r.pattern, category: r.category, kind: r.kind, sign: r.sign ?? undefined, account: r.account ?? undefined, user: true })),
      budgets: budgets.map((b) => ({ category: b.category, from: b.from_month, amount: Number(b.amount) })),
      coverage: coverage.map((c) => ({ account: c.account, from: c.from_date, to: c.to_date })),
      settings: (settings.find((s) => s.key === 'settings')?.value as Settings) ?? null,
      reviews: reviews.map((r) => ({ id: r.id, month: r.month, title: r.title, body: r.body, author: r.author, created: r.created })),
      // The payee list is kept as its own record in the settings table.
      payees: (settings.find((s) => s.key === 'payees')?.value as Payee[]) ?? [],
      activity: (settings.find((s) => s.key === 'activity')?.value as Activity[]) ?? [],
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
  // Add the new spans first, then remove the old ones that aren't in the list: if anything fails part-way, coverage is never
  // left empty (overlapping spans are merged again when the app loads).
  async replaceCoverage(list: Coverage[]) {
    const rows = list.map((c) => ({ account: c.account, from_date: c.from, to_date: c.to }));
    if (rows.length) await check(supabase().from('coverage').upsert(rows, { onConflict: 'account,from_date,to_date', ignoreDuplicates: true }));
    const keep = new Set(rows.map((r) => `${r.account}|${r.from_date}|${r.to_date}`));
    const old = (await check(supabase().from('coverage').select('account, from_date, to_date'))) as any[];
    for (const r of old) if (!keep.has(`${r.account}|${r.from_date}|${r.to_date}`))
      await check(supabase().from('coverage').delete().eq('account', r.account).eq('from_date', r.from_date).eq('to_date', r.to_date));
  },
  saveSettings(s, patch, rebuild) {
    return saveRecord<Settings>('settings', (latest) => (latest && rebuild ? { ...latest, ...rebuild(latest) } : patch && latest ? { ...latest, ...patch } : s));
  },
  async upsertReviews(r: Review[]) {
    await check(supabase().from('reviews').upsert(r.map((x) => ({ id: x.id, month: x.month, title: x.title, body: x.body, author: x.author, created: x.created }))));
  },
  async deleteReview(id) { await check(supabase().from('reviews').delete().eq('id', id)); },
  savePayees(p, base) {
    return saveRecord<Payee[]>('payees', (latest) => (base && latest ? rebasePayees(p, base, latest) : p));
  },
  logActivity(a) {
    return saveRecord<Activity[]>('activity', (latest) => addActivity(latest ?? [], a));
  },
};
