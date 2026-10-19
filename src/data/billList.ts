import { addMonths, lastDay, monthOf, withSplits } from './analysis';
import { addEvery, findBills, manualBills, type FoundBill } from './bills';
import { propertiesOf, repaymentOf } from './property';
import type { Data } from './types';

/** A bill as the Bills page and the calendar file show it. */
export type ListedBill = FoundBill & {
  /** A loan repayment the Property plan knows about, before it shows up in statements. */
  fromPlan?: boolean;
  /** Starts later, so `yearly` counts only the payments in the next 12 months. */
  partYear?: boolean;
  /** The last month it's paid (the budget drops to $0 after: rent once the lease ends). */
  stopsAfter?: string;
};

const monthsFrom = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
/** The next monthly date on or after today, keeping the day of the month (clamped to short months). */
const rollMonthly = (first: string, today: string) => { let k = 1, d = addEvery(first, 'month', k); while (d < today) d = addEvery(first, 'month', ++k); return d; };

/** Every regular bill: found in statements, added by hand, and each property's loan repayment from the plan. Soonest first. */
export function billList(data: Pick<Data, 'transactions' | 'settings' | 'budgets'>, today: string, found = findBills(withSplits(data.transactions, data.settings.splits), today)): ListedBill[] {
  const manual = manualBills(data.settings.bills ?? [], today);
  // Once repayments show up in the statements, the statements' version is used instead.
  const loans: ListedBill[] = found.some((b) => b.category === 'mortgage') ? [] : propertiesOf(data.settings, data.budgets).filter((p) => p.loan && !p.soldOn).map((p) => {
    // The settlement day in the first repayment month, clamped to that month's length (no 30 February).
    const fm = p.loan!.firstRepayment || monthOf(p.settlement);
    const first = `${fm}-${String(Math.min(Number(p.settlement.slice(8, 10)), Number(lastDay(fm).slice(8, 10)))).padStart(2, '0')}`;
    const next = first >= today ? first : rollMonthly(first, today);
    const amount = Math.round(repaymentOf(p.loan!));
    // Repayments that start later only count the payments of the next 12 months.
    const months = Math.max(0, Math.min(12, 12 - monthsFrom(monthOf(today), monthOf(next)) + (next.slice(8) <= today.slice(8) ? 1 : 0)));
    return { key: `loan|${p.id}`, name: `${p.name} loan repayment`, category: 'mortgage', every: 'month', amount, varies: false, last: '', next, yearly: amount * months, fromPlan: true, partYear: months < 12 };
  });
  // A bill whose budget drops to $0 later stops then; its yearly cost counts only the months left.
  const stops = (cat: string) => data.budgets.filter((b) => b.category === cat && b.from > monthOf(today) && b.amount === 0).map((b) => b.from).sort()[0];
  return [...found, ...manual, ...loans].map((b): ListedBill => {
    const stop = stops(b.category);
    if (!stop) return b;
    const left = Math.max(0, Math.min(12, monthsFrom(monthOf(today), stop)));
    return { ...b, stopsAfter: addMonths(stop, -1), yearly: (b.yearly / 12) * left };
  }).sort((a, b) => a.next.localeCompare(b.next));
}
