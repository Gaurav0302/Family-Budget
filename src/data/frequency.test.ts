import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { forecast } from './forecast';
import { allowance, dueIn, meterLimit, monthlyOf, nextDue, perTime, scheduled, suggest, switchEvery } from './frequency';
import { reviewMonth } from './review';
import type { BudgetLine, Data, Settings, Transaction } from './types';

const t = (date: string, amount: number, category: string, description = category): Transaction =>
  ({ id: `${date}:${category}:${amount}`, date, amount, description, account: 'a', category, kind: amount > 0 ? 'income' : 'spend' });

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  accounts: [{ key: 'a', name: 'Everyday', owner: 'A', type: 'everyday' }],
  balances: [{ account: 'a', date: '2026-09-30', amount: 20000 }],
  pay: [{ person: 'A', from: '2026-01', grossYearly: 100000, takeHome: 6000, every: 'month', superPct: 12, salarySacrifice: 0 }],
  budgetEvery: { 'kids-tennis': { every: 'term' }, cleaner: { every: 'week' } },
};
const BUDGETS: BudgetLine[] = [
  { category: 'kids-tennis', amount: 200, from: '2026-01' },       // $600 a term
  { category: 'cleaner', amount: monthlyOf(100, 'week'), from: '2026-01' },
  { category: 'groceries', amount: 2000, from: '2026-01' },
];
function sample(): Data {
  const transactions: Transaction[] = [];
  for (const m of ['2026-07', '2026-08', '2026-09']) transactions.push(t(`${m}-01`, 6000, 'salary'), t(`${m}-03`, -2000, 'groceries'));
  for (const d of ['2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23', '2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'])
    transactions.push(t(d, -100, 'cleaner', 'EXAMPLE CLEANING'));
  transactions.push(t('2026-07-20', -600, 'kids-tennis', 'EXAMPLE TENNIS'), t('2026-09-20', -600, 'kids-tennis', 'EXAMPLE TENNIS'));
  return { transactions, coverage: [], rules: [], budgets: BUDGETS, reviews: [], payees: [], settings: SETTINGS };
}

describe('frequencies', () => {
  it('counts a school term like a quarter, due January, April, July and October', () => {
    const f = { every: 'term' as const };
    expect(['2027-01', '2027-04', '2027-07', '2027-10'].every((m) => dueIn(f, m))).toBe(true);
    expect(dueIn(f, '2027-02')).toBe(false);
    expect(nextDue(f, '2026-11')).toBe('2027-01');
    expect(perTime(200, 'term')).toBeCloseTo(600, 6);
    expect(monthlyOf(110, 'week')).toBeCloseTo(476.67, 2);
  });
  it('keeps the amount typed when the frequency changes', () => {
    const m = switchEvery(410, 'month', 'term');          // $410 each month → $410 each term
    expect(perTime(m, 'term')).toBe(410);
    expect(m).toBeCloseTo(136.67, 2);
    expect(perTime(switchEvery(monthlyOf(39.7, 'fortnight'), 'fortnight', 'week'), 'week')).toBeCloseTo(39.7, 2);
  });
  it('times a yearly line in the month it is due', () => {
    const f = { every: 'year' as const, due: '2027-03' };
    expect(dueIn(f, '2027-03')).toBe(true);
    expect(dueIn(f, '2028-03')).toBe(true);
    expect(dueIn(f, '2027-04')).toBe(false);
  });
  it('allows five weekly payments in a long month', () => {
    const a = allowance(sample(), 'cleaner', '2026-07');
    expect(a.allowed).toBeCloseTo(500, 1);
  });
  it('checks a term fee over its term, allowing next term paid a month early', () => {
    const a = allowance(sample(), 'kids-tennis', '2026-09');
    expect(a.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(a.allowed).toBeCloseTo(1200, 6);   // July's term and October's (paid in September)
    expect(meterLimit(sample(), 'kids-tennis', '2026-08', 0)).toBeCloseTo(200, 6);
    expect(meterLimit(sample(), 'kids-tennis', '2026-09', 600)).toBeCloseTo(600, 6);
  });
  it('plans term fees in the months they are due', () => {
    expect(scheduled(sample(), 'kids-tennis', '2026-10')).toBeCloseTo(600, 6);
    expect(scheduled(sample(), 'kids-tennis', '2026-11')).toBe(0);
    expect(scheduled(sample(), 'groceries', '2026-11')).toBe(2000);
  });
});

describe('suggestions from the statements', () => {
  it('spots a weekly bill and term fees', () => {
    const d = { ...sample(), settings: { ...SETTINGS, budgetEvery: {} } };
    expect(suggest(d, 'cleaner', '2026-10-01')).toMatchObject({ every: 'week', per: 100 });
    expect(suggest(d, 'kids-tennis', '2026-10-01')).toMatchObject({ every: 'term', per: 600, due: '2027-01' });
    expect(suggest(d, 'groceries', '2026-10-01')).toBeNull();
  });
});

describe('using the timing', () => {
  it('takes term fees out of the average and puts them in the months they are due', () => {
    const f = forecast(sample(), { from: '2026-10' });
    const m = (x: string) => f.months.find((y) => y.month === x)!;
    // Usual spending is groceries and the cleaner (about $433 a month); tennis only when a term is due.
    expect(m('2026-11').living).toBeCloseTo(2000 + 1300 / 3, 0);
    expect(m('2026-10').timed).toEqual([]);   // October's term was paid in September
    expect(m('2026-11').timed).toEqual([]);
    expect(m('2027-01').timed.map((x) => x.amount)).toEqual([600]);
  });
  it('does not call a term fee paid early "over budget"', () => {
    const r = reviewMonth(sample(), '2026-09');
    expect(r.findings.some((f) => f.id === 'over:kids-tennis')).toBe(false);
    expect(r.findings.some((f) => f.id === 'over:cleaner')).toBe(false);
    const row = r.scorecard.find((x) => x.category === 'kids-tennis')!;
    expect(row).toMatchObject({ every: 'term', status: 'near' });
    expect(row.per).toBeCloseTo(600, 6);
  });
});
