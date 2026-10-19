import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addMonths } from '../data/analysis';
import { financialYear } from '../data/wealth';
import { money, monthName } from '../lib/format';

/** Categorical colours, in fixed order (validated for colour-blind separation on the app's light and dark cards). */
export const SERIES_COLORS = 8;
export const seriesColor = (slot: number) => `var(--s${(slot % SERIES_COLORS) + 1})`;

export type Range = '3m' | '6m' | '1y' | 'fy' | 'all';
const RANGE_LABEL: Record<Range, string> = { '3m': '3M', '6m': '6M', '1y': '1Y', fy: 'FY', all: 'All' };
const RANGE_TITLE: Record<Range, string> = { '3m': 'Last 3 months', '6m': 'Last 6 months', '1y': 'Last 12 months', fy: 'This financial year', all: 'Everything' };

/** Which of `months` (oldest first) fall in a time span ending at the last one. */
export function inRange(months: string[], range: Range): string[] {
  if (!months.length) return months;
  const last = months[months.length - 1];
  if (range === 'all') return months;
  if (range === 'fy') { const fy = financialYear(last); return months.filter((m) => financialYear(m) === fy); }
  const n = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  const from = addMonths(last, -(n - 1));
  return months.filter((m) => m >= from);
}

/** 3M · 6M · 1Y · FY · All. Spans that would show the same months as a shorter one are left out. */
export function RangePicker({ months, value, onChange }: { months: string[]; value: Range; onChange: (r: Range) => void }) {
  const seen = new Set<number>();
  const opts = (['3m', '6m', '1y', 'fy', 'all'] as Range[]).filter((r) => {
    if (r === 'all') return true;
    const n = inRange(months, r).length;
    if (n < 2 || n >= months.length || (seen.has(n) && r !== 'fy')) return r === value;
    seen.add(n);
    return true;
  });
  if (months.length < 3) return null;
  return (
    <div className="range" role="radiogroup" aria-label="Time span">
      {opts.map((r) => (
        <button key={r} type="button" role="radio" aria-checked={value === r} title={RANGE_TITLE[r]} className={value === r ? 'on' : ''} onClick={() => onChange(r)}>{RANGE_LABEL[r]}</button>
      ))}
    </div>
  );
}

export const compactMoney = (n: number) => {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}$${Math.round(a)}`;
};

function ticks(min: number, max: number, count: number) {
  const raw = (max - min) / count || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= raw) ?? raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** A bar whose top corners are rounded and whose base sits square on the axis. */
function bar(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface Series { id: string; label: string; values: number[]; color?: string }

export interface ChartProps {
  /** Every month there is data for, oldest first; `values` line up with it. */
  months: string[];
  series: Series[];
  kind?: 'bars' | 'lines' | 'stacked';
  /** Budget for each month (drawn as a dashed line). */
  budget?: number[];
  /** A fixed goal line, e.g. Babylon's tenth. */
  target?: { value: number; label: string };
  /** Show the average of the visible months as a dotted line (single series only). */
  average?: boolean;
  format?: (n: number) => string;
  axisFormat?: (n: number) => string;
  /** Months where not every account was loaded: drawn paler. */
  partial?: Set<string>;
  /** The month being looked at: drawn darker. */
  highlight?: string;
  /** Tapping a month opens what's behind it. */
  onPick?: (month: string) => void;
  pickLabel?: string;
  /** Extra lines in the tooltip for a month. */
  tipExtra?: (month: string) => { label: string; value: string }[];
  range?: Range;
  onRange?: (r: Range) => void;
  defaultRange?: Range;
  /** Hide the time span buttons (when one control above several charts sets it). */
  noRange?: boolean;
  height?: number;
  /** Start the scale near the lowest value rather than at $0 (for net worth). */
  tight?: boolean;
  compact?: boolean;
  title?: ReactNode;
  label: string;
}

export function Chart(p: ChartProps) {
  const { kind = 'bars', format = money, axisFormat = compactMoney, height = 200, compact = false } = p;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [own, setOwn] = useState<Range>(p.defaultRange ?? '6m');
  const range = p.range ?? own;
  const setRange = p.onRange ?? setOwn;
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(220, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = useMemo(() => inRange(p.months, range), [p.months, range]);
  const idx = shown.map((m) => p.months.indexOf(m));
  const ser = p.series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i), vals: idx.map((j) => s.values[j] ?? 0) }));
  const budRaw = p.budget ? idx.map((j) => p.budget![j] ?? 0) : null;
  const bud = budRaw && budRaw.some((v) => v > 0) ? budRaw : null;
  const n = shown.length;

  const pad = { l: compact ? 36 : 50, r: 8, t: 8, b: 22 };
  const w = Math.max(10, width - pad.l - pad.r), h = height - pad.t - pad.b;
  const tops = kind === 'stacked' ? shown.map((_, i) => ser.reduce((a, s) => a + Math.max(0, s.vals[i]), 0)) : ser.flatMap((s) => s.vals);
  const all = [...tops, ...(bud ?? []), p.target?.value ?? 0];
  let lo = Math.min(0, ...ser.flatMap((s) => s.vals)), hi = Math.max(...all, 0);
  if (p.tight && lo >= 0) { const vmin = Math.min(...ser.flatMap((s) => s.vals)); const spread = Math.max(hi - vmin, hi * 0.05, 1); lo = Math.max(0, vmin - spread * 0.25); }
  const ys = ticks(lo, hi || 1, compact ? 2 : 4);
  const y0 = ys[0], y1 = ys[ys.length - 1];
  const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * h;
  const band = w / Math.max(n, 1);
  const cx = (i: number) => pad.l + band * (i + 0.5);
  const avg = p.average && ser.length === 1 && n ? ser[0].vals.reduce((a, b) => a + b, 0) / n : null;

  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / (compact ? 46 : 58)))));
  const xLabel = (m: string) => (n > 18 ? (m.endsWith('-01') || m === shown[0] ? m.slice(0, 4) : '') : monthName(m, 'short').replace(/ 20(\d\d)$/, (_, yy) => (m.endsWith('-01') || m === shown[0] ? ` ’${yy}` : '')));

  const pick = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((clientX - r.left - pad.l) / band)));
  };
  if (n < 1 || !ser.length) return <div className="chart" ref={box}><p className="muted">Not enough months yet.</p></div>;

  const groupW = Math.min(band * 0.72, kind === 'bars' && ser.length > 1 ? 20 * ser.length : 30);
  const each = kind === 'bars' ? groupW / ser.length : groupW;
  // The tooltip sits beside the hovered month (right of it, or left near the right edge), level with the top of the plot.
  const tipW = 200;
  const tipPos = hover === null ? {} : cx(hover) + band / 2 + 8 + tipW < width ? { left: cx(hover) + band / 2 + 8 } : { left: Math.max(0, cx(hover) - band / 2 - 8 - tipW) };

  return (
    <div className={`chart ${compact ? 'is-compact' : ''}`}>
      {(p.title || !p.noRange) && (
        <div className="chart-head">
          {p.title && <div className="chart-title">{p.title}</div>}
          {!p.noRange && <RangePicker months={p.months} value={range} onChange={setRange} />}
        </div>
      )}
      {(ser.length > 1 || bud || p.target || avg !== null) && !compact && (
        <div className="chart-legend" aria-hidden>
          {ser.length > 1 && ser.map((s) => <span key={s.id}><i className={kind === 'lines' ? 'key-line' : 'key-box'} style={{ background: s.color }} />{s.label}</span>)}
          {bud && <span><i className="key-line key-budget" />Budget</span>}
          {avg !== null && <span><i className="key-line key-avg" />Average {format(avg)}</span>}
          {p.target && <span><i className="key-line key-budget" />{p.target.label}</span>}
        </div>
      )}
      <div className="chart-plot" ref={box}>
        <svg width={width} height={height} role="img"
          aria-label={`${p.label}, ${monthName(shown[0])} to ${monthName(shown[n - 1])}: ${ser.map((s) => `${s.label} ${s.vals.map((v, i) => `${monthName(shown[i], 'short')} ${format(v)}`).join(', ')}`).join('; ')}`}
          onPointerMove={(e) => { if (e.pointerType === 'mouse') { setHover(pick(e.clientX)); setPinned(false); } }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
          onClick={(e) => {
            const i = pick(e.clientX);
            const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch' || !matchMedia('(hover: hover)').matches;
            if (touch) { setHover(i); setPinned(true); } else if (p.onPick) p.onPick(shown[i]);
          }}
          style={{ cursor: p.onPick ? 'pointer' : 'default' }}>
          {ys.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'ch-zero' : 'ch-grid'} />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="ch-axis">{axisFormat(v)}</text>
            </g>
          ))}
          {hover !== null && <rect x={pad.l + band * hover} y={pad.t} width={band} height={h} className="ch-hover" />}

          {kind === 'bars' && ser.map((s, si) => s.vals.map((v, i) => {
            const x = cx(i) - groupW / 2 + si * each + (ser.length > 1 ? 1 : 0);
            const top = y(Math.max(v, 0)), base = y(Math.max(0, y0));
            const faded = (p.highlight && shown[i] !== p.highlight) || p.partial?.has(shown[i]);
            return <path key={`${s.id}${i}`} d={bar(x, top, Math.max(2, each - (ser.length > 1 ? 2 : 0)), Math.max(0, base - top))} fill={s.color} className={faded ? 'ch-fade' : ''} />;
          }))}
          {kind === 'stacked' && shown.map((m, i) => {
            let acc = 0;
            const faded = (p.highlight && m !== p.highlight) || p.partial?.has(m);
            return ser.map((s, si) => {
              const v = Math.max(0, s.vals[i]);
              const yTop = y(acc + v), yBot = y(acc);
              acc += v;
              const isTop = ser.slice(si + 1).every((o) => Math.max(0, o.vals[i]) === 0);
              const x = cx(i) - groupW / 2;
              return v > 0 ? <path key={`${s.id}${i}`} d={isTop ? bar(x, yTop, groupW, yBot - yTop) : `M${x},${yBot}V${yTop}H${x + groupW}V${yBot}Z`} fill={s.color} className={`ch-seg ${faded ? 'ch-fade' : ''}`} /> : null;
            });
          })}
          {kind === 'lines' && ser.map((s) => (
            <g key={s.id}>
              <path d={s.vals.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} className="ch-line" stroke={s.color} />
              {n <= 14 && s.vals.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill={s.color} className="ch-dot" />)}
            </g>
          ))}

          {bud && <path d={bud.map((v, i) => `M${(cx(i) - band / 2 + 2).toFixed(1)},${y(v).toFixed(1)}H${(cx(i) + band / 2 - 2).toFixed(1)}`).join('')} className="ch-budget" />}
          {avg !== null && <line x1={pad.l} x2={width - pad.r} y1={y(avg)} y2={y(avg)} className="ch-avg" />}
          {p.target && <line x1={pad.l} x2={width - pad.r} y1={y(p.target.value)} y2={y(p.target.value)} className="ch-budget" />}
          {hover !== null && kind === 'lines' && ser.map((s) => <circle key={s.id} cx={cx(hover)} cy={y(s.vals[hover])} r={5} fill={s.color} className="ch-focus" />)}

          {shown.map((m, i) => (i % every === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < every) ? (
            <text key={m} x={cx(i)} y={height - 6} textAnchor="middle" className={`ch-axis ${m === p.highlight ? 'ch-axis-on' : ''}`}>{xLabel(m) || monthName(m, 'short').slice(0, 3)}</text>
          ) : null)}
        </svg>
        {hover !== null && (
          <div className={`ch-tip ${pinned ? 'is-pinned' : ''}`} style={{ ...tipPos, top: pad.t, width: tipW }} role="status">
            <b>{monthName(shown[hover])}{p.partial?.has(shown[hover]) ? ' (not all accounts in)' : ''}</b>
            {ser.map((s) => <span key={s.id} className="ch-tip-row"><span><i className="key-line" style={{ background: s.color }} />{s.label}</span><strong>{format(s.vals[hover])}</strong></span>)}
            {kind === 'stacked' && ser.length > 1 && <span className="ch-tip-row ch-tip-total"><span>Total</span><strong>{format(ser.reduce((a, s) => a + s.vals[hover], 0))}</strong></span>}
            {bud && bud[hover] > 0 && <span className="ch-tip-row"><span><i className="key-line key-budget" />Budget</span><strong>{format(bud[hover])}</strong></span>}
            {p.tipExtra?.(shown[hover]).map((x) => <span key={x.label} className="ch-tip-row"><span>{x.label}</span><strong>{x.value}</strong></span>)}
            {pinned && (
              <span className="ch-tip-actions">
                {p.onPick && <button type="button" onClick={() => { p.onPick!(shown[hover]); setHover(null); }}>{p.pickLabel ?? 'See payments'} <ChevronRight size={14} aria-hidden /></button>}
                <button type="button" className="ch-tip-close" onClick={() => { setHover(null); setPinned(false); }} aria-label="Close">×</button>
              </span>
            )}
            {!pinned && p.onPick && <small className="ch-tip-hint">Click to {(p.pickLabel ?? 'See payments').toLowerCase()}</small>}
          </div>
        )}
      </div>
    </div>
  );
}

/** The same numbers as a table, for reading exact values or with a screen reader. */
export function ChartTable({ months, series, format = money }: { months: string[]; series: Series[]; format?: (n: number) => string }) {
  return (
    <div className="table-wrap">
      <table className="score compact">
        <thead><tr><th>Month</th>{series.map((s) => <th key={s.id}>{s.label}</th>)}{series.length > 1 && <th>Total</th>}</tr></thead>
        <tbody>{months.map((m, i) => (
          <tr key={m}><th scope="row">{monthName(m, 'short')}</th>{series.map((s) => <td key={s.id}>{format(s.values[i] ?? 0)}</td>)}{series.length > 1 && <td>{format(series.reduce((a, s) => a + (s.values[i] ?? 0), 0))}</td>}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
