import { annuity, simulate, toIdx, toYM, type Anchor, type Change, type Kid, type Lump, type Setup, type SimResult } from '../loan';
import { addMonths, average, budgetFor, completeMonths, lastDay, monthOf, summarise } from './analysis';
import { CATEGORIES } from './categories';
import type { Data, LoanPlan, Property, PropertyLoan, Settings, UniFund, UniPlan } from './types';
import { earners, PER_MONTH } from './wealth';
import { lumpy } from './frequency';
import { thisMonth } from '../lib/format';

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

export interface LoanInputs {
  setup: Setup;
  /** Everything that moves over time, in the order the calculator applies it: automatic (pay, budget, rent, uni), then what happened, then the plan's guesses. */
  changes: Change[];
  lumps: Lump[];
  anchor?: Anchor;
  rentUntil?: string;
  /** People behind "inc1" and "inc2", for wording. */
  earners: string[];
  plan: LoanPlan;
  /** Is this the active plan (its extra into the offset is the Budget's "Savings & offset" line)? */
  active: boolean;
}

export const PLAN_COLORS = ['#2a78d6', '#8b4fd8', '#e2622d', '#14a37f', '#db2777', '#0891b2'];
export const UNI_DEFAULT: UniPlan = { inOffset: true, returnPct: 4, years: 3 };
export const uniPlanOf = (s: Settings): UniPlan => ({ ...UNI_DEFAULT, ...(s.uniPlan ?? {}), ...(s.uniPlan ? {} : { inOffset: (s.uniFunds ?? []).every((f) => f.inOffset !== false) }) });

/** A property's plans; one made from the old loan settings if there are none yet. */
export function plansOf(p: Property): LoanPlan[] {
  const l = p.loan;
  if (l?.plans?.length) return l.plans;
  return [{ id: 'plan', name: 'My plan', color: PLAN_COLORS[0], changes: [], lumps: [], sweep: l?.sweep ?? false, offsetStart: l?.offsetStart, editedAt: '' }];
}
export const activePlanOf = (p: Property): LoanPlan => { const ps = plansOf(p); return ps.find((x) => x.id === p.loan?.activePlan) ?? ps[0]; };

/** The first month a plan's own settings apply from: next month, or the first repayment if the loan hasn't started. */
export function planFrom(p: Property, today = thisMonth()): string {
  const next = addMonths(today, 1);
  const start = p.loan?.firstRepayment || monthOf(p.settlement);
  return next > start ? next : start;
}

/** Turn a property, a plan and the family's real figures into the loan calculator's inputs:
 *  take-home from the Wealth page (with every pay change), living costs from real spending, rent until the lease ends,
 *  into the offset from the Budget, uni funds from the Uni funds page, and real loan and offset balances once they're in. */
export function loanInputs(data: Data, p: Property, opts: { plan?: LoanPlan; offsetStart?: number; living?: number; noFacts?: boolean; anchorBefore?: string; noAnchor?: boolean } = {}): LoanInputs | null {
  const l = p.loan;
  if (!l?.amount) return null;
  const s = data.settings;
  const plan = opts.plan ?? activePlanOf(p);
  const active = plan.id === activePlanOf(p).id;
  const start = l.firstRepayment || monthOf(p.settlement);
  const horizon = addMonths(start, l.term * 12 + 120);

  // Take-home: the person with the larger pay is "inc1", everyone else together "inc2". Every pay change on the Wealth page follows.
  const order = earners(s, start).sort((a, b) => b.takeHome * PER_MONTH[b.every] - a.takeHome * PER_MONTH[a.every]).map((e) => e.person);
  for (const e of earners(s, horizon)) if (!order.includes(e.person)) order.push(e.person);
  const incomes = (m: string) => {
    const by = new Map(earners(s, m).map((e) => [e.person, e.takeHome * PER_MONTH[e.every]]));
    return { inc1: by.get(order[0]) ?? 0, inc2: order.slice(1).reduce((a, n) => a + (by.get(n) ?? 0), 0) };
  };
  const auto: Change[] = [];
  const payMonths = [...new Set((s.pay ?? []).map((x) => x.from).filter((m) => m > start))].sort();
  for (const m of payMonths) { const v = incomes(m); auto.push({ id: `pay1-${m}`, month: m, type: 'inc1', value: v.inc1 }, { id: `pay2-${m}`, month: m, type: 'inc2', value: v.inc2 }); }

  const others = propertiesOf(s, data.budgets).filter((q) => q.id !== p.id);
  // Lines paid by the term, quarter or year count at their monthly equivalent here (the loan looks years ahead).
  const timed = timedCats(data, start);
  const living0 = opts.living ?? usualLiving(data, 3, timed).living + [...timed].reduce((a, c) => a + budgetFor(data.budgets, c, start), 0);
  // Everything that isn't this loan's repayment or the offset: living, every property's running costs, other loans, less rent received.
  const outgoings = (m: string) => living0 + propertiesOf(s, data.budgets).filter((q) => ownedIn(q, m)).reduce((a, q) => a + runningMonthly(q) - rentIn(q, m), 0)
    + others.filter((q) => q.loan && ownedIn(q, m)).reduce((a, q) => a + repaymentOf(q.loan!), 0)
    + budgetFor(data.budgets, 'keep-shares', m);
  const rent = (m: string) => (p.use === 'home' ? budgetFor(data.budgets, 'rent', m) : 0);
  // Rent still paid in the first months (a lease running past settlement), as a temporary rise in living costs.
  let rentUntil: string | undefined;
  for (let m = start; rent(m) > 0 && m < addMonths(start, 36); m = addMonths(m, 1)) rentUntil = m;
  if (rentUntil) auto.push({ id: 'rent-overlap', month: start, until: rentUntil, type: 'living', value: outgoings(start) + rent(start) });
  if (l.repayment && Math.abs(l.repayment - annuity(l.amount, l.rate / 1200, l.term * 12)) > 1)
    auto.push({ id: 'bank-repayment', month: start, type: 'rate', value: l.rate, repayment: l.repayment });

  // Into the offset: for the active plan, the Budget's "Savings & offset" line, month by month.
  const keep = (m: string) => budgetFor(data.budgets, 'keep-savings', m);
  if (active) for (const b of data.budgets.filter((x) => x.category === 'keep-savings' && x.from > start).map((x) => x.from).sort())
    auto.push({ id: `budget-${b}`, month: b, type: 'extra', value: keep(b) });

  // Uni funds, as set on their own page.
  const funds = s.uniFunds ?? [];
  const uni = uniPlanOf(s);
  const kids: Kid[] = funds.map((f) => ({ name: f.name, monthly: f.monthly, start: uniStart(f, data.budgets, start), uni: f.year, goal: f.target }));
  funds.forEach((f, i) => (f.changes ?? []).forEach((c) => auto.push({ id: `uni-${c.id}`, month: c.month, until: c.until, type: `kid${i}`, value: c.monthly })));

  const setup: Setup = {
    loan: l.amount, rate: l.rate, term: l.term, start, offset0: opts.offsetStart ?? plan.offsetStart ?? l.offsetStart ?? 0,
    ...incomes(start), living: outgoings(rentUntil ? addMonths(rentUntil, 1) : start),
    sac1: 0, sac2: 0, tax: 0, growth: plan.growth ?? 0,
    extra: active ? keep(start) : plan.extra ?? keep(start), sweep: plan.sweep ?? false,
    bonus: plan.bonus ?? 0, bonusMonth: plan.bonusMonth ?? 7,
    kids, kidsInOffset: uni.inOffset, eduRate: uni.returnPct, uniYears: uni.years,
  };
  const facts = opts.noFacts ? [] : l.changes ?? [];
  return {
    setup, changes: [...auto, ...facts, ...plan.changes], lumps: [...(opts.noFacts ? [] : l.lumps ?? []), ...plan.lumps],
    anchor: opts.noAnchor ? undefined : anchorFor(data, p, start, opts.anchorBefore), rentUntil, earners: order, plan, active,
  };
}

export interface CheckIn { month: string; loan: number; offset: number; kids: number[] }

/** Month-end balances for the loan and its offset, oldest first: typed in on Record, or read from statements once the loan and
 *  offset accounts are in (statements win for a month that has both). `fromStatements` says which. */
export function checkInsOf(data: Pick<Data, 'settings'>, p: Property): (CheckIn & { fromStatements?: boolean })[] {
  const l = p.loan;
  if (!l) return [];
  const funds = data.settings.uniFunds ?? [];
  const kidsAt = (m: string) => funds.map((f) => f.checkIns?.find((c) => c.month === m)?.amount ?? NaN);
  const byMonth = new Map<string, CheckIn & { fromStatements?: boolean }>();
  for (const c of l.checkIns ?? []) byMonth.set(c.month, { ...c, kids: kidsAt(c.month) });
  if (l.loanAccount && l.offsetAccount) {
    const bal = data.settings.balances;
    for (const b of bal.filter((x) => x.account === l.loanAccount)) {
      if (b.date !== lastDay(monthOf(b.date))) continue;
      const o = bal.find((x) => x.account === l.offsetAccount && x.date === b.date);
      if (!o) continue;
      const m = monthOf(b.date);
      byMonth.set(m, { month: m, loan: Math.abs(b.amount), offset: o.amount, kids: kidsAt(m), fromStatements: true });
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** The latest check-in to restart from (optionally only those before a month). */
function anchorFor(data: Data, p: Property, start: string, before?: string): Anchor | undefined {
  const c = checkInsOf(data, p).filter((x) => x.month >= start && (!before || x.month < before)).at(-1);
  if (!c) return undefined;
  // Uni balances only when every fund was checked in that month; otherwise the projection's own figures stand.
  return { month: c.month, loan: c.loan, offset: c.offset, kids: c.kids.every((k) => Number.isFinite(k)) ? c.kids : [] };
}

export interface LoanView {
  inputs: LoanInputs;
  /** On real balances where there are any, else on the plan. */
  now: SimResult;
  /** The plan alone, ignoring real balances. */
  plan: SimResult;
  /** Paying only the bank's minimum: no offset, no extras, on the same rates. */
  bank: SimResult;
  /** The plan as first set: none of what happened since, no real balances. */
  original: SimResult;
}

export function runLoan(data: Data, p: Property, opts: { plan?: LoanPlan; offsetStart?: number; living?: number; changes?: Change[]; lumps?: Lump[]; anchorBefore?: string } = {}): LoanView | null {
  const inputs = loanInputs(data, p, opts);
  if (!inputs) return null;
  const changes = [...inputs.changes, ...(opts.changes ?? [])];
  const lumps = [...inputs.lumps, ...(opts.lumps ?? [])];
  const plan = simulate(inputs.setup, changes, lumps);
  const now = inputs.anchor ? simulate(inputs.setup, changes, lumps, { anchor: inputs.anchor }) : plan;
  const bank = simulate(inputs.setup, changes, [], { extras: false });
  const first = loanInputs(data, p, { ...opts, noFacts: true, noAnchor: true })!;
  const original = simulate(first.setup, first.changes, first.lumps);
  return { inputs: { ...inputs, changes, lumps }, now, plan, bank, original };
}

export const pointIn = (r: SimResult, month: string) => r.points.find((x) => x.idx === toIdx(month));
export { toIdx, toYM };
