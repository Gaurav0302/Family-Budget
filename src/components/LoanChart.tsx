import { useEffect, useMemo, useRef, useState } from 'react';
import { toIdx, toYM, type SimResult } from '../loan';
import { checkInNet, laneItems, mon } from '../data/plans';
import type { CheckIn, LoanView } from '../data/property';
import type { LoanPlan, Property } from '../data/types';
import { money } from '../lib/format';

type Key = 'loan' | 'offset' | 'net' | 'bank';
const LEGEND: { key: Key; label: string }[] = [
  { key: 'loan', label: 'Loan balance' },
  { key: 'offset', label: 'Offset' },
  { key: 'net', label: 'Owed after the offset' },
  { key: 'bank', label: 'Bank’s schedule, minimum repayments only' },
];
const compact = (n: number) => { const a = Math.abs(n); return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}m` : a >= 1000 ? `$${Math.round(a / 1000)}k` : `$${Math.round(a)}`; };
const at = (r: SimResult, idx: number) => r.points.find((p) => p.idx === idx) ?? (idx < r.startIdx ? r.points[0] : r.points[r.points.length - 1]);

/** The whole loan at a glance: the balance coming down, the offset rising to meet it, and the month they cross (debt-free).
 *  Your real balances are dots; what happened and this plan's guesses sit in a lane underneath. Brought over from the Loan Planner. */
export function LoanChart({ v, p, plan, checkIns, today, kidsInOffset }: { v: LoanView; p: Property; plan: LoanPlan; checkIns: CheckIn[]; today: string; kidsInOffset: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [range, setRange] = useState<'whole' | 'near'>('whole');
  const [hidden, setHidden] = useState<Set<Key>>(new Set(['net']));
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const res = v.now, orig = v.original, bank = v.bank;
  const startIdx = toIdx(v.inputs.setup.start);
  const todayIdx = toIdx(today);
  const started = todayIdx >= startIdx;
  const whole = range === 'whole';
  const d0 = whole ? startIdx : Math.max(startIdx, todayIdx - 6);
  const d1 = whole ? Math.min(bank.paidIdx, Math.max(res.paidIdx, orig.paidIdx) + 24) : d0 + 30;
  const inR = (i: number) => i >= d0 && i <= d1;

  const kidsOf = (c: CheckIn) => (kidsInOffset ? c.kids.filter((k) => Number.isFinite(k)).reduce((a, b) => a + b, 0) : 0);
  const series = useMemo(() => {
    const active = res.points.filter((x) => (x.loanActive || x.m === res.paidMonth) && inR(x.idx));
    return {
      loan: active.map((x) => ({ i: x.idx, v: x.loan })), offset: active.map((x) => ({ i: x.idx, v: x.offset })), net: active.map((x) => ({ i: x.idx, v: x.net })),
      bank: bank.points.filter((x) => x.loanActive && inR(x.idx)).map((x) => ({ i: x.idx, v: x.loan })),
      first: orig.points.filter((x) => (x.loanActive || x.m === orig.paidMonth) && inR(x.idx)).map((x) => ({ i: x.idx, v: x.net })),
    };
  }, [res, bank, orig, d0, d1]);
  const real = checkIns.filter((c) => inR(toIdx(c.month)));
  const realNet = real.map((c) => ({ i: toIdx(c.month), v: checkInNet(c, kidsInOffset) }));
  const hasHistory = (p.loan?.changes?.length ?? 0) + (p.loan?.lumps?.length ?? 0) > 0 || real.length > 0;

  let lo = 0, hi = Math.max(p.loan?.amount ?? 1, ...series.offset.map((x) => x.v)) * 1.04;
  if (!whole) {
    const vals = [...series.net, ...(hasHistory ? series.first : []), ...realNet].map((x) => x.v);
    const a = Math.min(...vals), b = Math.max(...vals), padv = Math.max(2000, (b - a) * 0.12);
    lo = Math.max(0, a - padv); hi = b + padv;
  }
  const pad = { l: 58, r: 12, t: 14, b: 26 };
  const H = 300, w = width - pad.l - pad.r, h = H - pad.t - pad.b;
  const x = (i: number) => pad.l + ((i - d0) / Math.max(1, d1 - d0)) * w;
  const y = (val: number) => pad.t + (1 - (val - lo) / Math.max(1, hi - lo)) * h;
  const line = (pts: { i: number; v: number }[]) => pts.map((q, k) => `${k ? 'L' : 'M'}${x(q.i).toFixed(1)},${y(q.v).toFixed(1)}`).join('');
  const area = (pts: { i: number; v: number }[]) => (pts.length ? `${line(pts)}L${x(pts.at(-1)!.i).toFixed(1)},${y(lo).toFixed(1)}L${x(pts[0].i).toFixed(1)},${y(lo).toFixed(1)}Z` : '');
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const years: number[] = [];
  const stepY = Math.max(1, Math.ceil(60 / ((w / Math.max(1, d1 - d0)) * 12)));
  for (let i = d0; i <= d1; i++) if (i % 12 === 0 && (Math.floor(i / 12) - Math.floor(d0 / 12)) % stepY === 0) years.push(i);
  const nearTicks: number[] = [];
  if (!whole) for (let i = d0; i <= d1; i++) if (i % 3 === 0) nearTicks.push(i);

  const paidIn = inR(res.paidIdx);
  const showOrig = orig.paidIdx !== res.paidIdx && inR(orig.paidIdx);
  const bankEnd = series.bank.at(-1);
  const toggle = (k: Key) => setHidden((s0) => { const n = new Set(s0); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pick = (clientX: number) => { const r = box.current!.getBoundingClientRect(); const i = Math.round(d0 + ((clientX - r.left - pad.l) / w) * (d1 - d0)); return Math.max(d0, Math.min(d1, i)); };

  const tip = (i: number): { rows: { k: string; cls: string; label: string; value: string }[]; meta?: string } => {
    const q = at(res, i), b = at(bank, i);
    const rows: { k: string; cls: string; label: string; value: string }[] = [];
    if (whole) {
      if (i <= res.paidIdx) {
        if (!hidden.has('loan')) rows.push({ k: 'loan', cls: 'lc-loan', label: 'Loan balance', value: money(q.loan) });
        if (!hidden.has('offset')) rows.push({ k: 'off', cls: 'lc-offset', label: 'Offset', value: money(q.offset) });
        rows.push({ k: 'net', cls: 'lc-net', label: 'Owed after the offset', value: money(q.net) });
      } else rows.push({ k: 'paid', cls: 'lc-loan', label: `since ${mon(toYM(res.paidIdx))}`, value: 'Paid off' });
      if (!hidden.has('bank') && b.loanActive) rows.push({ k: 'bank', cls: 'lc-bank', label: 'Bank’s schedule', value: money(b.loan) });
    } else {
      rows.push({ k: 'net', cls: 'lc-loan', label: 'Owed after the offset, projected', value: money(q.net) });
      if (hasHistory) rows.push({ k: 'first', cls: 'lc-first', label: 'The plan as first set', value: money(at(orig, i).net) });
    }
    const c = checkIns.find((z) => toIdx(z.month) === i);
    if (c) rows.push({ k: 'real', cls: 'lc-real', label: 'Your balances: owed after the offset', value: money(checkInNet(c, kidsInOffset)) });
    return { rows, meta: q.loanActive ? `Rate ${q.rate.toFixed(2)}%, repayment ${money(q.paidOut)}` : undefined };
  };

  // The lane: chips for what happened and this plan's guesses, stacked so none overlap.
  const items = laneItems(p, plan, v.inputs.earners).filter((it) => it.start <= d1 && (it.end ?? it.start) >= d0);
  const rowEnds: number[] = [];
  const placed = items.map((it) => {
    const left = x(Math.max(d0, it.start));
    const wd = Math.max(it.label.length * 7.8 + 22, it.end !== undefined ? x(Math.min(d1, it.end + 1)) - left : 0);
    let row = rowEnds.findIndex((e) => e <= left - 4);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = left + wd;
    return { ...it, row, left, wd };
  });
  const laneRows = placed.length ? Math.max(...placed.map((q) => q.row)) + 1 : 0;
  const t = hover !== null ? tip(hover) : null;

  return (
    <section className="panel loan-chart" aria-labelledby="lc-title">
      <div className="panel-head lc-head">
        <div><h2 id="lc-title">The loan over time</h2><p className="muted small">The offset grows until it matches the loan. From that month no interest is charged: the loan is effectively paid off.</p></div>
        <div className="seg" role="group" aria-label="Chart range">
          <button type="button" className={whole ? 'on' : ''} aria-pressed={whole} onClick={() => setRange('whole')}>Whole loan</button>
          <button type="button" className={!whole ? 'on' : ''} aria-pressed={!whole} onClick={() => setRange('near')}>Next 2 years</button>
        </div>
      </div>
      {whole ? (
        <div className="lc-legend" role="group" aria-label="Lines shown">
          {LEGEND.map((l) => <button key={l.key} type="button" aria-pressed={!hidden.has(l.key)} className={hidden.has(l.key) ? 'off' : ''} onClick={() => toggle(l.key)}><i className={`lc-key lc-${l.key}`} aria-hidden />{l.label}</button>)}
          {real.length > 0 && <span className="lc-note"><i className="lc-key lc-dot" aria-hidden />Your balances</span>}
        </div>
      ) : (
        <div className="lc-legend">
          <span className="lc-note"><i className="lc-key lc-loan" aria-hidden />Owed after the offset, projected</span>
          {hasHistory && <span className="lc-note"><i className="lc-key lc-first" aria-hidden />The plan as first set</span>}
          <span className="lc-note"><i className="lc-key lc-real" aria-hidden />Your balances</span>
          <span className="lc-note muted">Zoomed in: the scale doesn't start at $0</span>
        </div>
      )}
      {/* Keyboard: Tab to the chart, arrows move a month (Shift: a year), Escape hides the figures. */}
      <div className="lc-plot" ref={box} tabIndex={0} aria-label="Loan chart: use the arrow keys to read each month"
        onPointerMove={(e) => setHover(pick(e.clientX))} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 12 : 1, cur = hover ?? Math.max(d0, Math.min(d1, toIdx(today)));
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setHover(Math.max(d0, Math.min(d1, cur + (e.key === 'ArrowRight' ? step : -step)))); }
          else if (e.key === 'Escape') setHover(null);
        }}>
        <svg width={width} height={H} role="img" aria-label={`Loan over time. Paid off ${mon(toYM(res.paidIdx))}; the bank's schedule finishes ${mon(toYM(bank.paidIdx))}.`}>
          {ticks.map((tv) => <g key={tv}><line x1={pad.l} x2={width - pad.r} y1={y(tv)} y2={y(tv)} className="ch-grid" /><text x={pad.l - 6} y={y(tv) + 4} textAnchor="end" className="ch-axis">{compact(tv)}</text></g>)}
          {(whole ? years : nearTicks).map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="ch-axis">{whole ? Math.floor(i / 12) : mon(toYM(i))}</text>)}
          {whole ? (
            <>
              {!hidden.has('offset') && <path d={area(series.offset)} className="lc-area" />}
              {!hidden.has('bank') && <path d={line(series.bank)} className="lc-line lc-bank" />}
              {!hidden.has('net') && <path d={line(series.net)} className="lc-line lc-net" />}
              {!hidden.has('offset') && <path d={line(series.offset)} className="lc-line lc-offset" />}
              {!hidden.has('loan') && <path d={line(series.loan)} className="lc-line lc-loan" />}
              {showOrig && <line x1={x(orig.paidIdx)} x2={x(orig.paidIdx)} y1={pad.t} y2={pad.t + h} className="lc-mark-first" />}
              {paidIn && <line x1={x(res.paidIdx)} x2={x(res.paidIdx)} y1={pad.t} y2={pad.t + h} className="lc-mark-paid" />}
              {paidIn && <circle cx={x(res.paidIdx)} cy={y(at(res, res.paidIdx).loan)} r={7} className="lc-cross" />}
              {real.map((c) => <g key={c.month}>
                <circle cx={x(toIdx(c.month))} cy={y(c.loan)} r={5} className="lc-dot-loan" />
                <circle cx={x(toIdx(c.month))} cy={y(c.offset - kidsOf(c))} r={4.5} className="lc-dot-offset" />
              </g>)}
            </>
          ) : (
            <>
              {hasHistory && <path d={line(series.first)} className="lc-line lc-first" />}
              <path d={line(series.net)} className="lc-line lc-loan" />
              {realNet.length > 1 && <path d={line(realNet)} className="lc-line lc-real" />}
              {realNet.map((q) => <circle key={q.i} cx={x(q.i)} cy={y(q.v)} r={5} className="lc-dot-real" />)}
            </>
          )}
          {started && inR(todayIdx) && <g><line x1={x(todayIdx)} x2={x(todayIdx)} y1={pad.t} y2={pad.t + h} className="lc-today" /><text x={x(todayIdx) + 5} y={pad.t + h - 6} className="ch-axis">Today</text></g>}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} className="lc-hover" />}
        </svg>
        {whole && paidIn && <span className={`lc-flag lc-flag-paid ${x(res.paidIdx) > width * 0.7 ? 'left' : ''}`} style={{ left: x(res.paidIdx) }}>Debt-free {mon(toYM(res.paidIdx))}</span>}
        {whole && showOrig && <span className={`lc-flag lc-flag-first ${x(orig.paidIdx) > width * 0.7 ? 'left' : ''}`} style={{ left: x(orig.paidIdx), top: 44 }}>First plan: {mon(toYM(orig.paidIdx))}</span>}
        {whole && !hidden.has('bank') && bankEnd && <span className="lc-end" style={{ top: y(bankEnd.v) - 18 }}>Bank: {compact(bankEnd.v)} still owed in {mon(toYM(bankEnd.i))}</span>}
        {!started && <span className="lc-flag lc-flag-first" style={{ left: pad.l + 8, top: pad.t }}>The loan starts {mon(v.inputs.setup.start)}</span>}
        {t && hover !== null && (
          <div className="ch-tip lc-tip" style={x(hover) + 230 < width ? { left: x(hover) + 12 } : { left: Math.max(0, x(hover) - 242) }} role="status">
            <b>{mon(toYM(hover))}</b>
            {t.rows.map((r) => <span key={r.k} className="ch-tip-row"><span><i className={`lc-key ${r.cls}`} />{r.label}</span><strong>{r.value}</strong></span>)}
            {t.meta && <small className="muted">{t.meta}</small>}
          </div>
        )}
      </div>
      <div className="lc-lane" style={{ height: laneRows * 30 }}>
        <ul className="sr-only" aria-label="Changes on this timeline">{placed.map((q) => <li key={q.id}>{q.description}</li>)}</ul>
        {placed.map((q) => <span key={q.id} aria-hidden title={q.description} className={`lc-chip ${q.recorded ? 'recorded' : 'guess'} ${q.end !== undefined ? 'ranged' : ''}`} style={{ left: q.left, width: q.wd, top: q.row * 30 }}>{q.label}</span>)}
      </div>
      {placed.length > 0
        ? <div className="lc-lane-key muted small"><span><i className="lc-chip-key recorded" />Happened</span><span><i className="lc-chip-key guess" />Guess in {plan.name}</span></div>
        : <p className="muted small">No changes yet. Record what really happens, or add guesses in a plan.</p>}
    </section>
  );
}

