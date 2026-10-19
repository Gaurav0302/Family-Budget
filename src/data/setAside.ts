import { addMonths, budgetFor, lastDay, monthOf, shiftDays, statementAccounts, withSplits } from './analysis';
import { findBills } from './bills';
import { CATEGORY, label } from './categories';
import { anchor, freqOf, lumpy, nextUnpaid, perTime } from './frequency';
import { HOUSING_CATS } from './property';
import type { Data } from './types';

const monthsBetween = (a: string, b: string) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };

/** What was spent in a category in one month. */
const paidIn = (data: Pick<Data, 'transactions' | 'settings'>, cat: string, month: string) =>
  -withSplits(data.transactions, data.settings.splits).filter((t) => t.category === cat && t.kind === 'spend' && monthOf(t.date) === month).reduce((a, t) => a + t.amount, 0);

/** One big cost paid a few times a year (school term, rego, insurance), saved for a little each month: a sinking fund. */
export interface Pot {
  cat: string;
  label: string;
  /** What's paid each time. */
  per: number;
  /** Put aside each month. */
  monthly: number;
  /** The month it's next due (YYYY-MM). */
  due: string;
  monthsToGo: number;
  /** What should already be put aside by the end of `month`, saving evenly since the last payment. */
  target: number;
}

/** Every budget line paid in lumps that has a due month: how much should be put aside for it by the end of `month`.
 *  Yearly lines with no month set aren't included (the app can't tell when they fall). */
export function pots(data: Pick<Data, 'budgets' | 'settings' | 'transactions'>, month: string): { pots: Pot[]; total: number; unset: string[] } {
  const cats = [...new Set(data.budgets.map((b) => b.category))];
  const out: Pot[] = [], unset: string[] = [];
  for (const cat of cats) {
    const f = freqOf(data.settings, cat);
    const monthly = budgetFor(data.budgets, cat, month);
    if (!lumpy(f.every) || monthly <= 0 || CATEGORY[cat]?.keep) continue;
    if (!anchor(f)) { unset.push(cat); continue; }
    let due = nextUnpaid(data, cat, month);
    if (!due) continue;
    // Already paid in the month it's due: the next one is what to save for now.
    if (due === month && paidIn(data, cat, month) >= perTime(budgetFor(data.budgets, cat, month), f.every) * 0.8) due = nextUnpaid(data, cat, addMonths(month, 1));
    if (!due) continue;
    const step = f.every === 'year' ? 12 : 3;
    const per = perTime(budgetFor(data.budgets, cat, due), f.every);
    const monthsToGo = Math.max(0, monthsBetween(month, due));
    // Saving starts the month after the last payment: with 2 of 3 months to go, a third is aside by the end of this month.
    // Paid early, the next one can be more than a period away: nothing to put aside yet.
    const target = Math.round(per * Math.max(0, Math.min(1, (step - monthsToGo) / step)));
    out.push({ cat, label: label(cat), per, monthly: Math.round(per / step), due, monthsToGo, target });
  }
  out.sort((a, b) => a.due.localeCompare(b.due) || b.per - a.per);
  return { pots: out, total: out.reduce((a, p) => a + p.target, 0), unset };
}

/** Day-to-day spending: food, shopping, fuel and the like. Not housing, regular bills, money kept or lumpy costs. */
export function dayToDayCats(data: Pick<Data, 'budgets' | 'settings' | 'transactions'>, today: string): string[] {
  const billCats = new Set(findBills(withSplits(data.transactions, data.settings.splits), today).map((b) => b.category));
  for (const b of data.settings.bills ?? []) billCats.add(b.category);
  const month = monthOf(today);
  return [...new Set(data.budgets.map((b) => b.category))].filter((c) => {
    const cat = CATEGORY[c];
    return cat && !cat.system && !cat.keep && !HOUSING_CATS.includes(c) && !billCats.has(c) && !lumpy(freqOf(data.settings, c).every) && budgetFor(data.budgets, c, month) > 0;
  });
}

export interface SafeToSpend {
  /** Planned for day-to-day spending this month. */
  planned: number;
  /** Spent on it so far (as far as the statements go). */
  spent: number;
  /** The last day every needed account's statements cover this month, or null if any of them has nothing from this month yet. */
  asOf: string | null;
  /** Needed accounts with nothing from this month yet (then `spent` covers only the others, and `perWeek` is the plan's pace). */
  missing: string[];
  /** About this much a week until the month ends. */
  perWeek: number;
  daysLeft: number;
  cats: string[];
}

/** What's left of this month's day-to-day budget, spread over the weeks still to go. Without bank feeds the figure is only
 *  as fresh as the last statement added, so `asOf` says up to when. */
export function safeToSpend(data: Pick<Data, 'budgets' | 'settings' | 'transactions' | 'coverage'>, today: string): SafeToSpend {
  const month = monthOf(today);
  const cats = dayToDayCats(data, today);
  const set = new Set(cats);
  // The plan's monthly amounts (weekly lines are kept as monthly equivalents), not the five-week ceiling bills are checked against.
  const planned = cats.reduce((a, c) => a + budgetFor(data.budgets, c, month), 0);
  const inMonth = withSplits(data.transactions, data.settings.splits).filter((t) => monthOf(t.date) === month);
  const spent = -inMonth.filter((t) => t.kind === 'spend' && t.category && set.has(t.category)).reduce((a, t) => a + t.amount, 0);
  // Fresh only as far as the slowest account: the same accounts that decide a complete month.
  const start = `${month}-01`;
  const marked = data.settings.accounts.filter((a) => a.core);
  const needed = (marked.length ? marked : statementAccounts(data.settings.accounts)).filter((a) => !a.closedOn || a.closedOn >= start);
  const upTo = needed.map((a) => ({ a, to: data.coverage.filter((c) => c.account === a.key && c.to >= shiftDays(start, 0)).reduce((m, c) => (c.to > m ? c.to : m), '') }));
  const missing = upTo.filter((x) => !x.to).map((x) => x.a.name);
  const asOf = missing.length || !upTo.length ? null : upTo.reduce((m, x) => (x.to < m ? x.to : m), today);
  const end = Number(lastDay(month).slice(8, 10));
  const daysLeft = Math.max(1, end - (asOf ? Number(asOf.slice(8, 10)) : 0));
  const perWeek = asOf ? Math.max(0, Math.round(((planned - spent) / daysLeft) * 7)) : Math.round((planned / end) * 7);
  return { planned: Math.round(planned), spent: Math.round(spent), asOf, missing, perWeek, daysLeft, cats };
}
