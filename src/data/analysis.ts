import { CATEGORY, KEEP_CATEGORIES, SPEND_CATEGORIES } from './categories';
import { merchantOf } from './merchant';
import type { BudgetLine, Coverage, Data, Settings, Transaction } from './types';

export const monthOf = (date: string) => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

const shiftDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** A month is complete when every core account's statements cover it (2 days' slack at each end). */
export function monthCoverage(month: string, coverage: Coverage[], settings: Settings) {
  const start = `${month}-01`, end = lastDay(month);
  const core = settings.accounts.filter((a) => a.core);
  const missing = core.filter((a) => !coverage.some((c) => c.account === a.key && c.from <= shiftDays(start, 2) && c.to >= shiftDays(end, -2)));
  return { complete: missing.length === 0, missing: missing.map((a) => a.name) };
}

export function budgetFor(budgets: BudgetLine[], category: string, month: string): number {
  let best: BudgetLine | undefined;
  for (const b of budgets) if (b.category === category && b.from <= month && (!best || b.from > best.from)) best = b;
  return best?.amount ?? 0;
}

export function totalBudget(budgets: BudgetLine[], month: string): number {
  return SPEND_CATEGORIES.reduce((s, c) => s + budgetFor(budgets, c.id, month), 0);
}

export function keepBudget(budgets: BudgetLine[], month: string): number {
  return KEEP_CATEGORIES.reduce((s, c) => s + budgetFor(budgets, c.id, month), 0);
}

export interface MonthSummary {
  month: string;
  complete: boolean;
  missing: string[];
  income: number;
  spend: number;
  invest: number;
  /** Money in minus money spent: what stayed with the family (savings, offset, shares). */
  kept: number;
  keptRate: number;
  needs: number;
  wants: number;
  /** Spending per category, positive = spent (refunds reduce it). */
  byCategory: Record<string, number>;
  /** The same, leaving out anything marked as a one-off. */
  byCategoryUsual: Record<string, number>;
  oneOffs: Transaction[];
  count: number;
}

export function summarise(month: string, data: Pick<Data, 'transactions' | 'coverage' | 'settings'>): MonthSummary {
  const txs = data.transactions.filter((t) => monthOf(t.date) === month);
  const s: MonthSummary = {
    month, ...monthCoverage(month, data.coverage, data.settings), income: 0, spend: 0, invest: 0, kept: 0, keptRate: 0,
    needs: 0, wants: 0, byCategory: {}, byCategoryUsual: {}, oneOffs: [], count: txs.length,
  };
  for (const t of txs) {
    if (t.kind === 'income') s.income += t.amount;
    else if (t.kind === 'invest') s.invest += -t.amount;
    else if (t.kind === 'spend') {
      const cat = t.category ?? 'other';
      s.byCategory[cat] = (s.byCategory[cat] ?? 0) - t.amount;
      if (t.oneOff) s.oneOffs.push(t);
      else s.byCategoryUsual[cat] = (s.byCategoryUsual[cat] ?? 0) - t.amount;
      s.spend -= t.amount;
      if (CATEGORY[cat]?.type === 'need') s.needs -= t.amount; else s.wants -= t.amount;
    }
  }
  s.kept = s.income - s.spend;
  s.keptRate = s.income > 0 ? s.kept / s.income : 0;
  return s;
}

export function allMonths(txs: Transaction[]): string[] {
  if (!txs.length) return [];
  let min = txs[0].date, max = txs[0].date;
  for (const t of txs) { if (t.date < min) min = t.date; if (t.date > max) max = t.date; }
  return monthRange(monthOf(min), monthOf(max));
}

/** Months with every core account loaded, oldest first. */
export function completeMonths(data: Pick<Data, 'transactions' | 'coverage' | 'settings'>): string[] {
  return allMonths(data.transactions).filter((m) => monthCoverage(m, data.coverage, data.settings).complete);
}

export function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export interface Recurring {
  merchant: string;
  category: string;
  months: number;
  /** Typical monthly cost. */
  monthly: number;
  yearly: number;
  last: string;
  every: 'month' | 'year' | 'irregular';
}

/** Find things paid again and again: subscriptions and memberships.
 *  Looks at everything up to `upTo` to tell monthly from yearly, and drops anything not paid for 3 months (likely cancelled). */
export function findRecurring(txs: Transaction[], upTo?: string, categories: string[] = ['subscriptions', 'property-tools', 'entertainment']): Recurring[] {
  const by = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.kind !== 'spend' || t.amount >= 0 || !t.category || !categories.includes(t.category)) continue;
    if (upTo && monthOf(t.date) > upTo) continue;
    const m = merchantOf(t.description);
    by.set(m, [...(by.get(m) ?? []), t]);
  }
  const end = upTo ?? txs.reduce((a, t) => (monthOf(t.date) > a ? monthOf(t.date) : a), '0000-00');
  const out: Recurring[] = [];
  for (const [merchant, list] of by) {
    const months = new Set(list.map((t) => monthOf(t.date)));
    const last = list.map((t) => t.date).sort().at(-1)!;
    const amounts = list.map((t) => -t.amount).sort((a, b) => a - b);
    const typical = amounts[Math.floor(amounts.length / 2)];
    const category = list[0].category!;
    // Games and outings only count when they repeat; a yearly charge is one of $50 or more.
    const every: Recurring['every'] = months.size >= 2 ? 'month' : typical >= 50 ? 'year' : 'irregular';
    if (every === 'irregular' || (category === 'entertainment' && every !== 'month')) continue;
    if (every === 'month' && monthOf(last) < addMonths(end, -2)) continue;
    // Monthly cost: typical payment times how many payments land in a month.
    const perMonth = every === 'month' ? list.length / months.size : 1 / 12;
    const monthly = typical * perMonth;
    if (monthly < 1) continue;
    out.push({ merchant, category, months: months.size, monthly, yearly: monthly * 12, last, every });
  }
  return out.sort((a, b) => b.yearly - a.yearly);
}

export function cashOnHand(settings: Settings): { total: number; asOf: string | null } {
  const latest = new Map<string, { date: string; amount: number }>();
  for (const b of settings.balances) {
    const cur = latest.get(b.account);
    if (!cur || b.date > cur.date) latest.set(b.account, b);
  }
  let total = 0, asOf: string | null = null;
  for (const b of latest.values()) { total += b.amount; if (!asOf || b.date > asOf) asOf = b.date; }
  return { total, asOf };
}
