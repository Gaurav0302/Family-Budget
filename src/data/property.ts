import { annuity, simulate, toIdx, toYM, type Anchor, type Change, type Kid, type Lump, type Setup, type SimResult } from '../loan';
import { addMonths, average, budgetFor, completeMonths, monthOf, summarise } from './analysis';
import { CATEGORIES } from './categories';
import type { Data, Property, PropertyLoan, Settings, UniFund } from './types';
import { earners, PER_MONTH } from './wealth';
import { lumpy } from './frequency';

/** Categories that are about where the family lives. Recent spending leaves these out, and each property's own costs go back in,
 *  so a move from renting to owning is counted once. */
export const HOUSING_CATS = ['rent', 'mortgage', 'council-rates', 'water', 'home-insurance', 'strata'];

const HOME_COSTS: [string, string][] = [['council-rates', 'Council rates'], ['water', 'Water'], ['home-insurance', 'Home insurance']];

/** Every property, oldest settlement first. Families set up before properties existed get their home from the old `home` details. */
export function propertiesOf(s: Settings, budgets: Data['budgets'] = []): Property[] {
  if (s.properties?.length) return [...s.properties].sort((a, b) => a.settlement.localeCompare(b.settlement));
  const h = s.home;
  if (!h?.settlement) return [];
  const settle = monthOf(h.settlement);
  return [{
    id: 'home', name: h.name || 'Our home', use: 'home', price: h.value, settlement: h.settlement, value: h.value, costs: [],
    running: HOME_COSTS.map(([id, label]) => ({ id, label, amount: budgetFor(budgets, id, settle), every: 'month' as const })).filter((c) => c.amount > 0),
    loan: h.loan ? { amount: h.loan, rate: h.rate, term: 30, firstRepayment: settle, repayment: h.repayment || undefined, offsetStart: h.offsetStart } : undefined,
  }];
}

/** The family home: the first property they live in. */
export const homeProperty = (s: Settings, budgets: Data['budgets'] = []) => propertiesOf(s, budgets).find((p) => p.use === 'home' && !p.soldOn);

/** The old single-home shape, filled from the home property, for the checks that still read it. */
export function homeOf(s: Settings, budgets: Data['budgets'] = []): Settings['home'] {
  const p = homeProperty(s, budgets);
  if (!p) return s.home;
  return { ...s.home, name: p.name, settlement: p.settlement, value: p.value ?? p.price, loan: p.loan?.amount ?? 0, rate: p.loan?.rate ?? 0,
    repayment: p.loan ? repaymentOf(p.loan) : 0, offsetStart: p.loan?.offsetStart };
}

export const repaymentOf = (l: PropertyLoan) => l.repayment || annuity(l.amount, l.rate / 1200, l.term * 12);

export const runningMonthly = (p: Property) => p.running.reduce((a, c) => a + c.amount * PER_MONTH[c.every], 0);

/** Owned during this month (settled on or before its last day, not sold before it starts). */
export const ownedIn = (p: Property, month: string) => monthOf(p.settlement) <= month && (!p.soldOn || monthOf(p.soldOn) >= month);

/** Rent received in a month, after the weeks it's expected to sit empty. */
export function rentIn(p: Property, month: string): number {
  if (!p.rent?.weekly || monthOf(p.rent.from) > month || !ownedIn(p, month)) return 0;
  return (p.rent.weekly * (52 - (p.rent.emptyWeeks ?? 0))) / 12;
}

/** Categories that belong to properties (an investment's own area), left out of "recent spending" like housing. */
export function propertyCats(s: Settings): Set<string> {
  const areas = new Set(propertiesOf(s).map((p) => p.area).filter(Boolean));
  return new Set([...HOUSING_CATS, ...CATEGORIES.filter((c) => c.groupKey && areas.has(c.groupKey)).map((c) => c.id)]);
}

/** Usual monthly spending on everything except housing and properties, from the last few complete months (one-offs left out). */
export function usualLiving(data: Pick<Data, 'transactions' | 'coverage' | 'settings'>, months = 3, also: Set<string> = new Set()): { living: number; invest: number; from: string[] } {
  const skip = new Set([...propertyCats(data.settings), ...also]);
  const recent = completeMonths(data).slice(-months);
  const sums = recent.map((m) => summarise(m, data));
  const living = average(sums.map((s) => Object.entries(s.byCategoryUsual).filter(([c]) => !skip.has(c)).reduce((a, [, v]) => a + v, 0)));
  return { living, invest: average(sums.map((s) => s.invest)), from: recent };
}

/** Budget lines paid by the term, quarter or year (with an amount): the forecast times these instead of averaging them. */
export function timedCats(data: Pick<Data, 'budgets' | 'settings'>, month: string): Set<string> {
  return new Set(Object.entries(data.settings.budgetEvery ?? {}).filter(([c, f]) => lumpy(f.every) && budgetFor(data.budgets, c, month) > 0).map(([c]) => c));
}

/** When a child's fund starts: its own start, else the first month the budget puts money into the uni funds. */
export function uniStart(f: UniFund, budgets: Data['budgets'], fallback: string): string {
  if (f.start) return f.start;
  const first = budgets.filter((b) => b.category === 'keep-uni' && b.amount > 0).map((b) => b.from).sort()[0];
  return first ?? fallback;
}

export interface LoanInputs { setup: Setup; changes: Change[]; lumps: Lump[]; anchor?: Anchor; rentUntil?: string }

/** Turn a property and the family's real figures into the loan calculator's inputs:
 *  take-home from the pay records, living costs from real spending, rent until the lease ends, uni funds from Goals,
 *  and real loan and offset balances once statements have them. */
export function loanInputs(data: Data, p: Property, opts: { offsetStart?: number; living?: number } = {}): LoanInputs | null {
  const l = p.loan;
  if (!l?.amount) return null;
  const s = data.settings;
  const start = l.firstRepayment || monthOf(p.settlement);
  const pays = earners(s, start).map((e) => e.takeHome * PER_MONTH[e.every]).sort((a, b) => b - a);
  const others = propertiesOf(s, data.budgets).filter((q) => q.id !== p.id);
  // Lines paid by the term, quarter or year count at their monthly equivalent here (the loan looks years ahead).
  const timed = timedCats(data, start);
  const living0 = opts.living ?? usualLiving(data, 3, timed).living + [...timed].reduce((a, c) => a + budgetFor(data.budgets, c, start), 0);
  // Everything that isn't this loan's repayment: living, every property's running costs, other loans, less rent received.
  const outgoings = (m: string) => living0 + propertiesOf(s, data.budgets).filter((q) => ownedIn(q, m)).reduce((a, q) => a + runningMonthly(q) - rentIn(q, m), 0)
    + others.filter((q) => q.loan && ownedIn(q, m)).reduce((a, q) => a + repaymentOf(q.loan!), 0)
    + budgetFor(data.budgets, 'keep-shares', m);
  const rent = (m: string) => (p.use === 'home' ? budgetFor(data.budgets, 'rent', m) : 0);
  const changes: Change[] = [...(l.changes ?? [])];
  // Rent still paid in the first months (a lease running past settlement), as a temporary rise in living costs.
  let rentUntil: string | undefined;
  for (let m = start; rent(m) > 0 && m < addMonths(start, 36); m = addMonths(m, 1)) rentUntil = m;
  if (rentUntil) changes.push({ id: 'rent-overlap', month: start, until: rentUntil, type: 'living', value: outgoings(start) + rent(start) });
  const funds = s.uniFunds ?? [];
  const kids: Kid[] = funds.map((f) => ({ name: f.name, monthly: f.monthly, start: uniStart(f, data.budgets, start), uni: f.year, goal: f.target }));
  const setup: Setup = {
    loan: l.amount, rate: l.rate, term: l.term, start, offset0: opts.offsetStart ?? l.offsetStart ?? 0,
    inc1: pays[0] ?? 0, inc2: pays.slice(1).reduce((a, b) => a + b, 0), living: outgoings(rentUntil ? addMonths(rentUntil, 1) : start),
    sac1: 0, sac2: 0, tax: 0, growth: 0, extra: l.extra ?? 0, sweep: l.sweep ?? true, bonus: 0, bonusMonth: 7,
    kids, kidsInOffset: funds.every((f) => f.inOffset !== false), eduRate: 4, uniYears: 3,
  };
  if (l.repayment && Math.abs(l.repayment - annuity(l.amount, l.rate / 1200, l.term * 12)) > 1)
    changes.push({ id: 'bank-repayment', month: start, type: 'rate', value: l.rate, repayment: l.repayment });
  return { setup, changes, lumps: l.lumps ?? [], anchor: anchorFor(data, p, start), rentUntil };
}

/** The latest month-end with real balances for both the loan and its offset. */
function anchorFor(data: Data, p: Property, start: string): Anchor | undefined {
  const l = p.loan!;
  if (!l.loanAccount || !l.offsetAccount) return undefined;
  const at = (acc: string, date: string) => data.settings.balances.find((b) => b.account === acc && b.date === date)?.amount;
  const ends = data.settings.balances.filter((b) => b.account === l.loanAccount && monthOf(b.date) >= start).map((b) => b.date).sort().reverse();
  for (const d of ends) {
    const loan = at(l.loanAccount, d), offset = at(l.offsetAccount, d);
    if (loan !== undefined && offset !== undefined) return { month: monthOf(d), loan: Math.abs(loan), offset, kids: [] };
  }
  return undefined;
}

export interface LoanView {
  inputs: LoanInputs;
  /** On real balances where there are any, else on the plan. */
  now: SimResult;
  /** The plan alone, ignoring real balances. */
  plan: SimResult;
  /** Paying only the bank's minimum: no offset, no extras. */
  bank: SimResult;
}

export function runLoan(data: Data, p: Property, opts: { offsetStart?: number; living?: number; changes?: Change[]; lumps?: Lump[] } = {}): LoanView | null {
  const inputs = loanInputs(data, p, opts);
  if (!inputs) return null;
  const changes = [...inputs.changes, ...(opts.changes ?? [])];
  const lumps = [...inputs.lumps, ...(opts.lumps ?? [])];
  const plan = simulate(inputs.setup, changes, lumps);
  const now = inputs.anchor ? simulate(inputs.setup, changes, lumps, { anchor: inputs.anchor }) : plan;
  const bank = simulate(inputs.setup, changes, lumps, { extras: false });
  return { inputs: { ...inputs, changes, lumps }, now, plan, bank };
}

export const pointIn = (r: SimResult, month: string) => r.points.find((x) => x.idx === toIdx(month));
export { toIdx, toYM };
