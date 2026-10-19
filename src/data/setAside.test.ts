import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { monthlyOf } from './frequency';
import { dayToDayCats, pots, safeToSpend } from './setAside';
import type { BudgetLine, Data, Settings, Transaction } from './types';

const t = (date: string, amount: number, category: string, account = 'a', description = category): Transaction =>
  ({ id: `${date}:${category}:${amount}:${account}`, date, amount, description, account, category, kind: amount > 0 ? 'income' : 'spend' });

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  accounts: [{ key: 'a', name: 'Everyday', owner: 'A', type: 'everyday' }, { key: 'b', name: 'Card', owner: 'A', type: 'card' }],
  budgetEvery: { 'kids-tennis': { every: 'term' }, 'car-rego': { every: 'year', due: '2027-03' }, 'home-insurance': { every: 'year' } },
};
const BUDGETS: BudgetLine[] = [
  { category: 'kids-tennis', amount: monthlyOf(600, 'term'), from: '2026-01' },
  { category: 'car-rego', amount: monthlyOf(840, 'year'), from: '2026-01' },
  { category: 'home-insurance', amount: 100, from: '2026-01' },
  { category: 'groceries', amount: 1550, from: '2026-01' },
  { category: 'eating-out', amount: 310, from: '2026-01' },
  { category: 'rent', amount: 2500, from: '2026-01' },
];
function sample(extra: Transaction[] = [], coverage: Data['coverage'] = []): Data {
  const transactions = [t('2026-07-20', -600, 'kids-tennis'), ...extra];
  return { transactions, coverage, rules: [], budgets: BUDGETS, reviews: [], payees: [], settings: SETTINGS };
}

describe('put aside for big bills', () => {
  it('builds up each lumpy cost evenly towards its due month', () => {
    const p = pots(sample(), '2026-11');
    const tennis = p.pots.find((x) => x.cat === 'kids-tennis')!;
    expect(tennis.due).toBe('2027-01');
    expect(tennis.per).toBe(600);
    expect(tennis.target).toBe(200);            // two months to go of three: a third aside by the end of November
    const rego = p.pots.find((x) => x.cat === 'car-rego')!;
    expect(rego.due).toBe('2027-03');
    expect(rego.target).toBe(560);              // 4 months to go of 12: 8 twelfths of $840
    expect(rego.monthly).toBe(70);
    expect(p.unset).toEqual(['home-insurance']); // yearly with no month: can't be timed
    expect(p.total).toBe(760);
  });
  it('the whole amount is aside in the month it falls due', () => {
    expect(pots(sample(), '2027-01').pots.find((x) => x.cat === 'kids-tennis')!.target).toBe(600);
  });
  it('never goes below nothing when a term is paid early, and moves on once paid in its month', () => {
    const early = pots(sample([t('2026-12-05', -600, 'kids-tennis')]), '2026-12').pots.find((x) => x.cat === 'kids-tennis')!;
    expect(early.due).toBe('2027-04');
    expect(early.target).toBe(0);
    const onTime = pots(sample([t('2027-01-10', -600, 'kids-tennis')]), '2027-01').pots.find((x) => x.cat === 'kids-tennis')!;
    expect(onTime.due).toBe('2027-04');
    expect(onTime.target).toBe(0);
  });
});

describe('safe to spend', () => {
  it('counts only day-to-day lines', () => {
    expect(dayToDayCats(sample(), '2026-10-16').sort()).toEqual(['eating-out', 'groceries']);
  });
  it('spreads what is left over the days after the last statement', () => {
    const cov = [{ account: 'a', from: '2026-10-01', to: '2026-10-17' }, { account: 'b', from: '2026-10-01', to: '2026-10-10' }];
    const s = safeToSpend(sample([t('2026-10-05', -400, 'groceries'), t('2026-10-08', -60, 'eating-out', 'b')], cov), '2026-10-18');
    expect(s.planned).toBe(1860);
    expect(s.spent).toBe(460);
    expect(s.asOf).toBe('2026-10-10');          // the card only goes to the 10th
    expect(s.daysLeft).toBe(21);
    expect(s.perWeek).toBe(Math.round((1400 / 21) * 7));
  });
  it("says which accounts aren't in yet instead of guessing", () => {
    const s = safeToSpend(sample([t('2026-10-05', -400, 'groceries')], [{ account: 'a', from: '2026-10-01', to: '2026-10-17' }]), '2026-10-18');
    expect(s.asOf).toBeNull();
    expect(s.missing).toEqual(['Card']);
    expect(s.perWeek).toBe(Math.round((1860 / 31) * 7));
  });
});
