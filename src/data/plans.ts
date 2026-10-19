/** Plans for a property's loan, in the Loan Planner's way: what really happened (facts) applies to every plan; each plan keeps its
 *  own guesses about the future; one plan is active. Wording, presets and "what if one thing changed" live here. */
import { addMonths, monthOf } from './analysis';
import { simulate, toIdx, type Change, type ChangeType, type Lump, type SimResult } from '../loan';
import { checkInsOf, plansOf, PLAN_COLORS, runLoan, type LoanInputs, type LoanView } from './property';
import type { Data, LoanPlan, Property } from './types';

const m$ = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
const k$ = (n: number) => { const a = Math.abs(n); return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}m` : a >= 10000 ? `$${Math.round(a / 1000)}k` : a >= 1000 ? `$${(a / 1000).toFixed(1)}k` : m$(a); };
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const mon = (ym: string) => `${SHORT[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;

/** Kinds of guess a plan can hold (in the order the menu shows them). Take-home is named after the person. */
export function guessKinds(earners: string[]): { type: ChangeType; label: string }[] {
  return [
    { type: 'rate', label: 'Interest rate' },
    { type: 'extra', label: 'Extra into the offset' },
    { type: 'sweep', label: 'Put all spare money in' },
    { type: 'inc1', label: `${earners[0] ?? 'First'}’s take-home` },
    { type: 'inc2', label: earners.length > 2 ? 'Everyone else’s take-home' : `${earners[1] ?? 'Second'}’s take-home` },
    { type: 'living', label: 'Living costs' },
    { type: 'bonus', label: 'Yearly bonus' },
  ];
}

/** Kinds of fact recorded on Record. Pay is recorded on Wealth, living costs come from your spending, uni saving from Uni funds. */
export const FACT_KINDS: { type: ChangeType | 'lump'; label: string }[] = [
  { type: 'rate', label: 'Interest rate' },
  { type: 'extra', label: 'Extra into the offset' },
  { type: 'sweep', label: 'Put all spare money in' },
  { type: 'bonus', label: 'Yearly bonus' },
  { type: 'lump', label: 'Lump sum into the offset' },
];

export function formatValue(type: ChangeType, value: number): string {
  if (type === 'rate') return `${value.toFixed(2)}%`;
  if (type === 'sweep') return value ? 'on' : 'off';
  return m$(value);
}

/** "From Jul 2028 to Jun 2029, Person B's take-home becomes $0 a month, then goes back." */
export function describeChange(c: Change, earners: string[]): string {
  const when = c.until ? `From ${mon(c.month)} to ${mon(c.until)}` : `From ${mon(c.month)}`;
  const v = formatValue(c.type, c.value);
  let what: string;
  switch (c.type) {
    case 'rate':
      what = `the rate becomes ${v}`;
      if (c.keepPaying) what += `, and you keep paying ${m$(c.keepPaying)}`;
      else if (c.repayment) what += `, and the bank sets the repayment to ${m$(c.repayment)}`;
      break;
    case 'extra': what = `extra into the offset becomes ${v} a month`; break;
    case 'sweep': what = c.value ? 'all spare money goes into the offset' : 'spare money stops going into the offset automatically'; break;
    case 'inc1': what = `${earners[0] ?? 'the larger'}’s take-home becomes ${v} a month`; break;
    case 'inc2': what = `${earners.length > 2 ? 'everyone else' : earners[1] ?? 'the other'}’s take-home becomes ${v} a month`; break;
    case 'living': what = `living costs become ${v} a month`; break;
    case 'bonus': what = `the yearly bonus becomes ${v}`; break;
    default: what = `${c.type} becomes ${v}`;
  }
  return `${when}, ${what}${c.until ? ', then goes back' : ''}.`;
}

/** A few words for a chip on the chart's timeline: "Rate 5.95%", "Person B $0", "+$20k". */
export function shortLabel(c: Change, earners: string[]): string {
  switch (c.type) {
    case 'rate': return `Rate ${c.value.toFixed(2)}%`;
    case 'inc1': return `${earners[0] ?? 'Pay'} ${k$(c.value)}`;
    case 'inc2': return `${earners[1] ?? 'Pay'} ${k$(c.value)}`;
    case 'living': return `Costs ${k$(c.value)}`;
    case 'extra': return `Extra ${k$(c.value)}`;
    case 'sweep': return c.value ? 'Sweep on' : 'Sweep off';
    case 'bonus': return `Bonus ${k$(c.value)}`;
    default: return c.type;
  }
}

/** Chips for the timeline under the loan chart: recorded facts and the plan's guesses (not the automatic pay/budget/rent lines). */
export function laneItems(p: Property, plan: LoanPlan, earners: string[]) {
  const l = p.loan!;
  const ch = (c: Change, recorded: boolean) => ({ id: c.id, start: toIdx(c.month), end: c.until ? toIdx(c.until) : undefined, label: shortLabel(c, earners), description: `${recorded ? 'Recorded' : 'Guess'}: ${describeChange(c, earners)}`, recorded });
  const lu = (x: Lump, recorded: boolean) => ({ id: x.id, start: toIdx(x.month), end: undefined, label: `+${k$(x.amount)}`, description: `${recorded ? 'Recorded' : 'Guess'}: ${m$(x.amount)} lump sum into the offset.`, recorded });
  return [...(l.changes ?? []).map((c) => ch(c, true)), ...(l.lumps ?? []).map((x) => lu(x, true)), ...plan.changes.map((c) => ch(c, false)), ...plan.lumps.map((x) => lu(x, false))]
    .sort((a, b) => a.start - b.start);
}

/** The value a setting had in the month before `month`, read off the projection (for pre-filling a change). */
export function valueBefore(res: SimResult, inp: LoanInputs, type: ChangeType, month: string): number {
  const p = res.points.find((x) => x.idx === toIdx(month) - 1);
  if (!p) {
    const s = inp.setup;
    return type === 'rate' ? s.rate : type === 'sweep' ? (s.sweep ? 1 : 0) : type === 'inc1' ? s.inc1 : type === 'inc2' ? s.inc2 : type === 'living' ? s.living : type === 'bonus' ? s.bonus : s.extra;
  }
  switch (type) {
    case 'rate': return p.rate;
    case 'extra': return p.settings.extra;
    case 'sweep': return p.settings.sweep ? 1 : 0;
    case 'inc1': return p.settings.inc1;
    case 'inc2': return p.settings.inc2;
    case 'living': return p.settings.living;
    case 'bonus': return p.settings.bonus;
    default: return 0;
  }
}

/** The bank's likely new repayment if the rate becomes `rate` from `month`: the balance then, over the years left. */
export function estimateRepayment(res: SimResult, month: string, rate: number): number {
  const before = res.points.find((p) => p.idx === toIdx(month) - 1) ?? res.points[0];
  const left = Math.max(1, res.termMonths - (toIdx(month) - res.startIdx));
  const r = rate / 1200;
  return r === 0 ? before.loan / left : (before.loan * r) / (1 - Math.pow(1 + r, -left));
}

/** Quick guesses, dated from `from`. `rate` is the rate in effect then. */
export function presets(from: string, rate: number, inp: LoanInputs): { label: string; changes: Omit<Change, 'id'>[] }[] {
  const at = (n: number) => addMonths(from, n);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const s = inp.setup;
  const one = inp.earners[1] ? `A year on ${inp.earners[0]}’s pay alone` : 'A year on one income';
  return [
    { label: 'Rate falls 0.25% every 6 months for 2 years', changes: [1, 2, 3, 4].map((k) => ({ month: at(6 * (k - 1)), type: 'rate', value: r2(rate - 0.25 * k) })) },
    { label: 'Rate rises 0.25% every 6 months for 2 years', changes: [1, 2, 3, 4].map((k) => ({ month: at(6 * (k - 1)), type: 'rate', value: r2(rate + 0.25 * k) })) },
    { label: 'Rates up 1.5% over 3 years, then back down', changes: [
      ...[1, 2, 3, 4, 5, 6].map((k) => ({ month: at(6 * (k - 1)), type: 'rate' as const, value: r2(rate + 0.25 * k) })),
      ...[1, 2, 3, 4, 5, 6].map((k) => ({ month: at(36 + 6 * (k - 1)), type: 'rate' as const, value: r2(rate + 1.5 - 0.25 * k) })),
    ] },
    { label: one, changes: [{ month: at(12), until: at(23), type: 'inc2', value: 0 }] },
    { label: `${inp.earners[0] ?? 'Your'}’s pay rises $1,000 a month`, changes: [{ month: at(6), type: 'inc1', value: s.inc1 + 1000 }] },
    { label: 'Living costs rise $1,000 a month', changes: [{ month: at(12), type: 'living', value: s.living + 1000 }] },
    { label: 'Pause the extra for 6 months', changes: [{ month: at(6), until: at(11), type: 'extra', value: 0 }] },
  ];
}

export interface PlanSummary {
  paidIdx: number; paidMonth: number; interest: number; timeSaved: number; interestSaved: number;
  /** Months where costs are more than pay while the loan runs; what came out of the offset, and what it couldn't cover. */
  shortMonths: number; drawn: number; unfunded: number;
  /** What's spare in a typical month of the first three years (median), and whether the plan's extra asks for more than that. */
  typicalSpare: number; overAsks: boolean;
}
export function summarize(v: LoanView): PlanSummary {
  let shortMonths = 0, drawn = 0, unfunded = 0;
  for (const p of v.now.points) { if (!p.loanActive) break; if (p.spare < 0) shortMonths++; drawn += p.drawn; unfunded += p.unfunded; }
  const first = v.now.points.filter((p) => p.loanActive).slice(0, 36);
  const median = (xs: number[]) => { const o = [...xs].sort((a, b) => a - b); return o.length ? o[Math.floor(o.length / 2)] : 0; };
  const typicalSpare = median(first.map((p) => Math.max(0, p.spare)));
  // What the plan asks for in those months (budget lines and changes included), against what's there.
  const overAsks = first.some((p) => !p.settings.sweep) && median(first.map((p) => (p.settings.sweep ? 0 : p.settings.extra))) > typicalSpare + 50;
  return { paidIdx: v.now.paidIdx, paidMonth: v.now.paidMonth, interest: v.now.totalInterest, timeSaved: v.bank.paidMonth - v.now.paidMonth,
    interestSaved: v.bank.totalInterest - v.now.totalInterest, shortMonths, drawn, unfunded, typicalSpare, overAsks };
}

/** "What if one thing changed": each line changes one thing in the active plan and keeps everything else. */
export function whatIfs(plan: LoanPlan, base: LoanView) {
  const inp = base.inputs;
  const vary = (label: string, fn: (i: LoanInputs) => LoanInputs, more = false) => {
    const i = fn({ ...inp, setup: { ...inp.setup }, changes: [...inp.changes], lumps: [...inp.lumps] });
    const res = simulate(i.setup, i.changes, i.lumps, inp.anchor ? { anchor: inp.anchor } : {});
    const months = res.paidMonth - base.now.paidMonth, interest = res.totalInterest - base.now.totalInterest;
    // Extra is capped at what's spare each month: if more changes nothing, say why.
    const note = more && months === 0 && Math.abs(interest) < 500 ? 'Nothing spare for it: this plan already puts in all that’s left each month.' : undefined;
    return { label, paidIdx: res.paidIdx, months, interest, note };
  };
  const shift = (by: number) => (i: LoanInputs) => ({ ...i, setup: { ...i.setup, rate: i.setup.rate + by }, changes: i.changes.map((c) => (c.type === 'rate' ? { ...c, value: c.value + by, repayment: undefined } : c)) });
  // The plan's own monthly extra (what it asks for), not what a short month could actually put in.
  const planned = inp.setup.extra;
  const fixedExtra = (v: number) => (i: LoanInputs) => ({ ...i, setup: { ...i.setup, sweep: false, extra: Math.max(0, v) }, changes: i.changes.filter((c) => c.type !== 'extra' && c.type !== 'sweep') });
  const rows = [
    vary('Rates 1% higher throughout', shift(1)),
    vary('Rates 1% lower throughout', shift(-1)),
    ...(!inp.setup.sweep && planned >= 500 ? [vary('$500 a month less into the offset', fixedExtra(planned - 500))] : []),
    ...(!inp.setup.sweep ? [vary('$500 a month more into the offset', fixedExtra(planned + 500), true), vary('$1,000 a month more into the offset', fixedExtra(planned + 1000), true)] : []),
    ...(!inp.setup.sweep ? [vary('All spare money into the offset', (i) => ({ ...i, setup: { ...i.setup, sweep: true }, changes: i.changes.filter((c) => c.type !== 'sweep') }), true)] : []),
    vary('None of this plan’s guesses', (i) => ({ ...i, changes: i.changes.filter((c) => !plan.changes.some((g) => g.id === c.id)), lumps: i.lumps.filter((l) => !plan.lumps.some((g) => g.id === l.id)) })),
    vary('$20,000 less in the offset at the start', (i) => ({ ...i, setup: { ...i.setup, offset0: Math.max(0, i.setup.offset0 - 20000) } })),
  ];
  if (inp.rentUntil && inp.rentUntil > monthOf(new Date().toISOString())) {
    const ru = inp.rentUntil;
    rows.push(vary('The lease ends 2 months early', (i) => ({ ...i, changes: [...i.changes, { id: 'lease', month: addMonths(ru, -1) > i.setup.start ? addMonths(ru, -1) : i.setup.start, until: ru, type: 'living', value: i.setup.living }] })));
  }
  return rows;
}

export function duplicatePlan(plan: LoanPlan, existing: LoanPlan[]): LoanPlan {
  const base = plan.name.replace(/ copy( \d+)?$/, '');
  let name = `${base} copy`;
  for (let n = 2; existing.some((x) => x.name === name); n++) name = `${base} copy ${n}`;
  return { ...structuredClone(plan), id: `p-${Math.random().toString(36).slice(2, 9)}`, name: name.slice(0, 60), color: PLAN_COLORS[existing.length % PLAN_COLORS.length], editedAt: new Date().toISOString() };
}

/** What the plan expected at the end of `month`, working forward from the check-in before it (offset as a statement shows it). */
export function expectedAt(data: Data, p: Property, plan: LoanPlan, month: string, offsetStart: number) {
  const v = runLoan(data, p, { plan, offsetStart, anchorBefore: month })!;
  const pt = v.now.points.find((x) => x.idx === toIdx(month)) ?? v.now.points[0];
  const kids = v.inputs.setup.kidsInOffset ? pt.kids.reduce((a, b) => a + b, 0) : 0;
  return { loan: pt.loan, offset: pt.offset + kids, net: pt.net, kids: pt.kids };
}

/** Net debt for a check-in: loan minus offset, not counting uni money held in the offset. */
export const checkInNet = (c: { loan: number; offset: number; kids: number[] }, kidsInOffset: boolean) =>
  c.loan - (c.offset - (kidsInOffset ? c.kids.filter((k) => Number.isFinite(k)).reduce((a, b) => a + b, 0) : 0));

export { checkInsOf, plansOf };
