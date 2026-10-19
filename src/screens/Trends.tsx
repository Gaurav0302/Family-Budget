import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chart, ChartTable, inRange, RangePicker, SERIES_COLORS, seriesColor, type Range } from '../components/Chart';
import { drillCats, useDrill } from '../components/Drill';
import { Info, PageHeader, Tabs } from '../components/bits';
import { CATEGORIES, GROUPS } from '../data/categories';
import { budgetOf, spendOf, useMonthly } from '../data/useMonthly';
import { useStore } from '../data/store';
import { money } from '../lib/format';

type Level = 'areas' | 'categories';
type View = 'lines' | 'stacked';

/** Pick areas or categories and see how they move over time, side by side or stacked. */
export function Trends() {
  const { data } = useStore();
  const drill = useDrill();
  const m = useMonthly();
  const [params, setParams] = useSearchParams();
  const level = (params.get('level') as Level) ?? 'areas';
  const view = (params.get('view') as View) ?? 'lines';
  const range = (params.get('range') as Range) ?? '6m';
  const [table, setTable] = useState(false);
  const [more, setMore] = useState(false);
  const set = (patch: Record<string, string>) => setParams({ level, view, range, sel: params.get('sel') ?? '', ...patch }, { replace: true });

  // Everything that can be picked, with its categories and spending in the chosen span.
  const span = new Set(inRange(m.months, range));
  const options = useMemo(() => {
    const list = level === 'areas'
      ? GROUPS.map((g) => ({ id: g, label: g, ids: CATEGORIES.filter((c) => !c.system && c.group === g).map((c) => c.id) }))
      : CATEGORIES.filter((c) => !c.system).map((c) => ({ id: c.id, label: c.label, ids: [c.id] }));
    return list.map((o) => {
      const values = spendOf(m.sums, o.ids);
      return { ...o, values, total: values.reduce((a, v, i) => a + (span.has(m.months[i]) ? v : 0), 0) };
    }).filter((o) => o.values.some((v) => v > 0)).sort((a, b) => b.total - a.total);
  }, [level, m, range]);

  // Selection keeps each pick in its colour slot, so adding or removing one never repaints the others.
  const raw = params.get('sel');
  const slots: string[] = raw === null || raw === '' ? options.slice(0, 4).map((o) => o.id) : raw.split('|');
  const picked = slots.map((id, slot) => ({ slot, o: options.find((x) => x.id === id) })).filter((x) => x.o);
  const toggle = (id: string) => {
    const i = slots.indexOf(id);
    const next = [...slots];
    if (i >= 0) next[i] = '';
    else { const free = next.indexOf(''); if (free >= 0) next[free] = id; else if (next.length < SERIES_COLORS) next.push(id); else return; }
    while (next.length && !next[next.length - 1]) next.pop();
    set({ sel: next.join('|') || '|' });
  };

  const series = picked.map(({ slot, o }) => ({ id: o!.id, label: o!.label, values: o!.values, color: seriesColor(slot) }));
  if (view === 'stacked') {
    const rest = m.sums.map((s, i) => s.spend - series.reduce((a, x) => a + x.values[i], 0));
    if (rest.some((v) => v > 0.5)) series.push({ id: 'rest', label: 'Everything else', values: rest, color: 'var(--s-rest)' });
  }
  const ids = picked.flatMap(({ o }) => o!.ids);
  const shown = inRange(m.months, range);
  const idx = shown.map((x) => m.months.indexOf(x));

  return (
    <div className="trends">
      <PageHeader title="Trends">
        <Info>Pick up to eight areas or categories to follow. “Compare” draws a line for each; “Make-up” stacks them with everything else, so the bar is your total spending. Hover or tap a month for the numbers; click it to see the payments. Paler months are missing an account.</Info>
      </PageHeader>
      <div className="trend-controls">
        <Tabs value={level} onChange={(v) => set({ level: v, sel: '' })} items={[{ id: 'areas', label: 'Areas' }, { id: 'categories', label: 'Categories' }]} />
        <Tabs value={view} onChange={(v) => set({ view: v })} items={[{ id: 'lines', label: 'Compare' }, { id: 'stacked', label: 'Make-up' }]} />
        <RangePicker months={m.months} value={range} onChange={(r) => set({ range: r })} />
      </div>
      <div className="trend-picks" role="group" aria-label={`Choose ${level}`}>
        {options.filter((o, i) => more || i < 8 || slots.includes(o.id)).map((o) => {
          const slot = slots.indexOf(o.id);
          const on = slot >= 0;
          const full = !on && slots.filter(Boolean).length >= SERIES_COLORS;
          return (
            <button key={o.id} type="button" className={`pick ${on ? 'on' : ''}`} aria-pressed={on} disabled={full} title={full ? 'Eight at a time: remove one first' : undefined} onClick={() => toggle(o.id)}>
              <i style={on ? { background: seriesColor(slot) } : undefined} />{o.label}<small>{money(o.total)}</small>
            </button>
          );
        })}
        {options.length > 8 && <button type="button" className="pick pick-more" onClick={() => setMore(!more)}>{more ? 'Fewer' : `+${options.filter((o, i) => i >= 8 && !slots.includes(o.id)).length} more`}</button>}
      </div>
      <section className="panel">
        {series.length ? (
          <Chart noRange range={range} kind={view} height={300} label={`Spending by ${level === 'areas' ? 'area' : 'category'}`} months={m.months} series={series} partial={m.partial}
            budget={picked.length === 1 && view === 'lines' ? budgetOf(data.budgets, m.months, ids) : undefined}
            onPick={(month) => drill(drillCats(month, picked.length === 1 ? picked[0].o!.label : `${picked.length} ${level}`, ids))} />
        ) : <p className="muted">Pick something above to see its trend.</p>}
        <button className="btn small ghost" onClick={() => setTable(!table)}>{table ? 'Hide the table' : 'Show as a table'}</button>
        {table && <ChartTable months={shown} series={series.map((x) => ({ ...x, values: idx.map((i) => x.values[i]) }))} />}
      </section>
    </div>
  );
}
