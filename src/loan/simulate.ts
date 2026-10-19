import { toIdx } from './dates';
import type { Change, ChangeType, Lump, MonthPoint, Setup, SimOptions, SimResult } from './types';

export function annuity(principal: number, monthlyRate: number, months: number): number {
  return monthlyRate === 0 ? principal / months : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

interface Timed {
  start: number;
  end: number | null;
  change: Change;
}

/**
 * Value of one setting in a month. Permanent changes set a new normal; a temporary change sits on top of
 * whatever is normal for its months, then the normal returns.
 */
function effective(timed: Timed[], type: ChangeType, idx: number, base: number): [number, Change | null] {
  let value = base;
  let src: Change | null = null;
  for (const t of timed) if (t.change.type === type && t.end === null && t.start <= idx) { value = t.change.value; src = t.change; }
  for (const t of timed) if (t.change.type === type && t.end !== null && t.start <= idx && idx <= t.end) { value = t.change.value; src = t.change; }
  return [value, src];
}

/**
 * Month-by-month projection of the loan, the offset and the college funds.
 * Interest is charged on the loan minus the offset (and minus college money if it sits in the offset).
 * "Paid off" is the first month the offset matches the loan.
 */
export function simulate(setup: Setup, changes: Change[], lumps: Lump[], options: SimOptions = {}): SimResult {
  const extras = options.extras !== false;
  const drawShortfall = options.drawShortfall !== false;
  const n = setup.term * 12;
  const startIdx = toIdx(setup.start);
  const sacCost = (setup.sac1 + setup.sac2) * (1 - setup.tax / 100);
  const anchorIdx = options.anchor ? toIdx(options.anchor.month) : null;

  const timed: Timed[] = changes
    .filter((c) => c.month)
    .map((c) => ({ start: toIdx(c.month), end: c.until ? toIdx(c.until) : null, change: c }))
    .sort((a, b) => a.start - b.start);
  const types = Array.from(new Set(timed.map((t) => t.change.type)));

  const base: Record<string, number> = {
    rate: setup.rate, inc1: setup.inc1, inc2: setup.inc2, living: setup.living, extra: setup.extra,
    bonus: setup.bonus, sweep: setup.sweep ? 1 : 0,
  };
  setup.kids.forEach((k, i) => { base[`kid${i}`] = k.monthly; });
  const live = { ...base };
  const kidMonthly = setup.kids.map((k) => k.monthly);

  let rateSrc: Change | null = null;
  let keepPaying = 0;
  let r = setup.rate / 100 / 12;
  let repayment = annuity(setup.loan, r, n);
  let loan = setup.loan;
  let offset = extras ? setup.offset0 : 0;
  let totalInterest = 0;
  let paid: number | null = null;
  const fund = setup.kids.map(() => 0);
  const drawPerMonth = setup.kids.map(() => 0);
  const atUni = setup.kids.map(() => 0);
  const contributed = setup.kids.map(() => 0);
  const uniIdx = setup.kids.map((k) => k.uni * 12 + 1);
  const kidStart = setup.kids.map((k) => toIdx(k.start));
  const lumpByIdx = new Map<number, number>();
  for (const l of lumps) if (l.month) lumpByIdx.set(toIdx(l.month), (lumpByIdx.get(toIdx(l.month)) ?? 0) + l.amount);

  const horizon = Math.max(n, ...setup.kids.map((k) => (k.uni + setup.uniYears) * 12 + 2 - startIdx));
  const points: MonthPoint[] = [];

  for (let m = 0; m < horizon; m++) {
    const idx = startIdx + m;
    const month1 = (idx % 12) + 1;
    const growth = Math.pow(1 + setup.growth / 100, Math.floor(m / 12));
    const loanActive = paid === null && m < n;

    for (const type of types) {
      const [value, src] = effective(timed, type, idx, base[type]);
      if (type === 'rate') {
        if (src !== rateSrc) {
          rateSrc = src;
          // A lender only resets the repayment when the rate actually moves (or sets a figure itself).
          if (value !== live.rate || src?.repayment || src?.keepPaying) {
            live.rate = value;
            r = value / 100 / 12;
            if (loanActive) repayment = src?.repayment ? src.repayment : annuity(loan, r, n - m);
            // A new repayment from the bank ends any "kept paying the old amount" arrangement unless this change sets one.
            keepPaying = src?.keepPaying ?? 0;
          }
        }
      } else if (type.startsWith('kid')) {
        const i = Number(type.slice(3));
        if (i < kidMonthly.length) kidMonthly[i] = value;
      } else {
        live[type] = value;
      }
    }

    const kidsSaving = kidMonthly.reduce((a, b) => a + b, 0);
    const kidsInOffsetNow = extras && setup.kidsInOffset ? fund.reduce((a, b) => a + b, 0) : 0;
    let interest = 0;
    if (loanActive) {
      interest = Math.max(0, loan - offset - kidsInOffsetNow) * r;
      totalInterest += interest;
      loan = Math.max(0, loan + interest - repayment);
    }

    const takeHome = (live.inc1 + live.inc2) * growth - sacCost;
    const living = live.living * growth;
    const paidOut = loanActive ? Math.max(repayment, keepPaying) : 0;
    const spare = takeHome - paidOut - living - kidsSaving;
    const room = Math.max(0, spare);
    let extra = 0;
    let drawn = 0;
    let unfunded = 0;

    if (extras) {
      if (loanActive) {
        extra = live.sweep ? room : Math.min(live.extra * growth, room);
        offset += extra + (paidOut - repayment);
        if (live.bonus && month1 === setup.bonusMonth) offset += live.bonus;
        offset += lumpByIdx.get(idx) ?? 0;
        if (spare < 0 && drawShortfall) {
          drawn = Math.min(offset, -spare);
          offset -= drawn;
          unfunded = -spare - drawn;
        }
      }
      setup.kids.forEach((_, i) => {
        const u = uniIdx[i];
        if (idx >= kidStart[i] && idx < u) { fund[i] += kidMonthly[i]; contributed[i] += kidMonthly[i]; }
        if (idx === u) { drawPerMonth[i] = fund[i] / (setup.uniYears * 12); atUni[i] = fund[i]; }
        if (idx >= u && fund[i] > 0) fund[i] = Math.max(0, fund[i] - drawPerMonth[i]);
        if (idx < u) {
          if (setup.kidsInOffset && loanActive) {
            // Interest the fund saves is credited to it, moved out of the general offset.
            const earned = fund[i] * r;
            if (offset >= earned) { offset -= earned; fund[i] += earned; }
          } else {
            fund[i] += fund[i] * ((setup.kidsInOffset ? live.rate : setup.eduRate) / 100 / 12);
          }
        }
      });
    }

    if (anchorIdx === idx && options.anchor) {
      const a = options.anchor;
      a.kids.forEach((v, i) => { if (i < fund.length) fund[i] = v; });
      loan = a.loan;
      offset = a.offset - (setup.kidsInOffset ? fund.reduce((x, y) => x + y, 0) : 0);
    }

    const unallocated = loanActive ? Math.max(0, spare - extra) : Math.max(0, spare);
    points.push({
      m, idx, loan, offset: paid === null ? offset : 0, net: paid === null ? Math.max(0, loan - offset) : 0,
      kids: fund.slice(), rate: live.rate, repayment: loanActive ? repayment : 0, paidOut, interest, cumInterest: totalInterest,
      takeHome, living, kidsSaving, extra, spare, unallocated, drawn, unfunded, loanActive,
      settings: { extra: live.extra, sweep: !!live.sweep, bonus: live.bonus, inc1: live.inc1, inc2: live.inc2, living: live.living, kidMonthly: kidMonthly.slice() },
    });
    if (paid === null && m < n && loan - offset <= 0) paid = m;
  }

  const paidMonth = paid === null ? n : paid;
  return { points, startIdx, paidMonth, paidIdx: startIdx + paidMonth, totalInterest, termMonths: n, kidsAtUni: atUni, kidsContributed: contributed };
}

/** Balances at the end of each calendar year, up to the year the loan is paid off. */
export function yearRows(result: SimResult) {
  const rows: { year: number; point: MonthPoint; interest: number }[] = [];
  let yearInterest = 0;
  for (const p of result.points) {
    yearInterest += p.interest;
    const last = p.idx % 12 === 11 || p.m === result.paidMonth;
    if (last) { rows.push({ year: Math.floor(p.idx / 12), point: p, interest: yearInterest }); yearInterest = 0; }
    if (p.m >= result.paidMonth) break;
  }
  return rows;
}
