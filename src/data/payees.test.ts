import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monthCoverage, monthEndBalances } from './analysis';
import { DEFAULT_SETTINGS } from './defaults';
import { findPayee, groupByPayee, indexPayees, payeesFor, sortTransaction } from './payees';
import type { Payee, Settings, Transaction, WealthItem } from './types';
import { netWorth, ownedSinceOf, valueOn } from './wealth';

const t = (id: string, date: string, amount: number, description: string, category: string, extra: Partial<Transaction> = {}): Transaction =>
  ({ id, date, amount, description, account: 'a', category, kind: 'spend', ...extra });

describe('payee list', () => {
  const txs = [
    t('1', '2026-08-02', -500, 'Transfer to Family Overseas', 'family-overseas'),
    t('2', '2026-09-02', -500, 'Transfer to Family Overseas', 'family-overseas'),
    t('3', '2026-10-02', -800, 'Transfer to Family Overseas', 'gifts', { manual: true }),
    t('4', '2026-10-05', -42, 'Coles 1234 Sydney', 'groceries'),
  ];

  it('makes one payee per merchant, with the category most payments have (hand-sorted ones count more), waiting to be checked', () => {
    const ps = payeesFor(txs, []);
    const overseas = ps.find((p) => p.name.includes('Family Overseas'))!;
    expect(ps).toHaveLength(2);
    expect(overseas.category).toBe('gifts');           // 1 hand-sorted vote (x3) beats 2 automatic ones
    expect(overseas.checked).toBe(false);
    expect(payeesFor(txs, ps)).toHaveLength(0);         // nothing new the second time
  });

  it('matches "description contains" wording before the merchant name', () => {
    const ps: Payee[] = [
      { id: 'coles', name: 'Coles', category: 'groceries', kind: 'spend', match: ['Coles'] },
      { id: 'house', name: 'India house upkeep', category: 'custom-house', kind: 'spend', match: [], patterns: ['family overseas'] },
    ];
    const idx = indexPayees(ps);
    expect(findPayee(txs[0], idx)?.id).toBe('house');
    expect(findPayee(txs[3], idx)?.id).toBe('coles');
  });

  it('sorts future imports by the payee, keeps hand-sorted ones, and holds "ask each time" payees for a person', () => {
    const idx = indexPayees([{ id: 'house', name: 'House', category: 'custom-house', kind: 'spend', match: [], patterns: ['family overseas'], askEachTime: true }]);
    const s = { cardItemisedFrom: '2026-01-01' };
    expect(sortTransaction(txs[0], idx, [], s)).toMatchObject({ category: 'custom-house', needsReview: false });
    expect(sortTransaction(txs[0], idx, [], s, true)).toMatchObject({ category: 'custom-house', needsReview: true });
    expect(sortTransaction(txs[2], idx, [], s).category).toBe('gifts');
  });

  it('groups a month’s payments by payee for the drill-down', () => {
    const idx = indexPayees(payeesFor(txs, []));
    const groups = groupByPayee(txs, idx);
    expect(groups[0].txs).toHaveLength(3);
    expect(groups[0].total).toBe(-1800);
  });
});

describe('accounts that open or close', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());
  const s: Settings = { ...DEFAULT_SETTINGS, accounts: [
    { key: 'old', name: 'Old savings', owner: 'Joint', type: 'savings', core: true, closedOn: '2026-12-10', movedTo: 'off' },
    { key: 'off', name: 'Offset', owner: 'Joint', type: 'offset', core: true, openedOn: '2026-12-09' },
  ], balances: [{ account: 'old', date: '2026-11-30', amount: 90000 }, { account: 'off', date: '2026-12-31', amount: 85000 }] };
  const cov = (account: string, from: string, to: string) => ({ account, from, to });

  it('only needs statements for accounts open during the month', () => {
    vi.setSystemTime(new Date('2028-01-15T12:00:00'));
    expect(monthCoverage('2026-11', [cov('old', '2026-11-01', '2026-11-30')], s).complete).toBe(true);
    expect(monthCoverage('2027-01', [cov('off', '2027-01-01', '2027-01-31')], s).complete).toBe(true);
    expect(monthCoverage('2026-12', [cov('off', '2026-12-01', '2026-12-31')], s).missing).toEqual(['Old savings']);
  });

  it('drops a closed account from cash, so moved money is not counted twice', () => {
    expect(netWorth(s, '2026-11-30').cash).toBe(90000);
    expect(netWorth(s, '2026-12-31').cash).toBe(85000);
  });
});

describe('when wealth items count', () => {
  const shares: WealthItem = { id: 's', name: 'Shares', kind: 'shares', ownedSince: '0000-01-01', values: [{ date: '2026-10-18', amount: 30000 }, { date: '2027-01-15', amount: 32000 }] };
  it('carries a long-held item back before its first value, and uses the latest value after', () => {
    expect(valueOn(shares, '2026-03-31')?.amount).toBe(30000);
    expect(valueOn(shares, '2027-02-01')?.amount).toBe(32000);
  });
  it('counts nothing before it was bought or after it was sold', () => {
    const car: WealthItem = { id: 'c', name: 'Car', kind: 'other', ownedSince: '2026-06-01', endedOn: '2027-06-01', values: [{ date: '2026-06-01', amount: 20000 }] };
    expect(valueOn(car, '2026-05-31')).toBeNull();
    expect(valueOn(car, '2026-12-31')?.amount).toBe(20000);
    expect(valueOn(car, '2027-06-01')).toBeNull();
  });
  it('treats an item with no date and a future first value (a house at settlement) as starting then', () => {
    expect(ownedSinceOf({ id: 'h', name: 'House', kind: 'home', values: [{ date: '2999-01-01', amount: 1 }] })).toBe('2999-01-01');
    expect(ownedSinceOf({ id: 'h', name: 'Flat', kind: 'home', values: [{ date: '2020-01-01', amount: 1 }] })).toBe('0000-01-01');
  });
});

describe('month-end balances from a closing balance', () => {
  it('works back through the transactions, only as far as the statements cover', () => {
    const txs = [t('1', '2026-07-15', -100, 'Shop', 'groceries'), t('2', '2026-08-03', 1000, 'Pay', 'salary'), t('3', '2026-08-20', -50, 'Shop', 'groceries')];
    expect(monthEndBalances(txs, [{ account: 'a', from: '2026-07-01', to: '2026-08-25' }], [{ account: 'a', date: '2026-08-25', amount: 2000 }]))
      .toEqual([{ account: 'a', date: '2026-06-30', amount: 1150 }, { account: 'a', date: '2026-07-31', amount: 1050 }]);
  });
});
