import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, NumberField, PageHeader } from '../components/bits';
import { Chart, seriesColor } from '../components/Chart';
import { addMonths, budgetFor } from '../data/analysis';
import { mon } from '../data/plans';
import { homeProperty, uniPlanOf, uniStart } from '../data/property';
import { useStore } from '../data/store';
import type { UniFund, UniPlan } from '../data/types';
import { latestBalance, monthlyAt, monthlyForGoal, uniPath } from '../data/uni';
import { useForecast } from '../data/useProperties';
import { money, monthName, pct, thisMonth } from '../lib/format';

const uid = () => Math.random().toString(36).slice(2, 9);

export function Uni() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const funds = s.uniFunds ?? [];
  const plan = uniPlanOf(s);
  const { f } = useForecast();
  const home = homeProperty(s, data.budgets);
  const loanRate = home?.loan?.rate ?? 0;
  const rate = plan.inOffset && home?.loan ? loanRate : plan.returnPct;
  const set = (i: number, patch: Partial<UniFund>) => updateSettings({ uniFunds: funds.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setPlan = (patch: Partial<UniPlan>) => updateSettings({ uniPlan: { ...plan, ...patch } });
  const last = funds.length ? `${Math.max(...funds.map((u) => u.year)) + plan.years}-03` : thisMonth();
  const paths = funds.map((u) => uniPath(u, uniStart(u, data.budgets, thisMonth()), rate, plan.years, last));
  const longest = paths.reduce<{ month: string }[]>((a, x) => (x.length > a.length ? x : a), []);
  const months = longest.map((x) => x.month);
  const valueAt = (i: number, m: string) => paths[i].find((x) => x.month === m)?.value ?? 0;
  const planned = (m: string) => funds.filter((u) => uniStart(u, data.budgets, m) <= m && m < `${u.year}-02`).reduce((a, u) => a + monthlyAt(u, m), 0);
  const next = f.months.filter((x) => !x.part).slice(0, 6);

  return (
    <div className="uni">
      <PageHeader title="Uni funds">
        <Info>One fund for each child, saved each month until uni starts, then spent evenly over the years at uni. Kept in the offset, a fund grows at the loan rate by cancelling interest. The money meeting flags any month the budget doesn't give the funds their amount, or nothing is left over to put aside.</Info>
      </PageHeader>

      <section className="panel uni-plan" aria-labelledby="kept">
        <h2 id="kept">How the funds are kept</h2>
        <div className="seg" role="group" aria-label="Where the funds are kept">
          <button className={plan.inOffset ? 'on' : ''} aria-pressed={plan.inOffset} onClick={() => setPlan({ inOffset: true })}>In the offset</button>
          <button className={!plan.inOffset ? 'on' : ''} aria-pressed={!plan.inOffset} onClick={() => setPlan({ inOffset: false })}>Invested elsewhere</button>
        </div>
        <p className="fine">{plan.inOffset
          ? `In the offset each fund grows at the loan rate (${loanRate}%), tax-free, by cancelling interest. When uni starts the money leaves the offset, so interest goes back up. The loan on Property counts it.`
          : 'Invested separately, the funds grow at the return you expect and don’t touch the loan.'}</p>
        <div className="field-grid">
          {!plan.inOffset && <label>Expected return a year, after fees and tax<NumberField label="Expected return" prefix="" suffix="%" value={plan.returnPct} onSave={(n) => setPlan({ returnPct: n })} /><small className="muted">Your own assumption.</small></label>}
          <label>Years at uni<NumberField label="Years at uni" prefix="" value={plan.years} onSave={(n) => setPlan({ years: Math.max(1, Math.round(n)) })} /><small className="muted">Each fund is drawn evenly over them.</small></label>
        </div>
      </section>

      <div className="uni-cards">
        {funds.map((u, i) => <FundCard key={u.name + i} u={u} i={i} rate={rate} path={paths[i]} set={(patch) => set(i, patch)} remove={() => updateSettings({ uniFunds: funds.filter((_, j) => j !== i) })} />)}
      </div>
      <button className="btn small" onClick={() => updateSettings({ uniFunds: [...funds, { name: `Child ${funds.length + 1}`, target: 0, monthly: 300, saved: 0, year: new Date().getFullYear() + 10 }] })}><Plus size={14} aria-hidden /> Add a fund</button>

      {months.length > 1 && (
        <section className="panel" aria-labelledby="uni-chart">
          <Chart title={<div><h2 id="uni-chart">The funds over time</h2><p className="muted small">Each fund grows until uni starts, then is drawn down evenly over {plan.years} {plan.years === 1 ? 'year' : 'years'}. Dashed lines are the goals.</p></div>}
            label="Uni funds by month" kind="lines" months={months} range="all" noRange height={240}
            bands={funds.map((u, i) => ({ from: `${u.year}-02`, to: addMonths(`${u.year}-02`, plan.years * 12 - 1), label: `${u.name} at uni`, color: seriesColor(i) }))}
            goals={funds.filter((u) => u.target > 0).map((u) => ({ value: u.target, until: `${u.year}-02`, label: `${u.name}'s goal ${money(u.target)}`, color: seriesColor(funds.indexOf(u)) }))}
            series={funds.map((u, i) => ({ id: u.name, label: u.name, values: months.map((m) => valueAt(i, m)), color: seriesColor(i) }))} />
        </section>
      )}

      {next.length > 0 && (
        <section className="panel" aria-labelledby="uni-budget">
          <div className="panel-head"><h2 id="uni-budget">In the budget</h2><Link to="/budget">Budget</Link></div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Uni funds in the budget (table)">
            <table className="score">
              <thead><tr><th>Month</th><th>Planned</th><th>Budgeted</th><th>Left over that month <Info>From the forecast: pay less everything going out, not counting buying costs. If it's less than the funds need, they only grow if savings shrink.</Info></th><th><span className="sr-only">Status</span></th></tr></thead>
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

function FundCard({ u, i, rate, path, set, remove }: { u: UniFund; i: number; rate: number; path: { month: string; value: number }[]; set: (p: Partial<UniFund>) => void; remove: () => void }) {
  const { data } = useStore();
  const start = uniStart(u, data.budgets, thisMonth());
  const atUni = path.find((x) => x.month === `${u.year}-01`)?.value ?? path.at(-1)?.value ?? latestBalance(u).amount;
  const share = u.target ? Math.min(1, atUni / u.target) : null;
  const need = u.target > 0 ? monthlyForGoal(u, start, rate) : 0;
  const bal = latestBalance(u);
  const [ciMonth, setCiMonth] = useState(addMonths(thisMonth(), -1));
  const [ciAmt, setCiAmt] = useState('');
  const [chMonth, setChMonth] = useState(addMonths(thisMonth(), 1));
  const [chAmt, setChAmt] = useState('');
  const [chFor, setChFor] = useState<'perm' | 'temp'>('perm');
  const [chUntil, setChUntil] = useState(addMonths(thisMonth(), 12));
  const changes = [...(u.changes ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const checkIns = [...(u.checkIns ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  return (
    <section className="panel uni-card" aria-labelledby={`uni-${i}`}>
      <div className="panel-head">
        <h2 id={`uni-${i}`}><i className="key-dot" style={{ background: seriesColor(i) }} aria-hidden />{u.name}</h2>
        <span className="muted small">Uni from February {u.year}</span>
      </div>
      <p className="uni-big"><b>{money(atUni)}</b> <span className="muted">when uni starts{u.target ? `, ${share! >= 1 ? 'goal met' : `${money(u.target - atUni)} short of ${money(u.target)}`}` : ''}</span></p>
      {share !== null && <div className="progress" role="img" aria-label={`${pct(share)} of the goal`}><span style={{ width: `${share * 100}%` }} /></div>}
      {u.target > 0 && share! < 1 && <p className="fine">About <b>{money(need)}</b> a month from {mon(start > thisMonth() ? start : thisMonth())} reaches the goal.</p>}
      <div className="field-grid">
        <label>Each month<NumberField label={`${u.name} each month`} value={u.monthly} onSave={(n) => set({ monthly: n })} /></label>
        <label>Goal when uni starts<NumberField label={`${u.name} goal`} value={u.target} onSave={(n) => set({ target: n })} /><small className="muted">0 for no goal.</small></label>
        <label>Saving from<input type="month" value={start} onChange={(e) => e.target.value && set({ start: e.target.value })} /></label>
        <label>Uni year<input inputMode="numeric" aria-label={`${u.name} uni year`} defaultValue={u.year} onBlur={(e) => { const y = Number(e.target.value); if (y > 2000 && y !== u.year) set({ year: y }); }} /></label>
      </div>

      <details className="uni-more" open={changes.length > 0}>
        <summary>Changes to the monthly saving{changes.length ? ` (${changes.length})` : ''}</summary>
        {changes.map((c) => (
          <p key={c.id} className="uni-row"><span>From {mon(c.month)}{c.until ? ` to ${mon(c.until)}` : ''}: {money(c.monthly)} a month{c.until ? ', then back' : ''}</span>
            <button className="icon-btn" aria-label="Remove" onClick={() => set({ changes: (u.changes ?? []).filter((x) => x.id !== c.id) })}><Trash2 size={14} /></button></p>
        ))}
        <div className="uni-form">
          <label>From<input type="month" value={chMonth} onChange={(e) => e.target.value && setChMonth(e.target.value)} /></label>
          <label>New amount a month<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={chAmt} onChange={(e) => setChAmt(e.target.value.replace(/[^\d.]/g, ''))} /></span></label>
          <label>How long<select value={chFor} onChange={(e) => setChFor(e.target.value as 'perm' | 'temp')}><option value="perm">From then on</option><option value="temp">For a while</option></select></label>
          {chFor === 'temp' && <label>Until<input type="month" value={chUntil} min={chMonth} onChange={(e) => e.target.value && setChUntil(e.target.value)} /></label>}
          <button className="btn small" disabled={chAmt === ''} onClick={() => { set({ changes: [...(u.changes ?? []), { id: uid(), month: chMonth, monthly: Number(chAmt), ...(chFor === 'temp' ? { until: chUntil } : {}) }] }); setChAmt(''); }}>Add</button>
        </div>
      </details>

      <details className="uni-more" open={checkIns.length > 0}>
        <summary>Balance check-ins{checkIns.length ? ` (latest ${mon(bal.month)}: ${money(bal.amount)})` : ''}</summary>
        <p className="fine">Copy the fund's balance from a statement. The projection then starts from it.</p>
        {checkIns.map((c) => (
          <p key={c.month} className="uni-row"><span>End of {mon(c.month)}: {money(c.amount)}</span>
            <button className="icon-btn" aria-label="Remove" onClick={() => set({ checkIns: (u.checkIns ?? []).filter((x) => x.month !== c.month) })}><Trash2 size={14} /></button></p>
        ))}
        {!checkIns.length && <p className="muted small">None yet. Until then the fund starts from {money(u.saved)}.</p>}
        <div className="uni-form">
          <label>Balance at the end of<input type="month" value={ciMonth} max={thisMonth()} onChange={(e) => e.target.value && setCiMonth(e.target.value)} /></label>
          <label>Balance<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={ciAmt} onChange={(e) => setCiAmt(e.target.value.replace(/[^\d.]/g, ''))} /></span></label>
          <button className="btn small" disabled={ciAmt === ''} onClick={() => { set({ checkIns: [...(u.checkIns ?? []).filter((x) => x.month !== ciMonth), { month: ciMonth, amount: Number(ciAmt) }] }); setCiAmt(''); }}>Save</button>
        </div>
      </details>
      <button className="link danger small" onClick={() => { if (confirm(`Remove ${u.name}'s fund?`)) remove(); }}><Trash2 size={13} aria-hidden /> Remove this fund</button>
    </section>
  );
}
