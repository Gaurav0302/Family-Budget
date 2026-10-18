import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info as InfoIcon, Eye } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Severity } from '../data/review';
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
  const state = !budget ? 'nobudget' : actual > budget * 1.1 ? 'over' : actual > budget * 0.9 ? 'near' : 'under';
  return (
    <div className={`meter meter-${state}`} role="img" aria-label={`${money(actual)} spent of ${money(budget)} budget`}>
      <div className="meter-track" style={{ width: `${(budget / max) * 100}%` }} />
      <div className="meter-fill" style={{ width: `${(within / max) * 100}%` }} />
      {over > 0 && <div className="meter-over" style={{ left: `calc(${(budget / max) * 100}% + 2px)`, width: `calc(${(over / max) * 100}% - 2px)` }} />}
    </div>
  );
}

/** The month's income split into needs, wants and what was kept, with Babylon's one-in-ten line. */
export function PurseBar({ income, needs, wants, kept }: { income: number; needs: number; wants: number; kept: number }) {
  const total = Math.max(income, needs + wants, 1);
  const seg = (v: number) => `${(Math.max(v, 0) / total) * 100}%`;
  const short = kept < 0;
  return (
    <figure className="purse">
      <div className="purse-bar" role="img" aria-label={`Needs ${money(needs)}, wants ${money(wants)}, kept ${money(kept)} of ${money(income)} income`}>
        <span className="purse-seg seg-needs" style={{ width: seg(needs) }}><b>Needs</b> {money(needs)}</span>
        <span className="purse-seg seg-wants" style={{ width: seg(wants) }}><b>Wants</b> {money(wants)}</span>
        {!short && <span className="purse-seg seg-kept" style={{ width: seg(kept) }}><b>Kept</b> {money(kept)}</span>}
        {income > 0 && <span className="purse-mark" style={{ left: '90%' }} title="Babylon's rule: keep at least one in every ten" />}
      </div>
      <figcaption>
        <span><i className="dot dot-needs" />Needs {pct(needs / (income || 1))}</span>
        <span><i className="dot dot-wants" />Wants {pct(wants / (income || 1))}</span>
        <span><i className="dot dot-kept" />Kept {pct(kept / (income || 1))}</span>
        <span className="purse-legend-mark">The line marks Babylon's tenth: keep everything to its right.</span>
      </figcaption>
    </figure>
  );
}

/** Small monthly column chart with a hover readout. */
export function MonthColumns({ rows, format = money, target, targetLabel }: {
  rows: { month: string; value: number; partial?: boolean }[]; format?: (n: number) => string; target?: number; targetLabel?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), target ?? 0, 1);
  const min = Math.min(0, ...rows.map((r) => r.value));
  const range = max - min || 1;
  return (
    <div className="cols" role="img" aria-label={rows.map((r) => `${monthName(r.month, 'short')} ${format(r.value)}`).join(', ')}>
      <div className="cols-plot">
        {target !== undefined && <div className="cols-target" style={{ bottom: `${((target - min) / range) * 100}%` }}><span>{targetLabel}</span></div>}
        <div className="cols-zero" style={{ bottom: `${((0 - min) / range) * 100}%` }} />
        {rows.map((r) => {
          const h = (Math.abs(r.value) / range) * 100;
          const bottom = r.value >= 0 ? ((0 - min) / range) * 100 : ((r.value - min) / range) * 100;
          return (
            <div className="col" key={r.month} tabIndex={0}>
              <div className={`col-bar ${r.partial ? 'is-partial' : ''} ${r.value < 0 ? 'is-neg' : ''}`} style={{ height: `${h}%`, bottom: `${bottom}%` }} />
              <div className="col-tip" role="tooltip"><b>{monthName(r.month)}</b>{format(r.value)}{r.partial ? '. Not all accounts loaded' : ''}</div>
            </div>
          );
        })}
      </div>
      <div className="cols-axis">{rows.map((r) => <span key={r.month}>{monthName(r.month, 'short').replace(' 20', ' ’')}</span>)}</div>
    </div>
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
