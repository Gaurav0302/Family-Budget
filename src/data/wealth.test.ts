import { describe, expect, it } from 'vitest';
import { findBills, manualBills } from './bills';
import { applyCustomCategories, CATEGORY, SPEND_CATEGORIES } from './categories';
import { DEFAULT_SETTINGS } from './defaults';
import { mergeSettings } from './settingsMerge';
import type { Settings, Transaction } from './types';
import { expectedIncome, financialYear, netWorth, payChanges, superMonthly, superRoom } from './wealth';
import { payoff } from './whatif';

const S: Settings = {
  ...DEFAULT_SETTINGS,
  accounts: [{ key: 'a', name: 'A everyday', owner: 'Alex', type: 'everyday', core: true }, { key: 'b', name: 'B everyday', owner: 'Sam', type: 'everyday', core: true }],
  pay: [
    { person: 'Alex', from: '2026-01', grossYearly: 120000, takeHome: 3000, every: 'fortnight', superPct: 12, salarySacrifice: 100 },
    { person: 'Alex', from: '2026-08', grossYearly: 132000, takeHome: 3250, every: 'fortnight', superPct: 12, salarySacrifice: 100 },
    { person: 'Sam', from: '2026-01', grossYearly: 90000, takeHome: 5800, every: 'month', superPct: 12, salarySacrifice: 0 },
  ],
};
const t = (date: string, amount: number, description: string, category: string, account = 'a', kind: Transaction['kind'] = 'spend'): Transaction =>
  ({ id: `${account}:${date}:${amount}`, date, amount, description, account, category, kind });

describe('income and super', () => {
  it('uses the pay that applies to each month', () => {
    expect(expectedIncome(S, '2026-07')).toBeCloseTo(3000 * 26 / 12 + 5800);
    expect(expectedIncome(S, '2026-09')).toBeCloseTo(3250 * 26 / 12 + 5800);
    expect(superMonthly(S, '2026-09')).toBeCloseTo(132000 / 12 * 0.12 + 100 + 90000 / 12 * 0.12);
  });
  it('works out room under the before-tax super cap', () => {
    const r = superRoom(S.pay![1], '2026-10');
    expect(financialYear('2026-10')).toBe('2026-27');
    expect(r.cap).toBe(32500);
    expect(r.used).toBeCloseTo(132000 * 0.12 + 1200);
    expect(r.costPer1000).toBe(680);   // 30% + 2% Medicare
  });
  it('notices a pay change in the bank that the app does not know about yet', () => {
    const txs = ['2026-07-15', '2026-08-15', '2026-09-15'].map((d, i) => t(d, i ? 6100 : 5800, 'Salary', 'salary', 'b', 'income'));
    expect(payChanges({ transactions: txs, settings: S })).toEqual([{ person: 'Sam', month: '2026-08', from: 5800, to: 6100 }]);
  });
});

describe('net worth', () => {
  it('adds cash, super and assets and takes off debts, as known on a date', () => {
    const s: Settings = { ...S, balances: [{ account: 'a', date: '2026-09-30', amount: 20000 }],
      superBalances: [{ person: 'Alex', date: '2026-06-30', amount: 150000 }],
      wealth: [{ id: 'h', name: 'Home', kind: 'home', ownedSince: '2026-12-09', values: [{ date: '2026-12-09', amount: 1000000 }] },
        { id: 'l', name: 'Loan', kind: 'loan', ownedSince: '2026-12-09', values: [{ date: '2026-12-09', amount: 900000 }] },
        { id: 'o', name: 'Overseas flat', kind: 'home', values: [{ date: '2026-10-01', amount: 50000 }] }] };
    expect(netWorth(s, '2026-10-31').total).toBe(220000);
    expect(netWorth(s, '2026-12-31').total).toBe(320000);
    // Something owned before records began counts in earlier months too, so adding it doesn't look like a jump.
    expect(netWorth(s, '2026-07-31').total).toBe(200000);
  });
});

describe('bills', () => {
  it('finds regular bills, ignores groceries, and spots a price rise', () => {
    const txs: Transaction[] = [];
    ['01', '02', '03', '04', '05', '06'].forEach((m, i) => {
      txs.push(t(`2026-${m}-17`, i < 3 ? -403.9 : -442.65, 'Direct Debit 010758 AHM', 'health-insurance'));
      txs.push(t(`2026-${m}-10`, -150, 'Coles Online', 'groceries'));
    });
    const bills = findBills(txs, '2026-06-20');
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ every: 'month', amount: 442.65, next: '2026-07-17', rise: { from: 403.9, to: 442.65, since: '2026-04-17' } });
  });
  it('rolls manual bills forward to the next date', () => {
    expect(manualBills([{ id: 'r', name: 'Rates', amount: 558, every: 'quarter', next: '2026-02-28', category: 'council-rates' }], '2026-06-01')[0].next).toBe('2026-08-28');
  });
});

describe('what if', () => {
  it('pays the loan off sooner with more in the offset', () => {
    const base = payoff(1000000, 6, 6000, 50000, 1000), more = payoff(1000000, 6, 6000, 50000, 2000);
    expect(base.finished).toBe(true);
    expect(more.months).toBeLessThan(base.months);
    expect(more.interest).toBeLessThan(base.interest);
  });
});

describe('settings from a file never overwrite what the family changed', () => {
  it('joins lists and only fills blanks', () => {
    const current: Settings = { ...S, expectedIncome: 20000, superBalances: [{ person: 'Alex', date: '2026-10-01', amount: 160000 }] };
    const merged = mergeSettings(current, { expectedIncome: 18000, superBalances: [{ person: 'Alex', date: '2026-01-31', amount: 150000 }], household: 'Changed' });
    expect(merged.expectedIncome).toBe(20000);
    expect(merged.superBalances).toHaveLength(2);
    expect(merged.household).toBe('Our family' === DEFAULT_SETTINGS.household ? 'Changed' : merged.household);
  });
});

describe('categories', () => {
  it('adds the family’s own categories and hides unused ones', () => {
    applyCustomCategories([{ id: 'custom-singing', label: 'Singing lessons', group: 'Kids & school', type: 'want' }], ['kids-music']);
    expect(CATEGORY['custom-singing'].label).toBe('Singing lessons');
    expect(SPEND_CATEGORIES.some((c) => c.id === 'kids-music')).toBe(false);
    expect(CATEGORY['kids-music']).toBeDefined();
    applyCustomCategories([], []);
    expect(CATEGORY['custom-singing']).toBeUndefined();
  });
});
