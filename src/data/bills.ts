import { CATEGORY } from './categories';
import { merchantOf } from './merchant';
import type { Bill, Every, Transaction } from './types';
import { PER_YEAR } from './wealth';

/** Spending that changes every time, so it isn't treated as a bill. */
const NOT_BILLS = ['groceries', 'takeaway', 'eating-out', 'shopping', 'fuel', 'public-transport', 'cash', 'other', 'card-unitemised', 'gifts', 'social', 'clothes', 'rideshare', 'tolls-parking', 'medical', 'pharmacy', 'travel'];

export interface FoundBill {
  key: string;
  name: string;
  category: string;
  every: Every;
  amount: number;          // latest payment
  varies: boolean;         // amount moves around (e.g. electricity)
  last: string;
  next: string;
  yearly: number;
  rise?: { from: number; to: number; since: string };
  manual?: boolean;
}

const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 864e5;
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + Math.round(n)); return x.toISOString().slice(0, 10); };
export function addEvery(d: string, every: Every): string {
  const x = new Date(d + 'T00:00:00Z');
  if (every === 'week') x.setUTCDate(x.getUTCDate() + 7);
  else if (every === 'fortnight') x.setUTCDate(x.getUTCDate() + 14);
  else x.setUTCMonth(x.getUTCMonth() + (every === 'month' ? 1 : every === 'quarter' || every === 'term' ? 3 : 12));
  return x.toISOString().slice(0, 10);
}

function classify(gap: number): Every | null {
  if (gap >= 5 && gap <= 9) return 'week';
  if (gap >= 11 && gap <= 17) return 'fortnight';
  if (gap >= 25 && gap <= 36) return 'month';
  if (gap >= 80 && gap <= 100) return 'quarter';
  if (gap >= 340 && gap <= 390) return 'year';
  return null;
}

const nameFor = (t: Transaction) => {
  const m = merchantOf(t.description);
  return /bpay|managed app|netbank|transfer/i.test(m) ? CATEGORY[t.category ?? '']?.label ?? m : m;
};

/** Find regular bills in the statements: same payee, regular gaps, similar amounts. Also spots price rises. */
export function findBills(txs: Transaction[], today: string): FoundBill[] {
  const groups = new Map<string, Map<string, number>>();
  const cats = new Map<string, string>();
  for (const t of txs) {
    if (t.kind !== 'spend' || t.amount >= 0 || !t.category || NOT_BILLS.includes(t.category) || t.oneOff) continue;
    const key = `${t.category}|${nameFor(t)}`;
    const days = groups.get(key) ?? new Map<string, number>();
    days.set(t.date, (days.get(t.date) ?? 0) - t.amount);   // same-day payments to the same payee count as one
    groups.set(key, days);
    cats.set(key, t.category);
  }
  const out: FoundBill[] = [];
  for (const [key, byDay] of groups) {
    const pays = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (pays.length < 3) continue;
    const gaps = pays.slice(1).map(([d], i) => days(pays[i][0], d));
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const every = classify(median);
    if (!every) continue;
    const regular = gaps.filter((g) => Math.abs(g - median) <= Math.max(4, median * 0.2)).length / gaps.length;
    if (regular < 0.6) continue;
    const amounts = pays.map(([, a]) => a);
    const recent = amounts.slice(-4);
    const mid = [...recent].sort((a, b) => a - b)[Math.floor(recent.length / 2)];
    const varies = (Math.max(...recent) - Math.min(...recent)) / mid > 0.15;
    const last = pays[pays.length - 1][0];
    if (days(last, today) > median * 2.5 + 10) continue;   // stopped: probably cancelled
    // Price rise: the latest steady amount against the previous steady amount (seen at least twice).
    let rise: FoundBill['rise'];
    if (!varies || every !== 'month') {
      const same = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) < 0.005;
      const runs: { amount: number; count: number; since: string }[] = [];
      for (const [d, a] of pays) {
        const r = runs[runs.length - 1];
        if (r && same(r.amount, a)) r.count++; else runs.push({ amount: a, count: 1, since: d });
      }
      const latest = runs[runs.length - 1];
      const prev = [...runs.slice(0, -1)].reverse().find((r) => r.count >= 2);
      if (prev && latest.amount > prev.amount * 1.01 && latest.amount - prev.amount >= 0.5) rise = { from: prev.amount, to: latest.amount, since: latest.since };
    }
    const amount = amounts[amounts.length - 1];
    let next = every === 'week' || every === 'fortnight' ? addDays(last, median) : addEvery(last, every);
    while (next < today) next = addEvery(next, every);
    out.push({ key, name: key.split('|')[1], category: cats.get(key)!, every, amount, varies, last, next,
      yearly: (varies ? recent.reduce((a, b) => a + b, 0) / recent.length : amount) * PER_YEAR[every], rise });
  }
  return out.sort((a, b) => a.next.localeCompare(b.next));
}

/** Bills added by hand, rolled forward to their next date. */
export function manualBills(bills: Bill[], today: string): FoundBill[] {
  return bills.map((b) => {
    let next = b.next;
    while (next < today) next = addEvery(next, b.every);
    return { key: `manual|${b.id}`, name: b.name, category: b.category, every: b.every, amount: b.amount, varies: false,
      last: '', next, yearly: b.amount * PER_YEAR[b.every], manual: true };
  });
}
