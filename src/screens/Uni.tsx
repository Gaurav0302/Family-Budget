import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Info, NumberField, PageHeader } from '../components/bits';
import { Chart, seriesColor } from '../components/Chart';
import { addMonths, budgetFor } from '../data/analysis';
import { homeProperty, uniStart } from '../data/property';
import { useStore } from '../data/store';
import type { UniFund } from '../data/types';
import { useForecast } from '../data/useProperties';
import { money, monthName, pct, thisMonth } from '../lib/format';

const UNI_YEARS = 3;

/** A fund's balance month by month: saved so far, plus the monthly amount from its start, growing at `rate`% a year,
 *  then drawn evenly over the years at uni. */
export function uniPath(f: UniFund, start: string, rate: number, until: string): { month: string; value: number }[] {
  const out: { month: string; value: number }[] = [];
  const uni = `${f.year}-02`;
  const end = addMonths(uni, UNI_YEARS * 12);
  let bal = f.saved, draw = 0;
  for (let m = thisMonth(); m <= until && m <= end; m = addMonths(m, 1)) {
    if (m < uni) { bal = bal * (1 + rate / 1200) + (m >= start ? f.monthly : 0); }
    else { if (m === uni) draw = bal / (UNI_YEARS * 12); bal = Math.max(0, bal - draw); }
    out.push({ month: m, value: bal });
  }
  return out;
}

export function Uni() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const funds = s.uniFunds ?? [];
  const { f } = useForecast();
  const home = homeProperty(s, data.budgets);
  const set = (i: number, patch: Partial<UniFund>) => updateSettings({ uniFunds: funds.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const rateOf = (u: UniFund) => (u.inOffset !== false && home?.loan ? home.loan.rate : 4);
  const last = funds.length ? `${Math.max(...funds.map((u) => u.year)) + UNI_YEARS}-01` : thisMonth();
  const paths = funds.map((u) => uniPath(u, uniStart(u, data.budgets, thisMonth()), rateOf(u), last));
  const longest = paths.reduce<{ month: string }[]>((a, x) => (x.length > a.length ? x : a), []);
  const months = longest.map((x) => x.month);
  const valueAt = (i: number, m: string) => paths[i].find((x) => x.month === m)?.value ?? 0;
  const planned = (m: string) => funds.filter((u) => uniStart(u, data.budgets, m) <= m && m < `${u.year}-02`).reduce((a, u) => a + u.monthly, 0);
  const next = f.months.filter((x) => !x.part).slice(0, 6);

  return (
    <div className="uni">
      <PageHeader title="Uni funds">
        <Info>One fund for each child, saved each month until uni starts, then spent over {UNI_YEARS} years. Kept in the offset, a fund earns the loan rate by cancelling interest. The money meeting flags any month the budget doesn't give the funds their amount, or nothing is left over to put aside.</Info>
      </PageHeader>

      <div className="uni-cards">
        {funds.map((u, i) => {
          const atUni = paths[i].find((x) => x.month === `${u.year}-02`)?.value ?? paths[i].at(-1)?.value ?? u.saved;
          const share = u.target ? Math.min(1, atUni / u.target) : null;
          return (
            <section key={u.name} className="panel uni-card" aria-labelledby={`uni-${i}`}>
              <div className="panel-head">
                <h2 id={`uni-${i}`}><i className="key-dot" style={{ background: seriesColor(i) }} aria-hidden />{u.name}</h2>
                <span className="muted small">Uni from February {u.year}</span>
              </div>
              <p className="uni-big"><b>{money(atUni)}</b> <span className="muted">when uni starts{u.target ? `, ${share! >= 1 ? 'goal met' : `${money(u.target - atUni)} short of ${money(u.target)}`}` : ''}</span></p>
              {share !== null && <div className="progress" role="img" aria-label={`${pct(share)} of the goal`}><span style={{ width: `${share * 100}%` }} /></div>}
              <div className="field-grid">
                <label>Saved so far<NumberField label={`${u.name} saved so far`} value={u.saved} onSave={(n) => set(i, { saved: n, savedOn: new Date().toISOString().slice(0, 10) })} /><small className="muted">{u.savedOn ? `as at ${u.savedOn.split('-').reverse().join('/')}` : ''}</small></label>
                <label>Each month<NumberField label={`${u.name} each month`} value={u.monthly} onSave={(n) => set(i, { monthly: n })} /></label>
                <label>Goal<NumberField label={`${u.name} goal`} value={u.target} onSave={(n) => set(i, { target: n })} /></label>
                <label>Starts<input type="month" value={uniStart(u, data.budgets, thisMonth())} onChange={(e) => e.target.value && set(i, { start: e.target.value })} /></label>
                <label>Uni year<input inputMode="numeric" aria-label={`${u.name} uni year`} defaultValue={u.year} onBlur={(e) => { const y = Number(e.target.value); if (y > 2000 && y !== u.year) set(i, { year: y }); }} /></label>
              </div>
              <label className="check small"><input type="checkbox" checked={u.inOffset !== false} onChange={(e) => set(i, { inOffset: e.target.checked })} /><span>Kept in the offset (earns {rateOf({ ...u, inOffset: true })}%)</span></label>
              <button className="link danger small" onClick={() => { if (confirm(`Remove ${u.name}'s fund?`)) updateSettings({ uniFunds: funds.filter((_, j) => j !== i) }); }}><Trash2 size={13} aria-hidden /> Remove</button>
            </section>
          );
        })}
      </div>
      <button className="btn small" onClick={() => updateSettings({ uniFunds: [...funds, { name: `Child ${funds.length + 1}`, target: 0, monthly: 300, saved: 0, year: new Date().getFullYear() + 10 }] })}><Plus size={14} aria-hidden /> Add a fund</button>

      {months.length > 1 && (
        <section className="panel" aria-labelledby="uni-chart">
          <Chart title={<h2 id="uni-chart">The funds over time</h2>} label="Uni funds by month" kind="lines" months={months} range="all" noRange height={220}
            marks={funds.map((u) => ({ month: `${u.year}-02`, label: `${u.name} starts` }))}
            series={funds.map((u, i) => ({ id: u.name, label: u.name, values: months.map((m) => valueAt(i, m)), color: seriesColor(i) }))} />
        </section>
      )}

      {next.length > 0 && (
        <section className="panel" aria-labelledby="uni-budget">
          <div className="panel-head"><h2 id="uni-budget">In the budget</h2><Link to="/budget">Budget</Link></div>
          <div className="table-wrap">
            <table className="score">
              <thead><tr><th>Month</th><th>Planned</th><th>Budgeted</th><th>Left over that month <Info>From the forecast: pay less everything going out, not counting buying costs. If it's less than the funds need, they only grow if savings shrink.</Info></th><th /></tr></thead>
              <tbody>{next.map((x) => {
                const need = planned(x.month), bud = budgetFor(data.budgets, 'keep-uni', x.month);
                const left = x.kept + x.oneOffs.reduce((a, o) => a + o.amount, 0);
                const state = !need ? 'none' : bud < need - 1 ? 'budget' : left < need ? 'money' : 'ok';
                return (
                  <tr key={x.month}><th scope="row">{monthName(x.month)}</th><td>{need ? money(need) : '–'}</td><td>{bud ? money(bud) : '–'}</td><td className={left < 0 ? 'st-text-bad' : ''}>{money(left)}</td>
                    <td className={`small st-text-${state === 'ok' ? 'good' : state === 'none' ? 'partial' : 'warn'}`}>{state === 'ok' ? 'Covered' : state === 'budget' ? 'Not in the budget' : state === 'money' ? 'From savings' : 'Not started'}</td></tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
