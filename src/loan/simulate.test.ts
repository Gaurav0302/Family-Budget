import { describe, expect, it } from 'vitest';
import { CLASSIC_DEFAULTS, classicRun } from './classic.fixture';
import { TEST_SETUP as DEFAULT_SETUP } from './testSetup';
import { monthLabel, toIdx } from './dates';
import { simulate, yearRows } from './simulate';
import type { Change, Lump, Setup } from './types';

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

/** Turn a settings object from the original planner into the new engine's inputs. */
function fromClassic(s: any): { setup: Setup; changes: Change[]; lumps: Lump[] } {
  const setup: Setup = {
    loan: s.loan, rate: s.rate, term: s.term, start: s.start, offset0: s.offset0, inc1: s.inc1, inc2: s.inc2, living: s.living,
    sac1: s.sac1, sac2: s.sac2, tax: s.tax, growth: s.growth, extra: s.extra, sweep: !!s.sweep, bonus: s.bonus, bonusMonth: s.bonusM,
    kids: s.kids.map((k: any) => ({ name: k.name, monthly: k.monthly, start: k.start, uni: k.uni, goal: 0 })),
    kidsInOffset: s.kidsInOffset, eduRate: s.eduRate, uniYears: s.uniYears,
  };
  const changes: Change[] = s.events.map((e: any, i: number) => ({ id: `e${i}`, month: e.month, until: e.until, type: e.type, value: e.value }));
  const lumps: Lump[] = s.oneoffs.map((o: any, i: number) => ({ id: `l${i}`, month: o.month, amount: o.amount }));
  return { setup, changes, lumps };
}

const scenarios: [string, (s: any) => void][] = [
  ['built-in defaults', () => {}],
  ['sweep the whole surplus', (s) => { s.sweep = true; }],
  ['more extra', (s) => { s.extra = 3000; }],
  ['college funds invested elsewhere', (s) => { s.kidsInOffset = false; }],
  ['pay rises 3% a year', (s) => { s.growth = 3; }],
  ['a rate cut', (s) => { s.events = [{ month: '2027-06', type: 'rate', value: 5.95 }]; }],
  ['a rate cycle', (s) => { s.events = [6.45, 6.7, 6.95, 7.2, 6.95, 6.7, 6.45].map((v, i) => ({ month: `${2027 + Math.floor((5 + 6 * i) / 12)}-${String(((5 + 6 * i) % 12) + 1).padStart(2, '0')}`, type: 'rate', value: v })); }],
  ['a year on one income', (s) => { s.events = [{ month: '2028-07', until: '2029-06', type: 'inc2', value: 0 }]; }],
  ['a yearly bonus', (s) => { s.bonus = 8000; s.bonusM = 7; }],
  ['lump sums', (s) => { s.oneoffs = [{ month: '2028-07', amount: 20000 }, { month: '2030-03', amount: 5000 }]; }],
  ['extra paused for six months', (s) => { s.events = [{ month: '2028-01', until: '2028-06', type: 'extra', value: 0 }]; }],
  ['living costs rise', (s) => { s.events = [{ month: '2029-01', type: 'living', value: 7000 }]; }],
  ['sweep switched on later', (s) => { s.events = [{ month: '2030-01', type: 'sweep', value: 1 }]; }],
  ['no children', (s) => { s.kids = []; }],
  ['high rate, shorter term', (s) => { s.rate = 9; s.term = 25; }],
  ['everything at once', (s) => {
    s.growth = 2; s.bonus = 5000; s.bonusM = 12; s.oneoffs = [{ month: '2029-04', amount: 15000 }]; s.kidsInOffset = false;
    s.events = [{ month: '2027-06', type: 'rate', value: 5.95 }, { month: '2027-07', type: 'inc1', value: 10000 }, { month: '2031-01', until: '2031-12', type: 'extra', value: 500 }];
  }],
];

describe('matches the original planner', () => {
  for (const [name, tweak] of scenarios) {
    it(name, () => {
      for (const withExtras of [true, false]) {
        const s = clone(CLASSIC_DEFAULTS);
        tweak(s);
        const old = classicRun(s, withExtras);
        const { setup, changes, lumps } = fromClassic(s);
        const res = simulate(setup, changes, lumps, { extras: withExtras, drawShortfall: false });
        expect(res.paidMonth).toBe(old.paidMonth);
        expect(res.totalInterest).toBeCloseTo(old.totalInt, 4);
        for (const o of old.pts) {
          const p = res.points[o.m];
          expect(p.loan).toBeCloseTo(o.B, 4);
          expect(p.net).toBeCloseTo(o.net, 4);
          expect(p.kids.reduce((a, b) => a + b, 0)).toBeCloseTo(o.kids, 4);
          expect(p.repayment).toBeCloseTo(o.pay, 6);
          expect(p.rate).toBe(o.rate);
        }
      }
    });
  }

  it('gives the headline numbers the Loan Planner showed for the same figures', () => {
    const res = simulate(DEFAULT_SETUP, [], [], { drawShortfall: false });
    const bank = simulate(DEFAULT_SETUP, [], [], { extras: false });
    expect(monthLabel(res.paidIdx)).toBe('Feb 2041');
    expect(Math.round(res.totalInterest / 1000)).toBe(384);
    expect(Math.round(bank.totalInterest / 1000)).toBe(1043);
    expect(Math.round(res.points[0].repayment)).toBe(5396);
  });
});

describe('fix 1: shortfalls are drawn from the offset', () => {
  const leave: Change[] = [{ id: 'l', month: '2028-07', until: '2029-06', type: 'inc2', value: 0 }];

  it('takes the gap out of the offset and moves the payoff later', () => {
    const before = simulate(DEFAULT_SETUP, leave, [], { drawShortfall: false });
    const after = simulate(DEFAULT_SETUP, leave, []);
    const july = after.points.find((p) => p.idx === toIdx('2028-07'))!;
    expect(july.spare).toBeLessThan(0);
    expect(july.drawn).toBeCloseTo(-july.spare, 6);
    expect(july.unfunded).toBe(0);
    const juneOffset = after.points.find((p) => p.idx === toIdx('2028-06'))!.offset;
    expect(july.offset).toBeLessThan(juneOffset);
    expect(after.paidMonth).toBeGreaterThan(before.paidMonth);
    expect(after.totalInterest).toBeGreaterThan(before.totalInterest);
  });

  it('reports what the offset cannot cover', () => {
    const s = { ...clone(DEFAULT_SETUP), offset0: 0, extra: 0 };
    const res = simulate(s, [{ id: 'x', month: '2027-01', until: '2027-03', type: 'inc1', value: 0 }], []);
    const jan = res.points.find((p) => p.idx === toIdx('2027-01'))!;
    expect(jan.unfunded).toBeGreaterThan(0);
    expect(jan.offset).toBeGreaterThanOrEqual(0);
  });

  it('changes nothing when there is no shortfall', () => {
    const a = simulate(DEFAULT_SETUP, [], [], { drawShortfall: false });
    const b = simulate(DEFAULT_SETUP, [], []);
    expect(b.paidMonth).toBe(a.paidMonth);
    expect(b.totalInterest).toBeCloseTo(a.totalInterest, 6);
  });
});

describe('fix 2: money left unallocated is reported', () => {
  it('shows spare money that is not going anywhere', () => {
    const p = simulate(DEFAULT_SETUP, [], []).points[0];
    expect(p.unallocated).toBeCloseTo(p.spare - p.extra, 6);
    expect(Math.round(p.unallocated)).toBe(2049);
  });

  it('is zero when sweeping', () => {
    const p = simulate({ ...DEFAULT_SETUP, sweep: true }, [], []).points[0];
    expect(p.unallocated).toBeCloseTo(0, 6);
  });

  it('grows with a pay rise while the extra stays fixed', () => {
    const rise: Change[] = [{ id: 'r', month: '2027-07', type: 'inc1', value: 10000 }];
    const p = simulate(DEFAULT_SETUP, rise, []).points.find((x) => x.idx === toIdx('2027-07'))!;
    const q = simulate(DEFAULT_SETUP, [], []).points.find((x) => x.idx === toIdx('2027-07'))!;
    expect(p.unallocated - q.unallocated).toBeCloseTo(1000, 6);
  });
});

describe('rate changes and the repayment', () => {
  const cut = (extra: Partial<Change>): Change[] => [{ id: 'c', month: '2027-03', type: 'rate', value: 5.95, ...extra }];

  it('recalculates the repayment from the month of the change only', () => {
    const res = simulate(DEFAULT_SETUP, cut({}), []);
    expect(Math.round(res.points[2].repayment)).toBe(5396);
    expect(Math.round(res.points[3].repayment)).toBe(5362);
  });

  it('uses the figure the bank set', () => {
    const res = simulate(DEFAULT_SETUP, cut({ repayment: 6600 }), []);
    expect(res.points[3].repayment).toBe(6600);
  });

  it('keeps paying the old amount when a later change does not move the rate', () => {
    const res = simulate(DEFAULT_SETUP, [...cut({ keepPaying: 5396 }), { id: 'g', month: '2027-06', type: 'rate', value: 5.95 }], []);
    expect(res.points.find((p) => p.idx === toIdx('2027-08'))!.paidOut).toBe(5396);
  });

  it('stops keeping the old amount when the rate moves again', () => {
    const res = simulate(DEFAULT_SETUP, [...cut({ keepPaying: 5396 }), { id: 'g', month: '2027-06', type: 'rate', value: 5.7 }], []);
    const aug = res.points.find((p) => p.idx === toIdx('2027-08'))!;
    expect(aug.paidOut).toBe(aug.repayment);
  });

  it('keeps paying the old amount and sends the difference to the offset', () => {
    const bank = simulate(DEFAULT_SETUP, cut({}), []);
    const keep = simulate(DEFAULT_SETUP, cut({ keepPaying: 5396 }), []);
    expect(keep.points[3].paidOut).toBe(5396);
    expect(keep.points[3].offset - keep.points[2].offset).toBeGreaterThan(bank.points[3].offset - bank.points[2].offset);
    expect(keep.paidMonth).toBeLessThan(bank.paidMonth);
  });
});

describe('changes over time', () => {
  it('lets a permanent change inside a temporary one stand when the temporary one ends', () => {
    const res = simulate(DEFAULT_SETUP, [
      { id: 't', month: '2028-01', until: '2028-12', type: 'extra', value: 0 },
      { id: 'p', month: '2028-06', type: 'extra', value: 2500 },
    ], []);
    const at = (ym: string) => res.points.find((p) => p.idx === toIdx(ym))!.settings.extra;
    expect(at('2027-12')).toBe(2000);
    expect(at('2028-07')).toBe(0);
    expect(at('2029-01')).toBe(2500);
  });

  it('handles two overlapping temporary changes', () => {
    const res = simulate(DEFAULT_SETUP, [
      { id: 'a', month: '2028-07', until: '2029-06', type: 'inc2', value: 0 },
      { id: 'b', month: '2028-07', until: '2029-06', type: 'inc2', value: 0 },
    ], []);
    expect(res.points.find((p) => p.idx === toIdx('2029-07'))!.settings.inc2).toBe(7500);
  });

  it('changes a child’s monthly saving from a month', () => {
    const res = simulate(DEFAULT_SETUP, [{ id: 'k', month: '2028-01', type: 'kid0', value: 500 }], []);
    const p = res.points.find((x) => x.idx === toIdx('2028-01'))!;
    expect(p.settings.kidMonthly).toEqual([500, 300]);
    expect(p.kidsSaving).toBe(800);
  });
});

describe('restarting from real balances', () => {
  it('gives the same result when the balances match the projection', () => {
    const plain = simulate(DEFAULT_SETUP, [], []);
    const p = plain.points[5];
    const offsetOnStatement = p.offset + p.kids.reduce((a, b) => a + b, 0);
    const anchored = simulate(DEFAULT_SETUP, [], [], { anchor: { month: '2027-05', loan: p.loan, offset: offsetOnStatement, kids: p.kids } });
    expect(anchored.paidMonth).toBe(plain.paidMonth);
    expect(anchored.totalInterest).toBeCloseTo(plain.totalInterest, 4);
  });

  it('moves the payoff earlier when the real offset is higher', () => {
    const plain = simulate(DEFAULT_SETUP, [], []);
    const p = plain.points[5];
    const anchored = simulate(DEFAULT_SETUP, [], [], { anchor: { month: '2027-05', loan: p.loan, offset: p.offset + p.kids.reduce((a, b) => a + b, 0) + 30000, kids: p.kids } });
    expect(anchored.paidMonth).toBeLessThan(plain.paidMonth);
    expect(anchored.points[5].offset).toBeCloseTo(p.offset + 30000, 4);
  });
});

describe('year-by-year rows', () => {
  it('ends with the year the loan is paid off', () => {
    const res = simulate(DEFAULT_SETUP, [], []);
    const rows = yearRows(res);
    expect(rows[0].year).toBe(2026);
    expect(rows[rows.length - 1].year).toBe(Math.floor(res.paidIdx / 12));
    expect(rows[rows.length - 1].point.net).toBe(0);
  });
});
