import { simulate } from '../loan';
import { addMonths, budgetFor, cashOnHand, keepBudget, lastDay, monthOf, totalBudget } from './analysis';
import { loanInputs, ownedIn, propertiesOf, propertyCats, rentIn, runningMonthly, toIdx, usualLiving } from './property';
import type { Data, Property } from './types';
import { expectedIncome } from './wealth';
import { money, monthName, monthOnly, pct, thisMonth } from '../lib/format';

/** Spending to plan on: what the family has really been spending lately, or what the budget says. */
export type Basis = 'recent' | 'budget';

/** A buying cost; `settles` marks the ones paid at settlement (the rest, like a deposit, go earlier). */
export interface OneOff { label: string; amount: number; property: string; settles: boolean }

export interface ForecastMonth {
  month: string;
  /** Take-home pay. */
  pay: number;
  /** Rent received from investment properties. */
  rentIn: number;
  /** Spending on everything except housing and properties. */
  living: number;
  /** Rent the family pays. */
  rent: number;
  repayments: number;
  /** Rates, water, insurance and the like for properties owned. */
  running: number;
  /** Shares and other investing that leaves the bank. */
  invest: number;
  /** Buying costs not yet in the bank balances: deposit, stamp duty, fees. */
  oneOffs: OneOff[];
  /** Change in cash this month (negative: drawn from savings). */
  kept: number;
  /** Cash at the end of the month. */
  cash: number;
  /** Pay minus everything budgeted (spending and keeping): money still without a job. Negative: planned beyond income. */
  unassigned: number;
  /** Only part of this month is still to come (balances are from partway through it). */
  part?: number;
}

export interface Forecast {
  basis: Basis;
  start: { cash: number; asOf: string | null };
  months: ForecastMonth[];
  /** Usual monthly living costs used, and the months they came from. */
  living: { amount: number; from: string[] };
}

/** Has the bank balance this cost would come out of already been read after it was paid? */
function inBalances(c: Property['costs'][number], data: Data): boolean {
  const s = data.settings;
  const live = s.accounts.filter((a) => a.type !== 'loan' && a.type !== 'card' && !a.closedOn).map((a) => a.key);
  const latest = (acc: string) => s.balances.filter((b) => b.account === acc).map((b) => b.date).sort().at(-1);
  const dates = (c.account ? [c.account] : live).map(latest).filter((d): d is string => !!d);
  if (!dates.length) return false;
  return c.date <= dates.sort()[0];
}

/** Month-by-month cash from the latest bank balances: pay in, living costs, rent, loan repayments, property costs and buying costs out. */
export function forecast(data: Data, opts: { basis?: Basis; months?: number; from?: string } = {}): Forecast {
  const basis = opts.basis ?? 'recent';
  const s = data.settings;
  const props = propertiesOf(s, data.budgets);
  const usual = usualLiving(data);
  const recentOk = basis === 'recent' && usual.from.length > 0;
  const skip = propertyCats(s);
  const held = cashOnHand(s);
  const start = { cash: held.total, asOf: held.asOf };
  const today = opts.from ?? thisMonth();
  const first = start.asOf && monthOf(start.asOf) < today ? monthOf(start.asOf) : today;
  const end = addMonths(today, (opts.months ?? 9) - 1);
  const repay = new Map(props.map((p) => {
    const inp = loanInputs(data, p, { living: 0 });
    return [p.id, inp ? simulate(inp.setup, inp.changes, inp.lumps, { extras: false }) : null];
  }));
  const costs = props.flatMap((p) => p.costs.filter((c) => !inBalances(c, data)).map((c) => ({ ...c, property: p.name, settles: monthOf(c.date) === monthOf(p.settlement) })));
  let cash = start.cash;
  const out: ForecastMonth[] = [];
  for (let m = first; m <= end; m = addMonths(m, 1)) {
    const day = start.asOf && monthOf(start.asOf) === m ? Number(start.asOf.slice(8, 10)) : 0;
    const part = day ? Math.max(0, 1 - day / Number(lastDay(m).slice(8, 10))) : 1;
    const pay = expectedIncome(s, m);
    const living = recentOk ? usual.living : totalBudget(data.budgets, m) - [...skip].reduce((a, c) => a + budgetFor(data.budgets, c, m), 0);
    const owned = props.filter((p) => ownedIn(p, m));
    const repayments = props.reduce((a, p) => a + (repay.get(p.id)?.points.find((x) => x.idx === toIdx(m))?.paidOut ?? 0), 0);
    const running = owned.reduce((a, p) => a + runningMonthly(p), 0);
    const rentInM = props.reduce((a, p) => a + rentIn(p, m), 0);
    const rent = budgetFor(data.budgets, 'rent', m);
    const invest = recentOk ? usual.invest : budgetFor(data.budgets, 'keep-shares', m);
    // A cost dated before the balances were read but not in them yet comes out straight away.
    const oneOffs = costs.filter((c) => (monthOf(c.date) < first ? m === first : monthOf(c.date) === m)).map((c) => ({ label: c.label, amount: c.amount, property: c.property, settles: c.settles }));
    const flow = (pay + rentInM - living - rent - repayments - running - invest) * part;
    const kept = flow - oneOffs.reduce((a, c) => a + c.amount, 0);
    cash += kept;
    const unassigned = pay - totalBudget(data.budgets, m) - keepBudget(data.budgets, m);
    if (m >= today) out.push({ month: m, pay, rentIn: rentInM, living, rent, repayments, running, invest, oneOffs, kept, cash, unassigned, ...(part < 1 ? { part } : {}) });
  }
  return { basis: recentOk ? 'recent' : 'budget', start, months: out, living: { amount: usual.living, from: usual.from } };
}

/** Everything that goes out in a usual month (not buying costs). */
export const outgoings = (x: ForecastMonth) => x.living + x.rent + x.repayments + x.running + x.invest;

export interface Story {
  /** 'yes': cash never drops below 3 months of outgoings; 'tight': below 3 months; 'no': runs out. */
  verdict: 'yes' | 'tight' | 'no';
  headline: string;
  lines: string[];
  low: ForecastMonth | null;
  /** Months of outgoings the lowest cash would cover. */
  cover: number;
  /** Runs of months where more goes out than comes in. */
  squeezes: { from: string; to: string; perMonth: number; total: number }[];
  /** The first settled-in month after any squeeze: what's kept from then on. */
  after: ForecastMonth | null;
  settlements: { property: string; month: string; before: number; after: number; paid: number }[];
}

const span = (a: string, b: string) => (a === b ? monthName(a) : `${monthOnly(a)} to ${monthName(b)}`);

/** The forecast in words: the same sentences on Home, Property and in the money meeting. */
export function story(f: Forecast): Story {
  const ms = f.months;
  const settlements: Story['settlements'] = [];
  ms.forEach((x, i) => {
    const byProp = new Map<string, number>();
    for (const c of x.oneOffs.filter((o) => o.settles)) byProp.set(c.property, (byProp.get(c.property) ?? 0) + c.amount);
    for (const [property, paid] of byProp) {
      const before = i ? ms[i - 1].cash : f.start.cash;
      settlements.push({ property, month: x.month, before, after: before - paid, paid });
    }
  });
  const squeezes: Story['squeezes'] = [];
  for (let i = 0; i < ms.length; i++) {
    const flow = (x: ForecastMonth) => x.kept + x.oneOffs.reduce((a, c) => a + c.amount, 0);
    if (flow(ms[i]) >= 0 || ms[i].part) continue;
    let j = i;
    while (j + 1 < ms.length && flow(ms[j + 1]) < 0) j++;
    const run = ms.slice(i, j + 1).map(flow);
    squeezes.push({ from: ms[i].month, to: ms[j].month, perMonth: -run.reduce((a, b) => a + b, 0) / run.length, total: -run.reduce((a, b) => a + b, 0) });
    i = j;
  }
  const lastSqueeze = squeezes.at(-1)?.to;
  const after = ms.find((x) => !x.part && (!lastSqueeze || x.month > lastSqueeze) && (!settlements.length || x.month > settlements.at(-1)!.month)) ?? null;
  const low = ms.length ? ms.reduce((a, b) => (b.cash < a.cash ? b : a)) : null;
  const steady = ms.filter((x) => !x.part).slice(-3);
  const monthly = steady.length ? steady.reduce((a, x) => a + outgoings(x), 0) / steady.length : 0;
  const cover = low && monthly ? low.cash / monthly : 0;
  const verdict: Story['verdict'] = !low ? 'yes' : low.cash < 0 ? 'no' : cover < 3 ? 'tight' : 'yes';

  const lines: string[] = [];
  for (const x of ms) for (const c of x.oneOffs.filter((o) => !o.settles)) lines.push(`${c.property}: the ${money(c.amount)} ${c.label.replace(/ \(.*\)$/, '').toLowerCase()} isn't in the bank balances yet, so it comes off${x.part ? ' now' : ` in ${monthName(x.month)}`}.`);
  for (const st of settlements) lines.push(`${st.property}: about ${money(st.before)} before settlement in ${monthOnly(st.month)}, ${money(st.after)} after ${money(st.paid)} of buying costs.`);
  for (const q of squeezes) lines.push(`${span(q.from, q.to)}: about ${money(q.perMonth)} a month more going out than coming in, ${money(q.total)} in all.`);
  if (after) {
    const rate = after.pay ? after.kept / after.pay : 0;
    lines.push(`From ${monthName(after.month)} you'd keep about ${money(after.kept)} a month (${pct(rate)})${rate < 0.1 ? `, under Babylon's tenth of ${money(after.pay * 0.1)}` : ''}.`);
  }
  if (low) lines.push(`Cash is lowest in ${monthName(low.month)}, at about ${money(low.cash)}: ${cover.toFixed(1)} months of spending. Ramsey's emergency fund is 3 to 6.`);
  const headline = verdict === 'yes' ? 'Yes, you can carry it.' : verdict === 'tight' ? 'You can carry it, but it gets tight.' : 'Not as things stand: cash runs out.';
  return { verdict, headline, lines, low, cover, squeezes, after, settlements };
}
