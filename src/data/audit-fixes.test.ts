import { afterEach, describe, expect, it, vi } from 'vitest';
import { cashOnHand, findRecurring, monthCoverage, summarise } from './analysis';
import { rebasePayees } from './adapters/supabase';
import { addEvery } from './bills';
import { DEFAULT_SETTINGS } from './defaults';
import { allowance, monthlyOf } from './frequency';
import { parseCsv } from './importers';
import { merchantOf } from './merchant';
import { reviewMonth } from './review';
import { mergeSettings } from './settingsMerge';
import type { Data, Payee, Settings, Transaction } from './types';
import { marginalRate } from './wealth';

/** Fixes from the 19 Oct 2026 audit: each test is a case that used to give a wrong answer. */
const tx = (date: string, amount: number, category: string, description = category, account = 'a'): Transaction =>
  ({ id: `${account}:${date}:${amount}:${description}`, date, amount, description, account, category, kind: amount > 0 ? 'income' : 'spend' });
const SETTINGS: Settings = { ...DEFAULT_SETTINGS, accounts: [{ key: 'a', name: 'Everyday', owner: 'A', type: 'everyday', core: true }] };
const data = (transactions: Transaction[], s: Partial<Settings> = {}): Data =>
  ({ transactions, coverage: [], rules: [], budgets: [], reviews: [], payees: [], settings: { ...SETTINGS, ...s } });

afterEach(() => vi.useRealTimers());

describe('importing bank files', () => {
  it('reads "Debit Amount" and "Credit Amount" columns as money out and in', () => {
    const csv = 'Date,Narrative,Debit Amount,Credit Amount,Balance\n01/10/2026,SHOP,50.00,,950.00\n02/10/2026,PAY,,100.00,1050.00';
    const r = parseCsv(csv, 'a', 'test.csv');
    expect(r.transactions.map((t) => t.amount)).toEqual([-50, 100]);
    expect(r.statements?.[0]).toMatchObject({ opening: 1000, closing: 1050 });
  });
});

describe('payee names', () => {
  it('matches known names as whole words only', () => {
    expect(merchantOf('EAGLE BOYS PIZZA')).not.toBe('AGL');
    expect(merchantOf('Fast Transfer To Rahman Ahmed')).not.toBe('ahm health insurance');
    expect(merchantOf('MACQUARIE CENTRE CAFE')).not.toBe('To Macquarie savings');
    expect(merchantOf('Direct Debit 348045 AGL SALES PTY LT')).toBe('AGL');
    expect(merchantOf('Direct Debit 403017 YMCAHAWTHN144144')).toBe('YMCA');
    expect(merchantOf('Transfer to other Bank NetBank | self mq save')).toBe('To Macquarie savings');
  });
});

describe('subscriptions', () => {
  it('counts a charge paid once a year as yearly, not monthly', () => {
    const r = findRecurring([tx('2025-10-05', -120, 'subscriptions', 'EXAMPLE APP'), tx('2026-10-05', -120, 'subscriptions', 'EXAMPLE APP')], '2026-10');
    expect(r[0]).toMatchObject({ every: 'year', yearly: 120 });
  });
  it('counts a quarterly charge as a third of it each month', () => {
    const r = findRecurring(['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05'].map((d) => tx(d, -90, 'subscriptions', 'EXAMPLE PLAN')), '2026-10');
    expect(r[0].monthly).toBeCloseTo(30, 6);
  });
});

describe('the monthly review', () => {
  it('skips the 50/30/20 check in a month with no pay in it', () => {
    const r = reviewMonth(data([tx('2026-08-03', -400, 'groceries')]), '2026-08');
    expect(r.findings.some((f) => f.id === 'split:wants')).toBe(false);
  });
  it('counts a split payment as its parts when looking for unusual payments', () => {
    const history = ['2026-05-10', '2026-06-10', '2026-07-10'].map((d) => tx(d, -60, 'groceries', 'PAYPAL EXAMPLE'));
    const big = tx('2026-08-10', -1500, 'groceries', 'PAYPAL EXAMPLE');
    const r = reviewMonth(data([...history, big], { splits: { [big.id]: [{ amount: -60, category: 'groceries' }, { amount: -1440, category: 'holidays' }] } }), '2026-08');
    expect(r.unusual.some((u) => u.tx.amount === -1500)).toBe(false);
  });
});

describe('term fees', () => {
  it("doesn't allow next term's fee unless it has been paid early", () => {
    const d = { ...data([]), budgets: [{ category: 'kids-tennis', amount: monthlyOf(600, 'term'), from: '2026-01' }], settings: { ...SETTINGS, budgetEvery: { 'kids-tennis': { every: 'term' as const } } } };
    expect(allowance(d, 'kids-tennis', '2026-12').allowed).toBeCloseTo(600, 6);
    const paidEarly = { ...d, transactions: [tx('2026-12-15', -600, 'kids-tennis')] };
    expect(allowance(paidEarly, 'kids-tennis', '2026-12').allowed).toBeCloseTo(1200, 6);
  });
});

describe('complete months', () => {
  it("never counts a month that hasn't ended", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00'));
    const cov = [{ account: 'a', from: '2026-09-01', to: '2026-10-19' }];
    expect(monthCoverage('2026-09', cov, SETTINGS).complete).toBe(true);
    expect(monthCoverage('2026-10', cov, SETTINGS).complete).toBe(false);
  });
  it('needs every account with statements when none is marked as needed', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00'));
    const s = { ...SETTINGS, accounts: [{ key: 'a', name: 'A', owner: 'A', type: 'everyday' as const }, { key: 'b', name: 'B', owner: 'A', type: 'savings' as const }] };
    expect(monthCoverage('2026-09', [{ account: 'a', from: '2026-09-01', to: '2026-09-30' }], s).complete).toBe(false);
  });
});

describe('cash on hand', () => {
  it('rolls an older balance forward with the transactions since', () => {
    const s = { ...SETTINGS, accounts: [...SETTINGS.accounts, { key: 's', name: 'Savings', owner: 'A', type: 'savings' as const }],
      balances: [{ account: 's', date: '2026-07-31', amount: 10000 }, { account: 'a', date: '2026-10-15', amount: 2000 }] };
    const c = cashOnHand(s, [tx('2026-08-20', 500, 'own-transfer', 'IN', 's'), tx('2026-10-20', 999, 'own-transfer', 'LATER', 's')]);
    expect(c).toEqual({ total: 12500, asOf: '2026-10-15' });
  });
});

describe('bill dates', () => {
  it('keeps the day of the month without skipping or drifting', () => {
    expect(addEvery('2026-08-31', 'month')).toBe('2026-09-30');
    expect(addEvery('2026-01-31', 'month', 2)).toBe('2026-03-31');
    expect(addEvery('2028-02-29', 'year')).toBe('2029-02-28');
  });
});

describe('settings from a file', () => {
  it('adds splits, keeps a deliberate 0, and lets statements correct a balance', () => {
    const cur = { ...SETTINGS, expectedIncome: 9000, splits: { x: [{ amount: -1, category: 'groceries' }] }, statements: [{ account: 'a', from: '2026-09-01', to: '2026-09-30', opening: 1, closing: 2 }],
      accounts: [{ ...SETTINGS.accounts[0], openingBalance: 0 } as any] };
    const out = mergeSettings(cur, { splits: { y: [{ amount: -2, category: 'gifts' }] }, statements: [{ account: 'a', from: '2026-09-01', to: '2026-09-30', opening: 1, closing: 3 }],
      accounts: [{ ...SETTINGS.accounts[0], openingBalance: 500 } as any] });
    expect(Object.keys(out.splits!)).toEqual(['y', 'x']);
    expect(out.statements![0].closing).toBe(3);
    expect((out.accounts[0] as any).openingBalance).toBe(0);
  });
});

describe('hidden categories', () => {
  it('still show in the scorecard when money was spent in them', () => {
    const d = data([tx('2026-08-01', 5000, 'salary'), tx('2026-08-03', -80, 'kids-music')], { hiddenCategories: ['kids-music'] });
    expect(summarise('2026-08', d).spend).toBe(80);
    expect(reviewMonth(d, '2026-08').scorecard.some((r) => r.category === 'kids-music')).toBe(true);
  });
});

describe('saving the payee list when someone else saved first', () => {
  it('keeps their changes and re-applies this one', () => {
    const p = (id: string, category: string): Payee => ({ id, name: id, match: [id], category, kind: 'spend' } as Payee);
    const base = [p('a', 'groceries'), p('b', 'fuel'), p('c', 'gifts')];
    const mine = [p('a', 'takeaway'), p('b', 'fuel'), p('d', 'other')];           // edited a, removed c, added d
    const theirs = [p('a', 'groceries'), p('b', 'car-servicing'), p('c', 'gifts'), p('e', 'water')];   // they edited b, added e
    expect(rebasePayees(mine, base, theirs).map((x) => `${x.id}:${x.category}`)).toEqual(['a:takeaway', 'b:car-servicing', 'e:water', 'd:other']);
  });
});

describe('tax rates', () => {
  it('follow the financial year', () => {
    expect(marginalRate(40000, '2025-26')).toBe(0.16);
    expect(marginalRate(40000, '2026-27')).toBe(0.15);
    expect(marginalRate(40000, '2027-28')).toBe(0.14);
    expect(marginalRate(150000, '2026-27')).toBe(0.37);
  });
});
