import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { checkInsOf, describeChange, duplicatePlan, expectedAt, summarize, whatIfs } from './plans';
import { loanInputs, plansOf, runLoan, uniPlanOf } from './property';
import { mergeSettings } from './settingsMerge';
import type { BudgetLine, Data, LoanPlan, Property, Settings, UniFund } from './types';
import { latestBalance, monthlyAt, monthlyForGoal, uniPath } from './uni';
import { netWorth } from './wealth';
import { cashAfterSettlement } from './useProperties';

/** A made-up household buying a home in December, two pays, $1,000 a month into the offset in the budget. */
const HOME: Property = {
  id: 'home-a', name: 'Example home', use: 'home', price: 1000000, settlement: '2026-12-09', value: 1000000, costs: [], running: [],
  loan: { amount: 900000, rate: 6, term: 30, firstRepayment: '2026-12', changes: [], lumps: [], loanAccount: 'l', offsetAccount: 'o' },
};
const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  accounts: [{ key: 'o', name: 'Offset', owner: 'A', type: 'everyday' }, { key: 'l', name: 'Home loan', owner: 'A', type: 'loan' }],
  balances: [{ account: 'o', date: '2026-11-30', amount: 60000 }],
  pay: [
    { person: 'A', from: '2026-01', grossYearly: 150000, takeHome: 9000, every: 'month', superPct: 12, salarySacrifice: 0 },
    { person: 'B', from: '2026-01', grossYearly: 110000, takeHome: 7000, every: 'month', superPct: 12, salarySacrifice: 0 },
  ],
  properties: [HOME],
  wealth: [{ id: 'w-loan', name: 'Home loan', kind: 'loan', ownedSince: '2026-12-09', values: [{ date: '2026-12-09', amount: 900000 }] }],
};
const BUDGETS: BudgetLine[] = [{ category: 'groceries', amount: 6000, from: '2026-01' }, { category: 'keep-savings', amount: 1000, from: '2026-01' }];
const data = (s: Partial<Settings> = {}, budgets = BUDGETS): Data =>
  ({ transactions: [], coverage: [], rules: [], budgets, reviews: [], payees: [], settings: { ...SETTINGS, ...s } });
const withLoan = (l: Partial<NonNullable<Property['loan']>>): Property => ({ ...HOME, loan: { ...HOME.loan!, ...l } });

describe('loan plans', () => {
  it('starts with one plan, and the active plan takes what goes into the offset from the budget', () => {
    const [plan] = plansOf(HOME);
    expect(plan.name).toBe('My plan');
    expect(loanInputs(data(), HOME, { plan })!.setup.extra).toBe(1000);
    // A budget change after the loan starts becomes a recorded change to the extra.
    const later = loanInputs(data({}, [...BUDGETS, { category: 'keep-savings', amount: 1500, from: '2027-03' }]), HOME, { plan })!;
    expect(later.changes).toContainEqual(expect.objectContaining({ type: 'extra', month: '2027-03', value: 1500 }));
  });

  it('keeps a plan that isn’t active on its own extra', () => {
    const a: LoanPlan = { ...plansOf(HOME)[0] };
    const b: LoanPlan = { ...duplicatePlan(a, [a]), extra: 3000 };
    const p = withLoan({ plans: [a, b], activePlan: a.id });
    expect(loanInputs(data(), p, { plan: b })!.setup.extra).toBe(3000);
    expect(b.name).toBe('My plan copy');
    expect(duplicatePlan(b, [a, b]).name).toBe('My plan copy 2');
    // More into the offset pays it off sooner.
    expect(runLoan(data(), p, { plan: b, offsetStart: 60000 })!.now.paidIdx).toBeLessThan(runLoan(data(), p, { plan: a, offsetStart: 60000 })!.now.paidIdx);
  });

  it('puts guesses on one plan and facts on every plan', () => {
    const guess = { id: 'g', month: '2028-01', type: 'rate' as const, value: 7 };
    const fact = { id: 'f', month: '2027-06', type: 'rate' as const, value: 5.5 };
    const a: LoanPlan = { ...plansOf(HOME)[0], changes: [guess] };
    const b: LoanPlan = { ...duplicatePlan(a, [a]), changes: [] };
    const p = withLoan({ plans: [a, b], activePlan: a.id, changes: [fact] });
    expect(loanInputs(data(), p, { plan: a })!.changes.map((c) => c.id)).toEqual(expect.arrayContaining(['f', 'g']));
    expect(loanInputs(data(), p, { plan: b })!.changes.map((c) => c.id)).not.toContain('g');
    expect(describeChange(guess, ['A', 'B'])).toMatch(/7\.00%/);
  });

  it('restarts the projection from a check-in, and statements win over typed balances', () => {
    const p = withLoan({ checkIns: [{ month: '2027-03', loan: 880000, offset: 70000 }, { month: '2027-04', loan: 1, offset: 1 }] });
    const s = { balances: [...SETTINGS.balances, { account: 'l', date: '2027-04-30', amount: -875000 }, { account: 'o', date: '2027-04-30', amount: 72000 }] };
    const c = checkInsOf(data(s), p);
    expect(c.map((x) => [x.month, x.loan, !!x.fromStatements])).toEqual([['2027-03', 880000, false], ['2027-04', 875000, true]]);
    const v = runLoan(data(s), p, { offsetStart: 60000 })!;
    const apr = v.now.points.find((x) => x.m >= 0 && x.loan === 875000);
    expect(apr?.offset).toBe(72000);
    // What the plan expected for April works forward from March's check-in.
    const exp = expectedAt(data(s), p, plansOf(p)[0], '2027-04', 60000);
    expect(exp.loan).toBeLessThan(880000);
    expect(exp.loan).toBeGreaterThan(875000);
  });

  it('warns when a plan asks for more than is spare in a typical month', () => {
    expect(summarize(runLoan(data(), HOME, { offsetStart: 60000 })!).overAsks).toBe(false);
    const big = summarize(runLoan(data({}, [...BUDGETS, { category: 'keep-savings', amount: 15000, from: '2026-02' }]), HOME, { offsetStart: 60000 })!);
    expect(big.overAsks).toBe(true);
    expect(big.typicalSpare).toBeGreaterThan(1000);
    expect(big.typicalSpare).toBeLessThan(15000);
  });

  it('gives what-ifs that move in the right direction', () => {
    const v = runLoan(data(), HOME, { offsetStart: 60000 })!;
    const rows = Object.fromEntries(whatIfs(plansOf(HOME)[0], v).map((r) => [r.label, r]));
    expect(rows['Rates 1% higher throughout'].interest).toBeGreaterThan(0);
    expect(rows['Rates 1% lower throughout'].interest).toBeLessThan(0);
    expect(rows['$500 a month more into the offset'].months).toBeLessThan(0);
    expect(rows['$500 a month less into the offset'].months).toBeGreaterThan(0);
  });
});

describe('net worth and the property', () => {
  it('takes the loan balance from the property once there is a check-in', () => {
    const before = netWorth(data().settings, '2027-03-31');
    expect(before.debts).toBe(900000);
    const s = { ...SETTINGS, properties: [withLoan({ checkIns: [{ month: '2027-03', loan: 880000, offset: 70000 }] })] };
    expect(netWorth(s, '2027-03-31').debts).toBe(880000);
    expect(netWorth(s, '2027-02-28').debts).toBe(900000);
    // A loan statement later still wins.
    expect(netWorth({ ...s, balances: [...s.balances, { account: 'l', date: '2027-05-31', amount: -870000 }] }, '2027-06-30').debts).toBe(870000);
    // An unrelated loan isn't touched.
    expect(netWorth({ ...s, wealth: [{ ...s.wealth![0], ownedSince: '2020-01-01' }] }, '2027-03-31').debts).toBe(900000);
  });
});

describe('the offset on day one', () => {
  it('uses real cash at the end of the settlement month once every account has a statement from then', () => {
    expect(cashAfterSettlement(SETTINGS, HOME)).toBeNull();
    const s = { ...SETTINGS, balances: [...SETTINGS.balances, { account: 'o', date: '2026-12-31', amount: 74000 }, { account: 'o', date: '2027-01-31', amount: 76000 }] };
    expect(cashAfterSettlement(s, HOME)).toBe(74000);
  });
});

describe('settings from a file', () => {
  it('adds plans to an existing property without wiping it, and ignores a partial property it doesn’t know', () => {
    const plan: LoanPlan = { ...plansOf(HOME)[0], id: 'p1', name: 'From file' };
    const incoming = { properties: [{ id: 'home-a', loan: { plans: [plan], activePlan: 'p1', checkIns: [] } }, { id: 'nope', loan: { plans: [plan] } }] } as unknown as Partial<Settings>;
    const out = mergeSettings(SETTINGS, incoming);
    expect(out.properties).toHaveLength(1);
    expect(out.properties![0].loan).toMatchObject({ amount: 900000, rate: 6, activePlan: 'p1' });
    expect(out.properties![0].loan!.plans!.map((x) => x.name)).toEqual(['From file']);
    expect(out.properties![0].name).toBe('Example home');
  });
});

describe('uni funds', () => {
  const fund: UniFund = { name: 'Child A', target: 60000, monthly: 300, saved: 5000, savedOn: '2026-10-01', year: 2034 };
  it('follows changes to the monthly saving, for good or for a while', () => {
    const f = { ...fund, changes: [{ id: '1', month: '2027-07', monthly: 500 }, { id: '2', month: '2028-01', until: '2028-03', monthly: 0 }] };
    expect([monthlyAt(f, '2027-06'), monthlyAt(f, '2027-07'), monthlyAt(f, '2028-02'), monthlyAt(f, '2028-04')]).toEqual([300, 500, 0, 500]);
  });
  it('starts from the latest balance check-in', () => {
    expect(latestBalance({ ...fund, checkIns: [{ month: '2026-12', amount: 6000 }, { month: '2026-11', amount: 5500 }] })).toEqual({ month: '2026-12', amount: 6000 });
  });
  it('works out the monthly amount that reaches the goal, and then spends it over the years at uni', () => {
    const need = monthlyForGoal(fund, '2026-11', 4);
    const path = uniPath({ ...fund, monthly: need }, '2026-11', 4, 3, '2037-03');
    const atUni = path.find((x) => x.month === '2034-01')!.value;
    expect(atUni).toBeGreaterThan(59000);
    expect(atUni).toBeLessThan(60100);
    expect(path.find((x) => x.month === '2037-01')!.value).toBeLessThan(2000);
    expect(uniPlanOf(SETTINGS)).toMatchObject({ inOffset: true, years: 3 });
  });
});
