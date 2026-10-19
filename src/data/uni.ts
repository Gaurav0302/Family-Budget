import { addMonths } from './analysis';
import type { UniFund } from './types';
import { thisMonth } from '../lib/format';

/** What a child's fund puts aside in a month: its monthly amount, with any changes (from a month on, or for a while). */
export function monthlyAt(f: UniFund, m: string): number {
  let v = f.monthly;
  const ch = [...(f.changes ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  for (const c of ch) if (!c.until && c.month <= m) v = c.monthly;
  for (const c of ch) if (c.until && c.month <= m && m <= c.until) v = c.monthly;
  return v;
}

/** Where a fund starts from: its latest balance check-in, else "saved so far". */
export const latestBalance = (f: UniFund) => {
  const c = [...(f.checkIns ?? [])].sort((a, b) => a.month.localeCompare(b.month)).at(-1);
  return c ? { month: c.month, amount: c.amount } : { month: f.savedOn?.slice(0, 7) ?? thisMonth(), amount: f.saved };
};

/** A fund's balance month by month from its latest real balance: the monthly saving from its start, growing at `rate`% a year,
 *  then drawn evenly over the years at uni. */
export function uniPath(f: UniFund, start: string, rate: number, years: number, until: string): { month: string; value: number }[] {
  const out: { month: string; value: number }[] = [];
  const uni = `${f.year}-02`;
  const end = addMonths(uni, years * 12);
  const from = latestBalance(f);
  let bal = from.amount, draw = 0;
  for (let m = addMonths(from.month, 1); m <= until && m <= end; m = addMonths(m, 1)) {
    if (m < uni) bal = bal * (1 + rate / 1200) + (m >= start ? monthlyAt(f, m) : 0);
    else { if (m === uni) draw = bal / (years * 12); bal = Math.max(0, bal - draw); }
    if (m >= thisMonth()) out.push({ month: m, value: bal });
  }
  return out;
}

/** The monthly amount that reaches the goal by the time uni starts, at the fund's growth rate. */
export function monthlyForGoal(f: UniFund, start: string, rate: number): number {
  const from = latestBalance(f);
  const begin = start > from.month ? start : addMonths(from.month, 1);
  const months = Math.max(1, (f.year * 12 + 1) - (Number(begin.slice(0, 4)) * 12 + Number(begin.slice(5)) - 1));
  const i = rate / 1200;
  const grown = from.amount * Math.pow(1 + i, months);
  const need = Math.max(0, f.target - grown);
  return i === 0 ? need / months : (need * i) / (Math.pow(1 + i, months) - 1);
}

