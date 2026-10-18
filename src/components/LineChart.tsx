import { useEffect, useRef, useState } from 'react';
import { monthName, money } from '../lib/format';

export interface LinePoint { month: string; value: number; parts?: { label: string; amount: number }[] }

const compact = (n: number) => {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
};

/** Rounded steps for the side scale, e.g. 0, 250k, 500k. */
function ticks(min: number, max: number, count = 4) {
  const raw = (max - min) / count || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= raw) ?? raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

/** A line over months that stays readable from 3 points to 300. Tap or hover to see a month's breakdown. */
export function LineChart({ points, height = 220, label }: { points: LinePoint[]; height?: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) return null;

  const pad = { l: 48, r: 12, t: 12, b: 26 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const vals = points.map((p) => p.value);
  // Start the scale near the lowest value (not always at $0), so real changes are visible; the side labels keep it honest.
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const spread = Math.max(vmax - vmin, Math.abs(vmax) * 0.05, 1);
  const ys = ticks(vmin < 0 ? vmin : Math.max(0, vmin - spread * 0.25), vmax + spread * 0.1);
  const lo = ys[0], hi = ys[ys.length - 1];
  const x = (i: number) => pad.l + (i / (points.length - 1)) * w;
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * h;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}Z`;
  // Label about one month in every ~70px, always including January so years are clear.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 70))));
  const showLabel = (i: number) => i === 0 || i === points.length - 1 ? true : points.length > 24 ? points[i].month.endsWith('-01') : i % every === 0 && i < points.length - every / 2;
  const fmt = (m: string) => points.length > 24 ? m.slice(0, 4) : monthName(m, 'short').replace(' 20', ' ’');

  const pick = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - pad.l) / w) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover === null ? null : points[hover];
  const first = points[0].value, last = points[points.length - 1].value;

  return (
    <div className="linechart" ref={box}>
      <svg width={width} height={height} role="img" aria-label={`${label}: ${compact(first)} in ${monthName(points[0].month)} to ${compact(last)} in ${monthName(points[points.length - 1].month)}`}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}>
        {ys.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'lc-zero' : 'lc-grid'} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="lc-axis">{compact(v)}</text>
          </g>
        ))}
        <path d={area} className="lc-area" />
        <path d={line} className="lc-line" />
        {points.map((p, i) => showLabel(i) && <text key={p.month} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="lc-axis">{fmt(p.month)}</text>)}
        {points.length <= 18 && points.map((p, i) => <circle key={p.month} cx={x(i)} cy={y(p.value)} r={2.5} className="lc-dot" />)}
        {hp && hover !== null && <>
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} className="lc-cross" />
          <circle cx={x(hover)} cy={y(hp.value)} r={5} className="lc-focus" />
        </>}
      </svg>
      {hp && hover !== null && (
        <div className="lc-tip" style={{ left: Math.min(Math.max(x(hover), 90), width - 90), top: 0 }}>
          <b>{monthName(hp.month)}</b>
          <span className="lc-tip-total">{money(hp.value)}</span>
          {hp.parts?.filter((p) => p.amount).map((p) => <span key={p.label} className="lc-tip-row"><span>{p.label}</span><span>{money(p.amount)}</span></span>)}
        </div>
      )}
    </div>
  );
}
