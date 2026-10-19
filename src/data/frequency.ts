import { addMonths, budgetFor, lastDay, monthOf, withSplits } from './analysis';
import { findBills } from './bills';
import { CATEGORY } from './categories';
import type { Data, Every, Settings } from './types';
import { PER_MONTH } from './wealth';

/** How often a budget line is paid. Budgets are stored as monthly equivalents; this says how the money actually goes out. */
export interface Freq { every: Every; due?: string }

export const EVERY_WORDS: Record<Every, string> = {
  week: 'Each week', fortnight: 'Each fortnight', month: 'Each month', term: 'Each term', quarter: 'Each quarter', year: 'Each year',
};
export const EVERY_UNIT: Record<Every, string> = { week: 'week', fortnight: 'fortnight', month: 'month', term: 'term', quarter: 'quarter', year: 'year' };
export const EVERY_ORDER: Every[] = ['week', 'fortnight', 'month', 'term', 'quarter', 'year'];

/** Paid in lumps a few times a year (term, quarter, year): these are timed in the forecast and checked over their period. */
export const lumpy = (e: Every) => e === 'term' || e === 'quarter' || e === 'year';

export const freqOf = (s: Settings, cat: string): Freq => s.budgetEvery?.[cat] ?? { every: 'month' };

const monthsBetween = (a: string, b: string) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };

/** A month it's due. School terms are counted like quarters starting January (Jan, Apr, Jul, Oct) unless the family picked another month. */
export function anchor(f: Freq): string | undefined {
  if (f.due) return f.due;
  if (f.every === 'term' || f.every === 'quarter') return '2026-01';
  return undefined;
}

/** Is a lumpy line due this month? Yearly lines with no month set aren't timed (they're spread evenly). */
export function dueIn(f: Freq, month: string): boolean {
  const a = anchor(f);
  if (!lumpy(f.every) || !a) return false;
  const step = f.every === 'year' ? 12 : 3;
  return ((monthsBetween(a, month) % step) + step) % step === 0;
}

/** The next month a lumpy line is due, from a month on. */
export function nextDue(f: Freq, from: string): string | undefined {
  if (!lumpy(f.every) || !anchor(f)) return undefined;
  for (let m = from, i = 0; i < 13; m = addMonths(m, 1), i++) if (dueIn(f, m)) return m;
  return undefined;
}

/** The amount each time it's paid, from the monthly budget: $230 a month → $690 a term. */
export const perTime = (monthly: number, every: Every) => {
  const x = monthly / PER_MONTH[every];
  // Budgets are kept to the cent as monthly amounts, so $569 a term comes back as $569.01: show the round figure.
  return Math.abs(x - Math.round(x)) < 0.05 ? Math.round(x) : Math.round(x * 100) / 100;
};
/** And back: $690 a term → $230 a month. */
export const monthlyOf = (per: number, every: Every) => Math.round(per * PER_MONTH[every] * 100) / 100;

/** Changing how often a line is paid keeps the amount the family typed: $410 each month becomes $410 each term,
 *  so the monthly budget changes, not the figure on screen. */
export const switchEvery = (monthly: number, from: Every, to: Every) => monthlyOf(perTime(monthly, from), to);

/** What a category is planned to cost in the forecast for one month: weekly and monthly lines evenly, lumpy lines in the month they're due. */
export function scheduled(data: Pick<Data, 'budgets' | 'settings'>, cat: string, month: string): number {
  const f = freqOf(data.settings, cat);
  const monthly = budgetFor(data.budgets, cat, month);
  if (!lumpy(f.every)) return monthly;
  if (f.every === 'year' && !anchor(f)) return monthly;
  return dueIn(f, month) ? perTime(monthly, f.every) : 0;
}

export interface Allowance {
  freq: Freq;
  /** The planned amount each time it's paid. */
  per: number;
  /** The months the check looks at: this month, or for lumpy lines the term/quarter/year up to it. */
  months: string[];
  /** What the plan allows over those months (a payment due next month may already have gone out). */
  allowed: number;
  due: boolean;
}

/** What the budget allows for a category, compared like with like: a weekly line allows up to five payments in a month,
 *  a fortnightly one three, and a term, quarter or year line its payments over the period (one paid a month early is fine). */
export function allowance(data: Pick<Data, 'budgets' | 'settings'>, cat: string, month: string): Allowance {
  const freq = freqOf(data.settings, cat);
  const monthly = budgetFor(data.budgets, cat, month);
  const per = perTime(monthly, freq.every);
  const days = Number(lastDay(month).slice(8, 10));
  if (!lumpy(freq.every)) {
    const allowed = freq.every === 'week' ? per * Math.ceil(days / 7) : freq.every === 'fortnight' ? per * Math.ceil(days / 14) : monthly;
    return { freq, per, months: [month], allowed, due: true };
  }
  const n = freq.every === 'year' ? 12 : 3;
  const months = Array.from({ length: n }, (_, i) => addMonths(month, i - n + 1));
  if (freq.every === 'year' && !anchor(freq)) return { freq, per, months, allowed: per, due: false };
  const dues = [...months, addMonths(month, 1)].filter((m) => dueIn(freq, m)).length;
  return { freq, per, months, allowed: per * dues, due: dueIn(freq, month) };
}

export interface Suggestion { every: Every; per: number; due?: string; why: string }

/** Guess how a category is paid from the statements: a regular bill (weekly cleaner, fortnightly swimming, yearly rego),
 *  or term fees for kids and school (a few lumps a year). Only offered when it differs from what's set. */
export function suggest(data: Pick<Data, 'transactions' | 'settings'>, cat: string, today: string): Suggestion | null {
  const txs = withSplits(data.transactions, data.settings.splits).filter((t) => t.category === cat && t.kind === 'spend' && t.amount < 0 && !t.oneOff && t.date >= `${addMonths(monthOf(today), -12)}-01`);
  if (txs.length < 2) return null;
  const total = -txs.reduce((a, t) => a + t.amount, 0);
  const bills = findBills(txs, today).filter((b) => b.category === cat).sort((a, b) => b.yearly - a.yearly);
  const span = Math.max(3, monthsBetween(monthOf(txs.map((t) => t.date).sort()[0]), monthOf(today)) + 1);
  const b = bills[0];
  if (b && b.every !== 'month' && b.yearly >= (total * 12 / span) * 0.8) {
    const due = b.every === 'quarter' || b.every === 'year' ? monthOf(b.next) : undefined;
    return { every: b.every, per: Math.round(b.amount * 100) / 100, due, why: `${b.name}, ${b.every === 'week' ? 'weekly' : b.every === 'fortnight' ? 'every fortnight' : b.every === 'quarter' ? 'every three months' : 'once a year'} in your statements` };
  }
  // Term fees: kids and school categories paid in a few lumps rather than every month.
  const byMonth = new Map<string, number>();
  for (const t of txs) byMonth.set(monthOf(t.date), (byMonth.get(monthOf(t.date)) ?? 0) - t.amount);
  const lumps = [...byMonth.entries()].filter(([, v]) => v >= 100).sort((a, b) => a[0].localeCompare(b[0]));
  const kids = (CATEGORY[cat]?.groupKey ?? CATEGORY[cat]?.group) === 'Kids & school';
  if (kids && lumps.length >= 1 && byMonth.size <= Math.ceil(span / 2) && lumps.reduce((a, [, v]) => a + v, 0) >= total * 0.75) {
    // The term a payment covers: the nearest of Jan, Apr, Jul, Oct (fees are often paid a few weeks early).
    const termOf = (ym: string) => {
      const m = Number(ym.slice(5)), y = Number(ym.slice(0, 4));
      const t = [1, 4, 7, 10, 13].reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
      return t === 13 ? `${y + 1}-01` : `${y}-${String(t).padStart(2, '0')}`;
    };
    const terms = new Set([...byMonth.keys()].map(termOf));
    const per = Math.round(total / terms.size);
    const due = addMonths([...terms].sort().at(-1)!, 3);
    return { every: 'term', per, due, why: `about ${terms.size === 1 ? 'one term' : `${terms.size} terms`} of fees in the last year (${lumps.map(([mm, v]) => `$${Math.round(v)} in ${new Date(mm + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'short' })}`).join(', ')})` };
  }
  return null;
}

/** The figure to draw a month's bar against: the month's budget, up to five weekly or three fortnightly payments,
 *  or for a term, quarter or year line the amount due (once something is paid or it's due). */
export function meterLimit(data: Pick<Data, 'budgets' | 'settings'>, cat: string, month: string, spent: number): number {
  const al = allowance(data, cat, month);
  if (!lumpy(al.freq.every)) return al.allowed;
  return al.due || spent > 0 ? al.per : budgetFor(data.budgets, cat, month);
}

/** Was this month's term, quarter or year payment already made in the two months before (fees are often paid early)? */
export function paidAhead(data: Pick<Data, 'transactions' | 'settings' | 'budgets'>, cat: string, month: string): boolean {
  const f = freqOf(data.settings, cat);
  if (!lumpy(f.every) || !dueIn(f, month)) return false;
  const per = perTime(budgetFor(data.budgets, cat, month), f.every);
  const before = [addMonths(month, -2), addMonths(month, -1)];
  const paid = -withSplits(data.transactions, data.settings.splits).filter((t) => t.category === cat && t.kind === 'spend' && before.includes(monthOf(t.date))).reduce((a, t) => a + t.amount, 0);
  return per > 0 && paid >= per * 0.8;
}

/** The next month a payment is still to be made: skips a term already paid early. */
export function nextUnpaid(data: Pick<Data, 'transactions' | 'settings' | 'budgets'>, cat: string, from: string): string | undefined {
  const f = freqOf(data.settings, cat);
  let m = nextDue(f, from);
  if (m && paidAhead(data, cat, m)) m = nextDue(f, addMonths(m, 1));
  return m;
}
