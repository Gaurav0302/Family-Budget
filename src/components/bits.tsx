import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info as InfoIcon, Eye } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Severity } from '../data/review';
import { tone, toneWords } from '../data/guide';
import { money, monthName, pct } from '../lib/format';

export function PageHeader({ title, children, lead }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children && <div className="page-tools">{children}</div>}
    </header>
  );
}

export function MonthPicker({ months, value, onChange, completeSet }: {
  months: string[]; value: string; onChange: (m: string) => void; completeSet?: Set<string>;
}) {
  const i = months.indexOf(value);
  return (
    <div className="month-picker" role="group" aria-label="Choose month">
      <button className="icon-btn" disabled={i <= 0} onClick={() => onChange(months[i - 1])} aria-label="Previous month"><ChevronLeft size={18} /></button>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Month">
        {months.map((m) => (
          <option key={m} value={m}>{monthName(m)}{completeSet && !completeSet.has(m) ? ' (partial)' : ''}</option>
        ))}
      </select>
      <button className="icon-btn" disabled={i < 0 || i >= months.length - 1} onClick={() => onChange(months[i + 1])} aria-label="Next month"><ChevronRight size={18} /></button>
    </div>
  );
}

const SEV: Record<Severity, { label: string; Icon: typeof InfoIcon }> = {
  act: { label: 'Needs attention', Icon: AlertTriangle },
  watch: { label: 'Keep an eye on', Icon: Eye },
  good: { label: 'On track', Icon: CheckCircle2 },
  info: { label: 'Good to know', Icon: InfoIcon },
};

export function Badge({ severity, short }: { severity: Severity; short?: boolean }) {
  const { label, Icon } = SEV[severity];
  return <span className={`badge sev-${severity}`}><Icon size={14} aria-hidden />{!short && label}{short && <span className="sr-only">{label}</span>}</span>;
}

/** Spending against budget: the track is the budget, the fill is what was spent; past the budget turns red. */
export function Meter({ actual, budget }: { actual: number; budget: number }) {
  const max = Math.max(actual, budget, 1);
  const within = Math.min(actual, budget);
  const over = Math.max(0, actual - budget);
  const state = !budget ? 'nobudget' : actual > budget * 1.1 ? 'over' : actual > budget + 0.5 ? 'near' : 'under';   // near = a little over (up to 10%)
  return (
    <div className={`meter meter-${state}`} role="img" aria-label={`${money(actual)} spent of ${money(budget)} budget`}>
      <div className="meter-track" style={{ width: `${(budget / max) * 100}%` }} />
      <div className="meter-fill" style={{ width: `${(within / max) * 100}%` }} />
      {over > 0 && <div className="meter-over" style={{ left: `calc(${(budget / max) * 100}% + 2px)`, width: `calc(${(over / max) * 100}% - 2px)` }} />}
    </div>
  );
}

/** The month's income split into needs, wants and what was kept, with Babylon's one-in-ten line. */
/** Where the month's money went, against the 50/30/20 guide. Colours carry meaning (the same in every theme):
 *  plain for needs within the guide, amber for anything over it, and for kept green (20%+), amber (10–20%) or red (under 10%).
 *  Every colour also has words, so nothing relies on colour alone. */
export function PurseBar({ income, needs, wants, kept, complete = true, onOpen }: { income: number; needs: number; wants: number; kept: number; complete?: boolean; onOpen?: (type: 'need' | 'want') => void }) {
  const total = Math.max(income, needs + wants, 1);
  const seg = (v: number) => `${(Math.max(v, 0) / total) * 100}%`;
  const share = (v: number) => (income > 0 ? v / income : 0);
  const short = kept < 0;
  const n = share(needs), w = share(wants), k = share(kept);
  const t = { needs: tone('needs', n, complete), wants: tone('wants', w, complete), kept: tone('kept', k, complete) };
  const words = { needs: toneWords('needs', n, income, complete), wants: toneWords('wants', w, income, complete), kept: short ? `${money(-kept)} more went out than came in` : toneWords('kept', k, income, complete) };
  const label = (name: string, v: number, state: string, type?: 'need' | 'want') => {
    const text = <><b>{name} {pct(share(v))}</b> <span>{money(v)}, {state}</span></>;
    return type && onOpen ? <button type="button" className="drill-link purse-key" onClick={() => onOpen(type)}>{text}</button> : <span className="purse-key">{text}</span>;
  };
  return (
    <figure className="purse">
      <div className="purse-rows">
        <span className="purse-row-label">You</span>
        <div className="purse-bar" role="img" aria-label={`Needs ${pct(n)}, ${words.needs}. Wants ${pct(w)}, ${words.wants}. Kept ${pct(k)}, ${words.kept}.`}>
          <span className={`purse-seg st-${t.needs}`} style={{ width: seg(needs) }}><b>Needs</b><span>{money(needs)}</span></span>
          <span className={`purse-seg st-${t.wants}`} style={{ width: seg(wants) }}><b>Wants</b><span>{money(wants)}</span></span>
          {!short && <span className={`purse-seg st-${t.kept}`} style={{ width: seg(kept) }}><b>Kept</b><span>{money(kept)}</span></span>}
        </div>
        <span className="purse-row-label">Guide</span>
        <div className="purse-guide" aria-hidden>
          <span style={{ width: '50%' }}><i className="full">Needs&nbsp;</i>50%</span><span style={{ width: '30%' }}><i className="full">Wants&nbsp;</i>30%</span><span style={{ width: '20%' }}><i className="full">Kept&nbsp;</i>20%</span>
        </div>
      </div>
      <figcaption>
        {label('Needs', needs, words.needs, 'need')}
        {label('Wants', wants, words.wants, 'want')}
        <span className="purse-key"><b>Kept {pct(k)}</b> <span>{words.kept}</span></span>
      </figcaption>
    </figure>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children}</div>;
}

/** A small "i" button that reveals one short explanation, so pages stay uncluttered. */
export function Info({ children, label = 'What is this?' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info">
      <button type="button" className="info-btn" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>i</button>
      {open && <span className="info-pop" role="note">{children}<button type="button" className="info-close" onClick={() => setOpen(false)} aria-label="Close">×</button></span>}
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="seg tabs" role="tablist">
      {items.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

/** Inline number editor: shows the value, saves on Enter or when you click away. */
export function NumberField({ value, onSave, label, prefix = '$', suffix, width = '7em' }: {
  value: number; onSave: (n: number) => void; label: string; prefix?: string; suffix?: string; width?: string;
}) {
  const [t, setT] = useState<string | null>(null);
  return (
    <span className="money-input">
      {prefix && <span aria-hidden>{prefix}</span>}
      <input inputMode="decimal" aria-label={label} style={{ width }}
        value={t ?? (Math.round(value * 100) / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 })}
        onFocus={() => setT(String(Math.round(value * 100) / 100))}
        onChange={(e) => setT(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={() => { if (t !== null) { const n = Number(t || 0); if (Math.abs(n - value) > 0.001) onSave(n); setT(null); } }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      {suffix && <span aria-hidden className="suffix">{suffix}</span>}
    </span>
  );
}

/** A tiny bar chart for a table row: one bar per month, the chosen month darker, the budget as a faint line. */
export function Spark({ values, highlight, budget, label }: { values: { month: string; value: number }[]; highlight?: string; budget?: number; label: string }) {
  if (!values.length) return null;
  const max = Math.max(...values.map((v) => v.value), budget ?? 0, 1);
  const w = 12, gap = 3, h = 26;
  const width = values.length * (w + gap) - gap;
  return (
    <svg className="spark" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img"
      aria-label={`${label}: ${values.map((v) => `${monthName(v.month, 'short')} ${money(v.value)}`).join(', ')}`}>
      {values.map((v, i) => {
        const bh = Math.max(1.5, (Math.max(v.value, 0) / max) * h);
        return <rect key={v.month} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={2} className={v.month === highlight ? 'spark-on' : 'spark-bar'}><title>{`${monthName(v.month)}: ${money(v.value)}`}</title></rect>;
      })}
      {budget ? <line x1={0} x2={width} y1={h - (budget / max) * h} y2={h - (budget / max) * h} className="spark-budget" /> : null}
    </svg>
  );
}
