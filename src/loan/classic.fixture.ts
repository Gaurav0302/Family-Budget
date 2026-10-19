/* eslint-disable */
// The calculation from the original single-page Loan Planner, kept unchanged apart from types,
// so tests can check this engine gives the same answers.

type Any = any;

const ym = (s: string) => { const [y, m] = String(s).split('-').map(Number); return y * 12 + (m - 1); };

function expandEvents(s: Any) {
  const base: Any = { rate: s.rate, inc1: s.inc1, inc2: s.inc2, living: s.living, extra: s.extra, bonus: s.bonus, sweep: s.sweep ? 1 : 0 };
  const starts = s.events.filter((e: Any) => e.month).map((e: Any) => ({ idx: ym(e.month), type: e.type, value: e.value, until: e.until && ym(e.until) > ym(e.month) ? ym(e.until) + 1 : null })).sort((a: Any, b: Any) => a.idx - b.idx);
  const out: Any[] = [], cur: Any = { ...base }, ends: Any[] = [];
  const flushEnds = (upto: number) => { ends.sort((a, b) => a.idx - b.idx); while (ends.length && ends[0].idx <= upto) { const en = ends.shift(); cur[en.type] = en.value; out.push({ idx: en.idx, type: en.type, value: en.value, end: true }); } };
  starts.forEach((e: Any) => { flushEnds(e.idx); if (e.until) ends.push({ idx: e.until, type: e.type, value: cur[e.type] }); cur[e.type] = e.value; out.push({ idx: e.idx, type: e.type, value: e.value }); });
  flushEnds(Infinity);
  return out.sort((a, b) => a.idx - b.idx);
}

function annuity(P: number, r: number, n: number) { return r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n)); }

export function classicRun(s: Any, scenario: boolean) {
  const n = s.term * 12, startIdx = ym(s.start);
  const sacCost = (s.sac1 + s.sac2) * (1 - s.tax / 100);
  const kidsPay = s.kids.reduce((a: number, k: Any) => a + k.monthly, 0);
  const live: Any = { rate: s.rate, inc1: s.inc1, inc2: s.inc2, living: s.living, extra: s.extra, bonus: s.bonus, sweep: s.sweep ? 1 : 0 };
  const evs = expandEvents(s);
  let r = live.rate / 100 / 12, pay = annuity(s.loan, r, n);
  let B = s.loan, O = scenario ? s.offset0 : 0; const E = s.kids.map(() => 0), wd = s.kids.map(() => 0);
  let totalInt = 0, paid: number | null = null, ei = 0; const pts: Any[] = [];
  for (let m = 0; m < n; m++) {
    const idx = startIdx + m, mo = idx % 12, g = Math.pow(1 + s.growth / 100, Math.floor(m / 12));
    while (ei < evs.length && evs[ei].idx <= idx) {
      const e = evs[ei++];
      if (e.type === 'rate') { if (e.value !== live.rate) { live.rate = e.value; r = live.rate / 100 / 12; pay = annuity(B, r, n - m); } } else live[e.type] = e.value;
    }
    const eduOff = (scenario && s.kidsInOffset) ? E.reduce((a: number, b: number) => a + b, 0) : 0;
    const interest = Math.max(0, B - O - eduOff) * r; totalInt += interest;
    B = Math.max(0, B + interest - pay);
    const take = (live.inc1 + live.inc2) * g - sacCost;
    const room = Math.max(0, take - pay - live.living * g - kidsPay);
    const extra = live.sweep ? room : Math.min(live.extra * g, room);
    if (scenario) {
      O += extra; if (live.bonus && mo === s.bonusM - 1) O += live.bonus;
      s.oneoffs.forEach((o: Any) => { if (o.month && ym(o.month) === idx) O += o.amount; });
      s.kids.forEach((k: Any, i: number) => {
        const u = k.uni * 12 + 1;
        if (k.start && idx >= ym(k.start) && idx < u) E[i] += k.monthly;
        if (idx === u) wd[i] = E[i] / (s.uniYears * 12);
        if (idx >= u && E[i] > 0) E[i] = Math.max(0, E[i] - wd[i]);
        if (idx < u) { if (s.kidsInOffset) { const t = E[i] * r; if (O >= t) { O -= t; E[i] += t; } } else E[i] += E[i] * (s.eduRate / 100 / 12); }
      });
    }
    pts.push({ m, idx, B, O, net: Math.max(0, B - O), kids: E.reduce((a: number, b: number) => a + b, 0), rate: live.rate, pay });
    if (paid === null && B - O <= 0) { paid = m; break; }
  }
  return { paidMonth: paid === null ? n : paid, totalInt, pts, startIdx };
}

/** The original planner's built-in defaults, in its own shape. */
export const CLASSIC_DEFAULTS: Any = {
  loan: 900000, rate: 6, term: 30, start: '2026-12', offset0: 50000,
  inc1: 9000, inc2: 7500, living: 6000, sac1: 350, sac2: 350, tax: 35, growth: 0,
  extra: 2000, sweep: false, bonus: 0, bonusM: 7, oneoffs: [], events: [],
  kids: [{ name: 'Child A', monthly: 300, start: '2026-12', uni: 2034 }, { name: 'Child B', monthly: 300, start: '2026-12', uni: 2038 }],
  kidsInOffset: true, eduRate: 4, uniYears: 3,
};
