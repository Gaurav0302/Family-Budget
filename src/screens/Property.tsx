import { Building2, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Info, NumberField, PageHeader, Tabs } from '../components/bits';
import { Chart } from '../components/Chart';
import { addMonths, monthOf } from '../data/analysis';
import { outgoings, type Basis } from '../data/forecast';
import { activePlanOf, ownedIn, pointIn, rentIn, repaymentOf, runningMonthly, toYM, uniPlanOf, type LoanView } from '../data/property';
import { checkInNet, checkInsOf, describeChange, expectedAt } from '../data/plans';
import { LoanChart } from '../components/LoanChart';
import { EditPlan, PlansTab, RecordTab } from './LoanPlans';
import { useStore } from '../data/store';
import type { Every, Property, PropertyCost, RunningCost } from '../data/types';
import { offsetAtStart, useForecast, useLoan, useProperties } from '../data/useProperties';
import { yearRows } from '../loan';
import { longDate, money, monthName, pct, thisMonth } from '../lib/format';
import { PER_MONTH } from '../data/wealth';
import { today as todayLocal } from '../lib/format';
import { FocusTrap } from '../components/FocusTrap';
import { WhatIf } from './WhatIf';

type Tab = 'overview' | 'plans' | 'edit' | 'record' | 'whatif' | 'buying' | 'costs';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'plans', label: 'Plans' }, { id: 'edit', label: 'Edit plan' }, { id: 'record', label: 'Record' }, { id: 'whatif', label: 'What if' },
  { id: 'buying', label: 'Buying' }, { id: 'costs', label: 'Costs & rent' },
];
const EVERY: Every[] = ['week', 'fortnight', 'month', 'term', 'quarter', 'year'];
const yrs = (months: number) => { const y = Math.floor(Math.abs(months) / 12), m = Math.abs(months) % 12; return [y && `${y} year${y > 1 ? 's' : ''}`, m && `${m} month${m > 1 ? 's' : ''}`].filter(Boolean).join(' ') || '0 months'; };
const idxName = (i: number) => monthName(toYM(i));
const newId = () => Math.random().toString(36).slice(2, 8);

/** Property: every property in one list; each opens into the same set of tabs. */
export function PropertyScreen() {
  const { id } = useParams();
  const { list } = useProperties();
  if (id) {
    const p = list.find((x) => x.id === id);
    return p ? <PropertyPage p={p} /> : <PropertyList />;
  }
  return <PropertyList />;
}

function PropertyList() {
  const { list } = useProperties();
  const [adding, setAdding] = useState(false);
  return (
    <div className="property">
      <PageHeader title="Property">
        <Info>Each property keeps its own buying costs, loan, running costs and rent. The forecast, net worth and the money meeting all read from here, so adding a property is all it takes.</Info>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> Add a property</button>
      </PageHeader>
      {!list.length && <p className="muted">No properties yet. Add your home or an investment to see its loan, costs and what it does to your cash.</p>}
      <div className="prop-cards">{list.map((p) => <PropertyCard key={p.id} p={p} />)}</div>
      {adding && <AddProperty onClose={() => setAdding(false)} />}
    </div>
  );
}

function PropertyCard({ p }: { p: Property }) {
  const v = useLoan(p);
  const now = v && thisMonth() >= v.inputs.setup.start ? pointIn(v.now, thisMonth()) : undefined;
  const owned = p.settlement <= todayLocal();
  return (
    <Link className="prop-card panel" to={`/property/${p.id}`}>
      <div className="prop-card-head">
        <Building2 size={22} aria-hidden />
        <div><h2>{p.name}</h2><span className="muted">{p.use === 'home' ? 'Our home' : 'Investment'} · {owned ? `owned since ${longDate(p.settlement)}` : `settles ${longDate(p.settlement)}`}</span></div>
        <ChevronRight size={18} aria-hidden className="muted" />
      </div>
      <dl className="prop-facts">
        <div><dt>Worth</dt><dd>{money(p.value ?? p.price)}</dd></div>
        {p.loan && <div><dt>Loan</dt><dd>{money(now?.loan ?? p.loan.amount)}</dd></div>}
        {v && <div><dt>Paid off</dt><dd>{idxName(v.now.paidIdx)}</dd></div>}
        {p.rent?.weekly ? <div><dt>Rent</dt><dd>{money(p.rent.weekly)} a week</dd></div> : null}
      </dl>
    </Link>
  );
}

function PropertyPage({ p }: { p: Property }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const { save, remove } = useProperties();
  const nav = useNavigate();
  const set = (patch: Partial<Property>) => save({ ...p, ...patch });
  return (
    <div className="property">
      <p className="crumbs"><Link to="/property">Property</Link> <ChevronRight size={14} aria-hidden /></p>
      <PageHeader title={p.name}>
        <span className="muted">{p.use === 'home' ? 'Our home' : 'Investment'}</span>
      </PageHeader>
      {/* What if (spending cuts) is about the family's home, so it shows on the home only. */}
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={TABS.filter((t) => t.id !== 'whatif' || p.use === 'home')} />
      {!p.loan && tab !== 'buying' && tab !== 'costs' && tab !== 'whatif' && <p className="muted">No loan on this property. Add one in Edit plan.</p>}
      <div className="prop-body">
        {tab === 'overview' && <Overview p={p} />}
        {tab === 'plans' && <PlansTab p={p} />}
        {tab === 'edit' && <EditPlan key={params.get('plan') ?? 'active'} p={p} planId={params.get('plan') ?? undefined} />}
        {tab === 'record' && <RecordTab p={p} />}
        {tab === 'whatif' && <WhatIf embedded />}
        {tab === 'buying' && <Buying p={p} set={set} />}
        {tab === 'costs' && <CostsTab p={p} set={set} />}
      </div>
      {tab === 'buying' && (
        <p className="fine">Sold it, or added it by mistake? <button className="link danger" onClick={() => { if (confirm(`Remove ${p.name} from the app? Its payments stay where they are.`)) { remove(p.id); nav('/property'); } }}>Remove this property</button></p>
      )}
    </div>
  );
}

/* ---------------- Overview: the Loan Planner's dashboard, on real figures ---------------- */

function Overview({ p }: { p: Property }) {
  const { data } = useStore();
  const { f, st: story } = useForecast();
  const [, setParams] = useSearchParams();
  const plan = activePlanOf(p);
  const v = useLoan(p, plan);
  const offsetStart = offsetAtStart(p, story, f.start.cash, plan, data.settings);
  const kidsIn = uniPlanOf(data.settings).inOffset;
  const checkIns = checkInsOf(data, p);
  const latest = v ? checkIns.filter((c) => c.month >= v.inputs.setup.start).at(-1) : undefined;
  const status = useMemo(() => {
    if (!latest || !v) return null;
    const diff = expectedAt(data, p, plan, latest.month, offsetStart).net - checkInNet(latest, kidsIn);
    return { diff, word: diff > 500 ? 'ahead' : diff < -500 ? 'behind' : 'on' } as const;
  }, [data, p, plan, latest, offsetStart, kidsIn, v]);
  if (!p.loan || !v) return null;
  const st = v.inputs.setup;
  const today = thisMonth();
  const started = today >= st.start;
  const at = started ? today : st.start;
  const pt = pointIn(v.now, at)!;
  const net = latest ? checkInNet(latest, kidsIn) : started ? pt.net : st.loan - st.offset0;
  const cancelled = Math.max(0, Math.min(1, 1 - net / st.loan));
  const timeSaved = v.bank.paidMonth - v.now.paidMonth;
  const interestSaved = v.bank.totalInterest - v.now.totalInterest;
  const bankAt = pointIn(v.bank, at)!;
  const avoided = started ? Math.max(0, bankAt.cumInterest - pt.cumInterest) : 0;
  const offsetNow = latest ? latest.offset - (kidsIn ? latest.kids.filter((k) => Number.isFinite(k)).reduce((a, b) => a + b, 0) : 0) : pt.offset;
  const growth = started ? offsetNow - st.offset0 : 0;
  const fromStart = v.now.paidMonth - v.original.paidMonth;
  const recent = checkIns.filter((c) => c.month >= st.start).slice(-4).reverse();

  return (
    <>
      <div className="lp-dash-head">
        <span className="muted">Today, {monthName(today)}. Your loan on <button className="link" onClick={() => setParams({ tab: 'plans' })}>{plan.name}</button>.</span>
        <div className="lp-actions">
          <button className="btn" onClick={() => setParams({ tab: 'record', mode: 'balances' })}>Check in balances</button>
          <button className="btn primary" onClick={() => setParams({ tab: 'record' })}>Record a change</button>
        </div>
      </div>
      {!started && <p className="lp-notice">Your loan starts in {monthName(st.start)}. Until then everything here follows {plan.name}; once repayments begin, check in your statement balances each month to see how you're really doing.</p>}
      <div className="prop-top">
        <section className="panel prop-hero" aria-labelledby="payoff">
          <div className="panel-head"><h2 id="payoff">{p.use === 'home' ? 'Home loan' : 'Loan'}</h2>{status && <span className={`chip-st st-text-${status.word === 'behind' ? 'warn' : 'good'}`}><i aria-hidden />{status.word === 'on' ? 'On track' : status.word === 'ahead' ? 'Ahead of plan' : 'Behind plan'}</span>}</div>
          <span className="muted">{latest ? 'On your real balances, paid off' : 'On this plan, paid off'}</span>
          <strong className="prop-big">{idxName(v.now.paidIdx)}</strong>
          <span className="muted">{latest
            ? (status?.word === 'on' ? 'Right where the plan expected at your last check-in.' : `${money(Math.abs(status?.diff ?? 0))} ${(status?.diff ?? 0) > 0 ? 'ahead of' : 'behind'} the plan at ${monthName(latest.month)}.`)
            : started ? 'Check in your balances to see how you are really doing.' : `${yrs(v.now.paidMonth)} of repayments from ${monthName(st.start)}.`}</span>
          {fromStart !== 0 && <p className="lp-since"><span className="muted">When you started</span> <b>{idxName(v.original.paidIdx)}</b> → <span className="muted">now</span> <b>{idxName(v.now.paidIdx)}</b> <span className={fromStart < 0 ? 'st-text-good tone' : 'st-text-bad tone'}>{yrs(Math.abs(fromStart))} {fromStart < 0 ? 'sooner' : 'later'}</span></p>}
          <div className="progress" role="img" aria-label={`${pct(cancelled)} of the loan cancelled`}><span style={{ width: `${cancelled * 100}%` }} /></div>
          <div className="progress-labels muted small"><span>{pct(cancelled)} of {money(st.loan)} cancelled</span><span>{money(net)} owed after the offset</span></div>
        </section>
        <MoneyThisMonth v={v} at={at} />
      </div>

      <section className="panel" aria-labelledby="saves">
        <div className="panel-head"><h2 id="saves">What your approach saves</h2><span className="muted small">Against paying only the bank's minimum for {st.term} years</span></div>
        <div className="stat-row prop-stats">
          <div><span>Time saved</span><b className="is-good">{yrs(timeSaved)}</b><small>Paid off {idxName(v.now.paidIdx)}, not {idxName(v.bank.paidIdx)}</small></div>
          <div><span>Interest saved</span><b className="is-good">{money(interestSaved)}</b><small>{money(v.now.totalInterest)} instead of {money(v.bank.totalInterest)}</small></div>
          <div><span>Interest avoided so far</span><b>{money(avoided)}</b><small>{started ? `Cancelled by the offset, ${monthName(st.start)} to ${monthName(latest?.month ?? at)}` : 'Starts with your first repayment'}</small></div>
          <div><span>Offset growth</span><b>{money(growth)}</b><small>{started ? `Since settlement, ${latest ? 'from your balances' : 'on plan'}` : `Starts at ${money(st.offset0)}`}</small></div>
        </div>
      </section>

      <LoanChart v={v} p={p} plan={plan} checkIns={checkIns} today={today} kidsInOffset={kidsIn} />

      <div className="prop-grid">
        <ComingUp p={p} v={v} />
        <section className="panel" aria-labelledby="bal">
          <div className="panel-head"><h2 id="bal">Your balances</h2><button className="link" onClick={() => setParams({ tab: 'record', mode: 'balances' })}>Check in</button></div>
          {!recent.length ? <p className="muted small">{started ? 'No check-ins yet. Add your statement balances to see how you are really doing.' : 'Check-ins open after the first repayment.'}</p> : (
            <ul className="timeline">{recent.map((c) => { const d = expectedAt(data, p, plan, c.month, offsetStart).net - checkInNet(c, kidsIn); return (
              <li key={c.month}><b>{monthName(c.month)}</b><span className={Math.abs(d) < 50 ? '' : d > 0 ? 'st-text-good tone' : 'st-text-bad tone'}>{Math.abs(d) < 50 ? 'On plan' : `${money(Math.abs(d))} ${d > 0 ? 'ahead' : 'behind'}`}</span></li>
            ); })}</ul>
          )}
        </section>
      </div>
      <YearByYear v={v} kids={(data.settings.uniFunds ?? []).length > 0} />
    </>
  );
}

function MoneyThisMonth({ v, at }: { v: LoanView; at: string }) {
  const pt = pointIn(v.now, at)!;
  const take = Math.max(1, pt.takeHome);
  const rows = [
    { label: 'Loan repayment', value: pt.paidOut, cls: 'k-loan' },
    { label: v.inputs.rentUntil && at <= v.inputs.rentUntil ? 'Living, rent and property costs' : 'Living and property costs', value: pt.living, cls: 'k-living' },
    { label: 'Uni funds', value: pt.kidsSaving, cls: 'k-uni' },
    { label: 'Into the offset', value: pt.extra, cls: 'k-extra' },
  ];
  const short = pt.spare < 0;
  const oneIncome = v.inputs.setup.inc1 - pt.paidOut - pt.living;
  const monthly = pt.paidOut + pt.living;
  const cover = monthly ? (pt.offset + pt.kids.reduce((a, b) => a + b, 0)) / monthly : 0;
  return (
    <section className="panel" aria-labelledby="money-month">
      <div className="panel-head"><h2 id="money-month">Money in {monthName(at)}</h2><span className={`small strong st-text-${short ? 'bad' : 'good'} tone`}>{short ? `${money(-pt.spare)} short` : pt.unallocated > 0 ? `${money(pt.unallocated)} not allocated` : `${money(pt.extra)} into the offset`}</span></div>
      <div className="stack-bar" role="img" aria-label="How take-home pay is split this month">
        {rows.map((r) => <span key={r.label} className={r.cls} style={{ width: `${Math.max(0, (r.value / take) * 100).toFixed(1)}%` }} />)}
      </div>
      <dl className="money-rows">
        <div><dt>Take-home pay</dt><dd>{money(pt.takeHome)}</dd></div>
        {rows.map((r) => <div key={r.label}><dt><i className={`key-dot ${r.cls}`} aria-hidden />{r.label}</dt><dd>{money(r.value)}</dd></div>)}
        {short && <div><dt>Taken from the offset</dt><dd className="st-text-bad">{money(pt.drawn)}</dd></div>}
        {!short && pt.unallocated > 0 && <div><dt>Not allocated</dt><dd>{money(pt.unallocated)}</dd></div>}
      </dl>
      <p className="fine">On the larger pay alone you'd be {oneIncome < 0 ? `${money(-oneIncome)} short` : `${money(oneIncome)} ahead`} each month. The offset would cover {cover.toFixed(1)} months of repayments and living costs.{!short && pt.unallocated > 0 ? ' Money not allocated stays wherever it lands and isn\'t counted as going into the offset: give it a job in the plan (extra into the offset, or all spare money).' : ''}</p>
    </section>
  );
}

function ComingUp({ p, v }: { p: Property; v: LoanView }) {
  const { data } = useStore();
  const today = thisMonth();
  const end = addMonths(today, 24);
  const ev: { month: string; text: string }[] = [];
  if (monthOf(p.settlement) >= today) ev.push({ month: monthOf(p.settlement), text: `Settlement on ${longDate(p.settlement)}` });
  if (v.inputs.setup.start >= today) ev.push({ month: v.inputs.setup.start, text: `First repayment, about ${money(repaymentOf(p.loan!))}` });
  if (v.inputs.rentUntil) ev.push({ month: addMonths(v.inputs.rentUntil, 1), text: 'Rent stops: the lease has ended' });
  const plan = activePlanOf(p);
  for (const c of [...(p.loan?.changes ?? []), ...plan.changes]) if (c.month > today) ev.push({ month: c.month, text: describeChange(c, v.inputs.earners) });
  for (const l of [...(p.loan?.lumps ?? []), ...plan.lumps]) if (l.month > today) ev.push({ month: l.month, text: `${money(l.amount)} into the offset` });
  for (const f of data.settings.uniFunds ?? []) ev.push({ month: `${f.year}-02`, text: `${f.name} starts uni` });
  const shown = ev.filter((e) => e.month <= end).sort((a, b) => a.month.localeCompare(b.month));
  return (
    <section className="panel" aria-labelledby="coming">
      <h2 id="coming">Coming up</h2>
      {shown.length ? <ul className="timeline">{shown.map((e, i) => <li key={i}><b>{monthName(e.month)}</b><span>{e.text}</span></li>)}</ul> : <p className="muted">Nothing changes in the next two years.</p>}
    </section>
  );
}

function YearByYear({ v, kids }: { v: LoanView; kids: boolean }) {
  const rows = useMemo(() => yearRows(v.now), [v.now]);
  return (
    <details className="panel year-table">
      <summary><h2>Year by year</h2><span className="muted small">Balances at the end of each year</span></summary>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Year by year (table)">
        <table className="score">
          <thead><tr><th>Year</th><th>Rate</th><th>Repayment</th><th>Loan</th><th>Offset</th><th>Owed after offset</th>{kids && <th>Uni funds</th>}<th>Interest that year</th></tr></thead>
          <tbody>{rows.map(({ year, point, interest }) => (
            <tr key={year}><th scope="row">{year}</th><td>{point.rate.toFixed(2)}%</td><td>{money(point.paidOut || point.repayment)}</td><td>{money(point.loan)}</td><td>{money(point.offset)}</td>
              <td>{point.net <= 0 ? 'Paid off' : money(point.net)}</td>{kids && <td>{money(point.kids.reduce((a, b) => a + b, 0))}</td>}<td>{money(interest)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

/* ---------------- Buying: price, dates, costs, and cash either side of settlement ---------------- */

function Buying({ p, set }: { p: Property; set: (x: Partial<Property>) => void }) {
  const { data, updateSettings } = useStore();
  const { f, st } = useForecast();
  const accounts = data.settings.accounts.filter((a) => a.type !== 'loan' && a.type !== 'card');
  const setCost = (id: string, patch: Partial<PropertyCost>) => set({ costs: p.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const total = p.costs.reduce((a, c) => a + c.amount, 0);
  const today = todayLocal();
  const paid = p.costs.filter((c) => c.date <= today).reduce((a, c) => a + c.amount, 0);
  const settle = st.settlements.find((x) => x.property === p.name);
  return (
    <>
      <section className="panel">
        <div className="field-grid">
          <label>Name<input defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && set({ name: e.target.value.trim() })} /></label>
          <label>Price<NumberField label="Price" value={p.price} onSave={(n) => set({ price: n })} /></label>
          <label>Contract signed<input type="date" value={p.contractDate ?? ''} onChange={(e) => set({ contractDate: e.target.value })} /></label>
          <label>Settlement<input type="date" value={p.settlement} onChange={(e) => e.target.value && set({ settlement: e.target.value })} /></label>
          <label>Worth today<NumberField label="Worth today" value={p.value ?? p.price} onSave={(n) => set({ value: n })} /></label>
          {p.use === 'home' && <label>Our current lease ends<input type="date" value={data.settings.home.leaseEnds} onChange={(e) => updateSettings({ home: { ...data.settings.home, leaseEnds: e.target.value } })} /></label>}
        </div>
      </section>

      <section className="panel" aria-labelledby="costs">
        <div className="panel-head"><h2 id="costs">Buying costs</h2><span className="muted small">{money(total)} in all, {money(paid)} paid so far</span></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Buying costs (table)">
          <table className="score edit-table">
            <thead><tr><th>What</th><th>Amount</th><th>Paid or due</th><th className="hide-sm">From <Info>Pick the account it comes out of, if you know it. Once that account's balance is read after this date, the forecast knows it's already gone.</Info></th><th /></tr></thead>
            <tbody>
              {p.costs.map((c) => (
                <tr key={c.id}>
                  <td><input aria-label="What" defaultValue={c.label} onBlur={(e) => e.target.value !== c.label && setCost(c.id, { label: e.target.value })} /></td>
                  <td><NumberField label={`${c.label} amount`} value={c.amount} onSave={(n) => setCost(c.id, { amount: n })} /></td>
                  <td><input type="date" aria-label={`${c.label} date`} value={c.date} onChange={(e) => e.target.value && setCost(c.id, { date: e.target.value })} /></td>
                  <td className="hide-sm"><select aria-label={`${c.label} comes from`} value={c.account ?? ''} onChange={(e) => setCost(c.id, { account: e.target.value || undefined })}><option value="">Not sure</option>{accounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></td>
                  <td><button className="icon-btn" aria-label={`Remove ${c.label}`} onClick={() => set({ costs: p.costs.filter((x) => x.id !== c.id) })}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn small" onClick={() => set({ costs: [...p.costs, { id: newId(), label: 'New cost', amount: 0, date: p.settlement }] })}><Plus size={14} aria-hidden /> Add a cost</button>
        <p className="fine">Your conveyancer's settlement statement, about two weeks before, gives the exact amount to pay. Replace the estimates with it then.</p>
      </section>

      {f.months.length > 0 && (
        <section className="panel" aria-labelledby="cash-path">
          <div className="panel-head"><h2 id="cash-path">Cash either side of settlement</h2><Link to="/check-in?step=m-ahead">In the money meeting</Link></div>
          {settle && <div className="stat-row"><div><span>Before settlement</span><b>{money(settle.before)}</b></div><div><span>Buying costs then</span><b>{money(settle.paid)}</b></div><div><span>After</span><b>{money(settle.after)}</b></div>{st.low && <div><span>Lowest</span><b>{money(st.low.cash)}</b><small>{monthName(st.low.month)}, {st.cover.toFixed(1)} months of spending</small></div>}</div>}
          <CashChart />
        </section>
      )}
    </>
  );
}

/** Cash month by month from the latest bank balances, with settlements marked. Shared by Property, Home and the money meeting. */
export function CashChart({ height = 200, basis = 'recent' }: { height?: number; basis?: Basis }) {
  const { f, st } = useForecast(basis);
  const ms = f.months;
  if (!ms.length) return null;
  return (
    <Chart label="Cash forecast by month" kind="lines" months={ms.map((x) => x.month)} range="all" noRange height={height}
      marks={st.settlements.map((x) => ({ month: x.month, label: 'Settlement' }))}
      series={[{ id: 'cash', label: 'Cash', values: ms.map((x) => x.cash), color: 'var(--data)' }]}
      tipExtra={(m) => { const x = ms.find((y) => y.month === m)!; return [
        { label: 'Pay in', value: money(x.pay + x.rentIn) }, { label: 'Going out', value: money(outgoings(x)) },
        ...x.oneOffs.map((o) => ({ label: o.label.replace(/ \(.*\)$/, ''), value: money(-o.amount) })),
        ...x.timed.map((t) => ({ label: `incl. ${t.label}`, value: money(t.amount) })),
        { label: x.kept >= 0 ? 'Kept' : 'From savings', value: money(Math.abs(x.kept)) },
      ]; }} />
  );
}

/* ---------------- Costs & rent ---------------- */

function CostsTab({ p, set }: { p: Property; set: (x: Partial<Property>) => void }) {
  const setRun = (id: string, patch: Partial<RunningCost>) => set({ running: p.running.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const month = thisMonth() > monthOf(p.settlement) ? thisMonth() : monthOf(p.settlement);
  const rent = rentIn(p, month);
  return (
    <>
      <section className="panel" aria-labelledby="running">
        <div className="panel-head"><h2 id="running">Running costs</h2><span className="muted small">About {money(runningMonthly(p))} a month{ownedIn(p, thisMonth()) ? '' : ', from settlement'}</span></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Running costs (table)">
          <table className="score edit-table">
            <thead><tr><th>What</th><th>Amount</th><th>How often</th><th>A month</th><th /></tr></thead>
            <tbody>{p.running.map((c) => (
              <tr key={c.id}>
                <td><input aria-label="What" defaultValue={c.label} onBlur={(e) => e.target.value !== c.label && setRun(c.id, { label: e.target.value })} /></td>
                <td><NumberField label={`${c.label} amount`} value={c.amount} onSave={(n) => setRun(c.id, { amount: n })} /></td>
                <td><select aria-label={`${c.label} how often`} value={c.every} onChange={(e) => setRun(c.id, { every: e.target.value as Every })}>{EVERY.map((x) => <option key={x} value={x}>Each {x}</option>)}</select></td>
                <td>{money(c.amount * PER_MONTH[c.every])}</td>
                <td><button className="icon-btn" aria-label={`Remove ${c.label}`} onClick={() => set({ running: p.running.filter((x) => x.id !== c.id) })}><Trash2 size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <button className="btn small" onClick={() => set({ running: [...p.running, { id: newId(), label: 'New cost', amount: 0, every: 'month' }] })}><Plus size={14} aria-hidden /> Add a cost</button>
        <p className="fine">These count in the forecast and the loan from settlement. Payments in the bank for {p.use === 'home' ? 'rates, water and home insurance' : 'this property'} aren't counted twice.</p>
      </section>
      {p.use === 'investment' && (
        <section className="panel" aria-labelledby="rent">
          <h2 id="rent">Rent received</h2>
          <div className="field-grid">
            <label>Rent a week<NumberField label="Rent a week" value={p.rent?.weekly ?? 0} onSave={(n) => set({ rent: { from: p.settlement, ...p.rent, weekly: n } })} /></label>
            <label>From<input type="date" value={p.rent?.from ?? p.settlement} onChange={(e) => set({ rent: { weekly: 0, ...p.rent, from: e.target.value } })} /></label>
            <label>Weeks empty a year<NumberField label="Weeks empty a year" prefix="" value={p.rent?.emptyWeeks ?? 2} onSave={(n) => set({ rent: { weekly: 0, from: p.settlement, ...p.rent, emptyWeeks: n } })} /></label>
          </div>
          <p>About <b>{money(rent)}</b> a month after empty weeks{p.value ? <>, a gross yield of <b>{pct(((p.rent?.weekly ?? 0) * 52) / (p.value ?? p.price))}</b></> : null}. After running costs and the repayment: <b>{money(rent - runningMonthly(p) - (p.loan ? repaymentOf(p.loan) : 0))}</b> a month.</p>
        </section>
      )}
    </>
  );
}

/* ---------------- Adding a property ---------------- */

function AddProperty({ onClose }: { onClose: () => void }) {
  const { add } = useProperties();
  const nav = useNavigate();
  const [use, setUse] = useState<'home' | 'investment'>('investment');
  const [f, setF] = useState({ name: '', price: '', settlement: '', deposit: '', depositDate: '', loan: '', rate: '', term: '30', rent: '' });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim() && Number(f.price) > 0 && f.settlement;
  const create = async () => {
    const id = f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || newId();
    const settle = monthOf(f.settlement);
    const costs: PropertyCost[] = [
      ...(Number(f.deposit) ? [{ id: 'deposit', label: 'Deposit', amount: Number(f.deposit), date: f.depositDate || f.settlement }] : []),
      { id: 'stamp-duty', label: 'Stamp duty', amount: 0, date: f.settlement },
      { id: 'fees', label: 'Legal and registration', amount: 0, date: f.settlement },
    ];
    const running: RunningCost[] = use === 'home'
      ? [{ id: 'council-rates', label: 'Council rates', amount: 0, every: 'year' }, { id: 'water', label: 'Water', amount: 0, every: 'quarter' }, { id: 'home-insurance', label: 'Home insurance', amount: 0, every: 'year' }]
      : [{ id: 'rates', label: 'Council rates', amount: 0, every: 'year' }, { id: 'water', label: 'Water', amount: 0, every: 'quarter' }, { id: 'insurance', label: 'Landlord insurance', amount: 0, every: 'year' },
        { id: 'agent', label: 'Agent fees', amount: 0, every: 'month' }, { id: 'repairs', label: 'Repairs and upkeep', amount: 0, every: 'year' }];
    const p: Property = {
      id, name: f.name.trim(), use, price: Number(f.price), settlement: f.settlement, value: Number(f.price), costs, running,
      ...(Number(f.loan) ? { loan: { amount: Number(f.loan), rate: Number(f.rate) || 6, term: Number(f.term) || 30, firstRepayment: addMonths(settle, 1), sweep: use === 'home', changes: [], lumps: [] } } : {}),
      ...(use === 'investment' && Number(f.rent) ? { rent: { weekly: Number(f.rent), from: f.settlement, emptyWeeks: 2 } } : {}),
    };
    await add(p);
    onClose();
    nav(`/property/${id}?tab=buying`);
  };
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="add-prop" onClick={onClose}>
      <FocusTrap onClose={onClose} />
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2 id="add-prop">Add a property</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <Tabs value={use} onChange={setUse} items={[{ id: 'home', label: 'Our home' }, { id: 'investment', label: 'Investment' }]} />
        <div className="field-grid">
          <label>Name<input value={f.name} onChange={up('name')} placeholder="e.g. the street name" /></label>
          <label>Price<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={f.price} onChange={up('price')} /></span></label>
          <label>Settlement<input type="date" value={f.settlement} onChange={up('settlement')} /></label>
          <label>Deposit<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={f.deposit} onChange={up('deposit')} /></span></label>
          <label>Deposit paid on<input type="date" value={f.depositDate} onChange={up('depositDate')} /></label>
          <label>Loan<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={f.loan} onChange={up('loan')} /></span></label>
          <label>Interest rate %<input inputMode="decimal" value={f.rate} onChange={up('rate')} /></label>
          <label>Years<input inputMode="numeric" value={f.term} onChange={up('term')} /></label>
          {use === 'investment' && <label>Rent a week<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={f.rent} onChange={up('rent')} /></span></label>}
        </div>
        <p className="fine">Next you'll fill in stamp duty, fees and running costs. {use === 'investment' ? 'It gets its own area of categories, so its bills stay apart from the family spending.' : ''}</p>
        <button className="btn primary" disabled={!ok} onClick={create}>Add {f.name.trim() || 'the property'}</button>
      </div>
    </div>
  );
}
