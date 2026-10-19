import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { forecast, story } from './forecast';
import { homeOf, loanInputs, propertiesOf, runLoan, usualLiving } from './property';
import { aheadFindings } from './review';
import { mergeSettings } from './settingsMerge';
import type { BudgetLine, Data, Property, Settings, Transaction } from './types';

/** A made-up household: two pays, renting until a home settles in December with the lease running to April. */
const HOME: Property = {
  id: 'home-a', name: 'Example home', use: 'home', price: 1000000, settlement: '2026-12-09', value: 1000000,
  costs: [
    { id: 'deposit', label: 'Deposit', amount: 50000, date: '2026-10-10' },
    { id: 'duty', label: 'Stamp duty', amount: 50000, date: '2026-12-09' },
  ],
  running: [{ id: 'rates', label: 'Council rates', amount: 2400, every: 'year' }, { id: 'ins', label: 'Insurance', amount: 100, every: 'month' }],
  loan: { amount: 900000, rate: 6, term: 30, firstRepayment: '2026-12', sweep: true, changes: [], lumps: [] },
};
const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  accounts: [{ key: 'a', name: 'A everyday', owner: 'A', type: 'everyday' }, { key: 's', name: 'Savings', owner: 'A', type: 'savings' }],
  balances: [{ account: 'a', date: '2026-09-30', amount: 5000 }, { account: 's', date: '2026-09-30', amount: 145000 }],
  pay: [
    { person: 'A', from: '2026-01', grossYearly: 150000, takeHome: 9000, every: 'month', superPct: 12, salarySacrifice: 0 },
    { person: 'B', from: '2026-01', grossYearly: 110000, takeHome: 7000, every: 'month', superPct: 12, salarySacrifice: 0 },
  ],
  home: { ...DEFAULT_SETTINGS.home, leaseEnds: '2027-04-09' },
  properties: [HOME],
};
const BUDGETS: BudgetLine[] = [
  { category: 'rent', amount: 2500, from: '2026-01' }, { category: 'rent', amount: 0, from: '2027-04' },
  { category: 'groceries', amount: 8000, from: '2026-01' }, { category: 'keep-savings', amount: 4000, from: '2026-01' },
  { category: 'keep-uni', amount: 0, from: '2026-01' },
];
const t = (date: string, amount: number, category: string, kind: Transaction['kind']): Transaction =>
  ({ id: `${date}:${category}:${amount}`, date, amount, description: category, account: 'a', category, kind });
function sample(): Data {
  const transactions = ['2026-07', '2026-08', '2026-09'].flatMap((m) => [
    t(`${m}-01`, 16000, 'salary', 'income'), t(`${m}-02`, -2500, 'rent', 'spend'), t(`${m}-03`, -9000, 'groceries', 'spend'), t(`${m}-04`, -20, 'water', 'spend'),
  ]);
  // Statements cover July to September for both accounts, so those months count as complete.
  const coverage = ['a', 's'].map((account) => ({ account, from: '2026-07-01', to: '2026-09-30' }));
  return { transactions, coverage, rules: [], budgets: BUDGETS, reviews: [], payees: [], settings: SETTINGS };
}

describe('properties', () => {
  it('uses the old home details when no property has been added', () => {
    const s = { ...SETTINGS, properties: [], home: { ...SETTINGS.home, name: 'Old', settlement: '2026-12-09', loan: 800000, rate: 6, repayment: 4800, value: 900000 } };
    const [p] = propertiesOf(s);
    expect(p).toMatchObject({ id: 'home', use: 'home', settlement: '2026-12-09', loan: { amount: 800000, repayment: 4800 } });
    expect(homeOf(SETTINGS)).toMatchObject({ name: 'Example home', loan: 900000, settlement: '2026-12-09' });
  });

  it('leaves housing out of usual spending, so a move is counted once', () => {
    expect(usualLiving(sample()).living).toBe(9000);
  });

  it('merges a property from a file without losing the family’s own changes', () => {
    const mine = { ...HOME, name: 'Renamed', costs: [...HOME.costs, { id: 'fees', label: 'Fees', amount: 2000, date: '2026-12-09' }] };
    const out = mergeSettings({ ...SETTINGS, properties: [mine] }, { properties: [{ ...HOME, value: 1100000, costs: [...HOME.costs, { id: 'extra', label: 'Extra', amount: 1, date: '2026-12-09' }] }] });
    expect(out.properties![0].name).toBe('Renamed');
    expect(out.properties![0].costs.map((c) => c.id)).toEqual(['deposit', 'duty', 'fees', 'extra']);
  });
});

describe('forecast', () => {
  const data = sample();
  const f = forecast(data, { from: '2026-10' });
  const m = (x: string) => f.months.find((y) => y.month === x)!;

  it('takes off a deposit paid after the balances were read', () => {
    expect(m('2026-10').oneOffs.map((o) => o.label)).toEqual(['Deposit']);
    expect(m('2026-10').cash).toBeCloseTo(150000 + (16000 - 9000 - 2500) - 50000, 0);
  });
  it('pays the buying costs at settlement and starts repayments and running costs', () => {
    expect(m('2026-12').oneOffs.map((o) => o.label)).toEqual(['Stamp duty']);
    expect(m('2026-12').repayments).toBeCloseTo(5395.95, 1);
    expect(m('2026-12').running).toBeCloseTo(300, 5);
    expect(m('2026-11').repayments).toBe(0);
  });
  it('keeps paying rent until the lease ends', () => {
    expect(m('2027-03').rent).toBe(2500);
    expect(m('2027-04').rent).toBe(0);
  });
  it('tells the story: settlement, the overlap, and what is kept after', () => {
    const st = story(f);
    expect(st.settlements).toHaveLength(1);
    expect(st.settlements[0].after).toBeCloseTo(st.settlements[0].before - 50000, 5);
    expect(st.squeezes[0]).toMatchObject({ from: '2026-12', to: '2027-03' });
    expect(st.squeezes[0].perMonth).toBeCloseTo(9000 + 2500 + 5395.95 + 300 - 16000, 0);
    expect(st.after?.month).toBe('2027-04');
    expect(st.verdict).toBe('yes');
  });
  it('on the budget, uses what the budget plans to spend', () => {
    const b = forecast(data, { from: '2026-10', basis: 'budget' });
    expect(b.months[0].living).toBe(8000);
    expect(b.months[0].unassigned).toBe(16000 - 8000 - 2500 - 4000);
  });
});

describe('the loan', () => {
  const data = sample();
  it('adds the rent to living costs while the lease overlaps', () => {
    const inp = loanInputs(data, HOME, { offsetStart: 50000 })!;
    expect(inp.rentUntil).toBe('2027-03');
    expect(inp.changes.find((c) => c.id === 'rent-overlap')).toMatchObject({ month: '2026-12', until: '2027-03', value: 9000 + 300 + 2500 });
    expect(inp.setup).toMatchObject({ inc1: 9000, inc2: 7000, living: 9300, offset0: 50000, sweep: true, extra: 4000 });   // extra = the Budget's Savings & offset line
  });
  it('pays off sooner than the bank’s schedule, and later at a higher rate', () => {
    const v = runLoan(data, HOME, { offsetStart: 50000 })!;
    expect(v.now.paidMonth).toBeLessThan(v.bank.paidMonth);
    const up = runLoan(data, HOME, { offsetStart: 50000, changes: [{ id: 'r', month: '2027-06', type: 'rate', value: 7 }] })!;
    expect(up.now.paidMonth).toBeGreaterThan(v.now.paidMonth);
  });
  it('restarts from real loan and offset balances once they are in', () => {
    const s = { ...SETTINGS, accounts: [...SETTINGS.accounts, { key: 'L', name: 'Loan', owner: 'Joint', type: 'loan' as const }, { key: 'O', name: 'Offset', owner: 'Joint', type: 'offset' as const }],
      balances: [...SETTINGS.balances, { account: 'L', date: '2027-02-28', amount: -895000 }, { account: 'O', date: '2027-02-28', amount: 90000 }],
      properties: [{ ...HOME, loan: { ...HOME.loan!, loanAccount: 'L', offsetAccount: 'O' } }] };
    const v = runLoan({ ...data, settings: s }, s.properties[0], { offsetStart: 50000 })!;
    expect(v.inputs.anchor).toMatchObject({ month: '2027-02', loan: 895000, offset: 90000 });
    expect(v.now.paidMonth).toBeLessThan(v.plan.paidMonth);
  });
});

describe('looking ahead in the review', () => {
  it('raises the overlap and money without a job for the meeting', () => {
    const ids = aheadFindings(sample(), '2026-09', '2026-10').map((f) => f.id);
    expect(ids).toContain('ahead:carry');
    expect(ids).toContain('ahead:squeeze:2026-12');
    expect(ids).toContain('job:2026-10');
  });
});
