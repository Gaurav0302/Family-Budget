import { Building2, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Info, NumberField, PageHeader, Tabs } from '../components/bits';
import { Chart } from '../components/Chart';
import { addMonths, monthOf } from '../data/analysis';
import { outgoings, type Basis } from '../data/forecast';
import { ownedIn, pointIn, rentIn, repaymentOf, runLoan, runningMonthly, toIdx, toYM, type LoanView } from '../data/property';
import { useStore } from '../data/store';
import type { Every, Property, PropertyCost, PropertyLoan, RunningCost } from '../data/types';
import { offsetAtStart, useForecast, useLoan, useProperties } from '../data/useProperties';
import { yearRows, type Change, type Lump } from '../loan';
import { longDate, money, monthName, pct, thisMonth } from '../lib/format';
import { PER_MONTH } from '../data/wealth';

type Tab = 'overview' | 'buying' | 'loan' | 'costs' | 'scenarios';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'buying', label: 'Buying' }, { id: 'loan', label: 'Loan' },
  { id: 'costs', label: 'Costs & rent' }, { id: 'scenarios', label: 'Scenarios' },
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
  const owned = p.settlement <= new Date().toISOString().slice(0, 10);
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
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={TABS} />
      <div className="prop-body">
        {tab === 'overview' && <Overview p={p} />}
        {tab === 'buying' && <Buying p={p} set={set} />}
        {tab === 'loan' && <LoanTab p={p} set={set} />}
        {tab === 'costs' && <CostsTab p={p} set={set} />}
        {tab === 'scenarios' && <Scenarios p={p} />}
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
  const v = useLoan(p);
  if (!p.loan || !v) return <p className="muted">No loan on this property. Add one on the Loan tab to see when it's paid off.</p>;
  const st = v.inputs.setup;
  const today = thisMonth();
  const started = today >= st.start;
  const at = started ? today : st.start;
  const pt = pointIn(v.now, at)!;
  const bankAt = pointIn(v.bank, at)!;
  const cancelled = pt.loan ? Math.min(1, (pt.offset + pt.kids.reduce((a, b) => a + b, 0)) / pt.loan) : 1;
  const timeSaved = v.bank.paidMonth - v.now.paidMonth;
  const interestSaved = v.bank.totalInterest - v.now.totalInterest;
  const avoided = started ? v.now.points.filter((x) => x.idx <= toIdx(today)).reduce((a, x) => a + ((v.bank.points[x.m]?.interest ?? 0) - x.interest), 0) : 0;
  const growth = started ? pt.offset - st.offset0 : 0;
  const anchor = v.inputs.anchor;
  const diff = anchor ? (pointIn(v.plan, anchor.month)?.net ?? 0) - (pointIn(v.now, anchor.month)?.net ?? 0) : 0;
  const status = !anchor ? null : Math.abs(diff) < 100 ? 'on' : diff > 0 ? 'ahead' : 'behind';

  // The chart: what's still owed after the offset, what's in the offset, and the bank's schedule for comparison.
  const last = Math.min(v.bank.paidIdx, st.term * 12 + toIdx(st.start)) + 6;
  const months: string[] = [];
  for (let i = toIdx(st.start); i <= last; i++) months.push(toYM(i));
  const val = (r: LoanView['now'], i: number, f: (x: (typeof r.points)[number]) => number) => { const x = r.points[i]; return x ? f(x) : 0; };
  const marks = [{ month: today, label: 'Today' }, ...(v.inputs.rentUntil ? [{ month: addMonths(v.inputs.rentUntil, 1), label: 'Rent stops' }] : [])].filter((m) => m.month >= st.start);

  return (
    <>
      <div className="prop-top">
        <section className="panel prop-hero" aria-labelledby="payoff">
          <div className="panel-head"><h2 id="payoff">{p.use === 'home' ? 'Home loan' : 'Loan'}</h2>{status && <span className={`chip-st st-text-${status === 'behind' ? 'warn' : 'good'}`}><i aria-hidden />{status === 'on' ? 'On plan' : status === 'ahead' ? 'Ahead of plan' : 'Behind plan'}</span>}</div>
          <span className="muted">{anchor ? 'On your real balances, paid off' : 'At this rate, paid off'}</span>
          <strong className="prop-big">{idxName(v.now.paidIdx)}</strong>
          <span className="muted">{anchor
            ? `${money(Math.abs(diff))} ${diff >= 0 ? 'ahead of' : 'behind'} the plan at ${monthName(anchor.month)}.`
            : `${yrs(v.now.paidMonth)} of repayments from ${monthName(st.start)}, with everything left over going into the offset.`}</span>
          <div className="progress" role="img" aria-label={`${pct(cancelled)} of the loan cancelled by the offset`}><span style={{ width: `${cancelled * 100}%` }} /></div>
          <div className="progress-labels muted small"><span>{pct(cancelled)} of {money(pt.loan)} cancelled by the offset</span><span>{money(pt.net)} owed after the offset</span></div>
        </section>
        <MoneyThisMonth v={v} at={at} />
      </div>

      <section className="panel" aria-labelledby="saves">
        <div className="panel-head"><h2 id="saves">What your approach saves</h2><span className="muted small">Against paying only the bank's minimum for {st.term} years</span></div>
        <div className="stat-row prop-stats">
          <div><span>Time saved</span><b className="is-good">{yrs(timeSaved)}</b><small>Paid off {idxName(v.now.paidIdx)}, not {idxName(v.bank.paidIdx)}</small></div>
          <div><span>Interest saved</span><b className="is-good">{money(interestSaved)}</b><small>{money(v.now.totalInterest)} instead of {money(v.bank.totalInterest)}</small></div>
          <div><span>Interest avoided so far</span><b>{money(avoided)}</b><small>{started ? `Since ${monthName(st.start)}` : 'Starts with the first repayment'}</small></div>
          <div><span>Offset growth</span><b>{money(growth)}</b><small>{started ? `Since ${monthName(st.start)}` : `Starts at ${money(st.offset0)}`}</small></div>
        </div>
      </section>

      <section className="panel" aria-labelledby="loan-chart">
        <Chart title={<h2 id="loan-chart">The loan over time</h2>} label="Loan, offset and bank's schedule by month" kind="lines" months={months} range="all" noRange height={240} marks={marks}
          series={[
            { id: 'net', label: 'Owed after the offset', values: months.map((_, i) => val(v.now, i, (x) => x.net)), color: 'var(--s1)' },
            { id: 'off', label: 'In the offset', values: months.map((_, i) => val(v.now, i, (x) => (x.net > 0 ? x.offset + x.kids.reduce((a, b) => a + b, 0) : 0))), color: 'var(--s2)' },
            { id: 'bank', label: "Bank's schedule", values: months.map((_, i) => val(v.bank, i, (x) => x.loan)), color: 'var(--ink-2)', dashed: true },
          ]} />
        <p className="fine">Living costs come from your last three complete months ({money(v.inputs.setup.living)} a month, with property costs). Change them in Scenarios to see the effect.</p>
      </section>

      <div className="prop-grid">
        <ComingUp p={p} v={v} />
        <section className="panel" aria-labelledby="bank-now">
          <h2 id="bank-now">The bank's minimum</h2>
          <p>Repayment of <b>{money(pt.repayment || repaymentOf(p.loan))}</b> a month at {pt.rate}%. Paying only that, the loan would still be <b>{money(bankAt.loan)}</b> in {monthName(at)} and finish in {idxName(v.bank.paidIdx)}.</p>
          <p className="fine">Record rate changes on the Loan tab: the payoff date moves from that month on.</p>
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
      <div className="panel-head"><h2 id="money-month">Money in {monthName(at)}</h2><span className={`small strong st-text-${short ? 'bad' : 'good'}`}>{short ? `${money(-pt.spare)} short` : `${money(pt.extra)} into the offset`}</span></div>
      <div className="stack-bar" role="img" aria-label="How take-home pay is split this month">
        {rows.map((r) => <span key={r.label} className={r.cls} style={{ width: `${Math.max(0, (r.value / take) * 100).toFixed(1)}%` }} />)}
      </div>
      <dl className="money-rows">
        <div><dt>Take-home pay</dt><dd>{money(pt.takeHome)}</dd></div>
        {rows.map((r) => <div key={r.label}><dt><i className={`key-dot ${r.cls}`} aria-hidden />{r.label}</dt><dd>{money(r.value)}</dd></div>)}
        {short && <div><dt>Taken from the offset</dt><dd className="st-text-bad">{money(pt.drawn)}</dd></div>}
      </dl>
      <p className="fine">On the larger pay alone you'd be {oneIncome < 0 ? `${money(-oneIncome)} short` : `${money(oneIncome)} ahead`} each month. The offset would cover {cover.toFixed(1)} months of repayments and living costs.</p>
    </section>
  );
}

function ComingUp({ p, v }: { p: Property; v: LoanView }) {
  const { data } = useStore();
  const today = thisMonth();
  const end = addMonths(today, 36);
  const ev: { month: string; text: string }[] = [];
  if (monthOf(p.settlement) >= today) ev.push({ month: monthOf(p.settlement), text: `Settlement on ${longDate(p.settlement)}` });
  if (v.inputs.setup.start >= today) ev.push({ month: v.inputs.setup.start, text: `First repayment, about ${money(repaymentOf(p.loan!))}` });
  if (v.inputs.rentUntil) ev.push({ month: addMonths(v.inputs.rentUntil, 1), text: 'Rent stops: the lease has ended' });
  for (const c of p.loan?.changes ?? []) if (c.month >= today) ev.push({ month: c.month, text: c.type === 'rate' ? `Rate ${c.value}%${c.repayment ? `, repayment ${money(c.repayment)}` : ''}` : `${c.type} changes to ${money(c.value)}` });
  for (const l of p.loan?.lumps ?? []) if (l.month >= today) ev.push({ month: l.month, text: `${money(l.amount)} into the offset` });
  for (const f of data.settings.uniFunds ?? []) ev.push({ month: `${f.year}-02`, text: `${f.name} starts uni` });
  const shown = ev.filter((e) => e.month <= end).sort((a, b) => a.month.localeCompare(b.month));
  return (
    <section className="panel" aria-labelledby="coming">
      <h2 id="coming">Coming up</h2>
      {shown.length ? <ul className="timeline">{shown.map((e, i) => <li key={i}><b>{monthName(e.month)}</b><span>{e.text}</span></li>)}</ul> : <p className="muted">Nothing changes in the next three years.</p>}
    </section>
  );
}

function YearByYear({ v, kids }: { v: LoanView; kids: boolean }) {
  const rows = useMemo(() => yearRows(v.now), [v.now]);
  return (
    <details className="panel year-table">
      <summary><h2>Year by year</h2><span className="muted small">Balances at the end of each year</span></summary>
      <div className="table-wrap">
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
  const today = new Date().toISOString().slice(0, 10);
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
        <div className="table-wrap">
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
          <div className="panel-head"><h2 id="cash-path">Cash either side of settlement</h2><Link to="/reports?step=m-ahead">In the money meeting</Link></div>
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

/* ---------------- Loan: details and what happened to it ---------------- */

function LoanTab({ p, set }: { p: Property; set: (x: Partial<Property>) => void }) {
  const { data } = useStore();
  const l: PropertyLoan = p.loan ?? { amount: 0, rate: 0, term: 30, firstRepayment: monthOf(p.settlement), changes: [], lumps: [] };
  const setLoan = (patch: Partial<PropertyLoan>) => set({ loan: { ...l, ...patch } });
  const v = useLoan(p);
  const accounts = data.settings.accounts;
  const [kind, setKind] = useState<'rate' | 'lump'>('rate');
  const [month, setMonth] = useState(thisMonth() > l.firstRepayment ? thisMonth() : l.firstRepayment);
  const [value, setValue] = useState('');
  const [bankRepay, setBankRepay] = useState('');
  const [keep, setKeep] = useState(false);
  const events = [...(l.changes ?? []).map((c) => ({ ...c, kind: 'change' as const })), ...(l.lumps ?? []).map((x) => ({ ...x, kind: 'lump' as const }))].sort((a, b) => a.month.localeCompare(b.month));
  const record = () => {
    const n = Number(value);
    if (!n || !month) return;
    if (kind === 'lump') setLoan({ lumps: [...(l.lumps ?? []), { id: newId(), month, amount: n }] });
    else {
      const before = v ? (pointIn(v.now, addMonths(month, -1))?.paidOut ?? repaymentOf(l)) : repaymentOf(l);
      setLoan({ changes: [...(l.changes ?? []), { id: newId(), month, type: 'rate', value: n, ...(bankRepay ? { repayment: Number(bankRepay) } : {}), ...(keep ? { keepPaying: Math.round(before) } : {}) }] });
    }
    setValue(''); setBankRepay(''); setKeep(false);
  };
  return (
    <>
      <section className="panel">
        <div className="field-grid">
          <label>Loan amount<NumberField label="Loan amount" value={l.amount} onSave={(n) => setLoan({ amount: n })} /></label>
          <label>Interest rate<NumberField label="Interest rate" prefix="" suffix="%" value={l.rate} onSave={(n) => setLoan({ rate: n })} /></label>
          <label>Years<NumberField label="Years" prefix="" value={l.term} onSave={(n) => setLoan({ term: Math.max(1, Math.round(n)) })} /></label>
          <label>First repayment<input type="month" value={l.firstRepayment} onChange={(e) => e.target.value && setLoan({ firstRepayment: e.target.value })} /></label>
          <label>Bank's repayment<NumberField label="Bank's monthly repayment" value={l.repayment ?? Math.round(repaymentOf({ ...l, repayment: undefined }))} onSave={(n) => setLoan({ repayment: n || undefined })} /></label>
          <label>In the offset on day one<NumberField label="Offset on day one" value={l.offsetStart ?? 0} onSave={(n) => setLoan({ offsetStart: n || undefined })} /><small className="muted">{l.offsetStart ? '' : 'Blank: what the forecast leaves after settlement'}</small></label>
          <label>Loan account<select value={l.loanAccount ?? ''} onChange={(e) => setLoan({ loanAccount: e.target.value || undefined })}><option value="">Not added yet</option>{accounts.filter((a) => a.type === 'loan').map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
          <label>Offset account<select value={l.offsetAccount ?? ''} onChange={(e) => setLoan({ offsetAccount: e.target.value || undefined })}><option value="">Not added yet</option>{accounts.filter((a) => a.type === 'offset' || a.type === 'savings').map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
        </div>
        <label className="check"><input type="checkbox" checked={l.sweep ?? true} onChange={(e) => setLoan({ sweep: e.target.checked })} /><span>Everything left over each month goes into the offset</span></label>
        {l.sweep === false && <label className="inline-label">Fixed extra into the offset each month <NumberField label="Extra each month" value={l.extra ?? 0} onSave={(n) => setLoan({ extra: n })} /></label>}
        <p className="fine">Once the loan and offset accounts are added and their statements are in, the payoff date uses your real balances. <Link to="/accounts">Accounts</Link></p>
      </section>

      <section className="panel" aria-labelledby="happened">
        <div className="panel-head"><h2 id="happened">What happened to the loan</h2><Info>Rate changes and lump sums count from their month on; earlier months stay as they were.</Info></div>
        {events.length ? (
          <ul className="event-list">
            {events.map((e) => (
              <li key={e.id}><b>{monthName(e.month)}</b>
                <span>{e.kind === 'lump' ? `${money(e.amount)} into the offset` : (e as Change).type === 'rate' ? `Rate to ${(e as Change).value}%${(e as Change).repayment ? `, bank set the repayment to ${money((e as Change).repayment!)}` : ''}${(e as Change).keepPaying ? `, we kept paying ${money((e as Change).keepPaying!)}` : ''}` : `${(e as Change).type} to ${(e as Change).value}`}</span>
                <button className="icon-btn" aria-label="Remove" onClick={() => e.kind === 'lump' ? setLoan({ lumps: (l.lumps ?? []).filter((x) => x.id !== e.id) }) : setLoan({ changes: (l.changes ?? []).filter((x) => x.id !== e.id) })}><Trash2 size={15} /></button></li>
            ))}
          </ul>
        ) : <p className="muted">Nothing recorded yet.</p>}
        <form className="record-form" onSubmit={(e) => { e.preventDefault(); record(); }}>
          <select aria-label="What happened" value={kind} onChange={(e) => setKind(e.target.value as 'rate' | 'lump')}><option value="rate">The rate changed</option><option value="lump">A lump sum into the offset</option></select>
          <input type="month" aria-label="From" value={month} onChange={(e) => setMonth(e.target.value)} />
          <span className="money-input">{kind === 'lump' && <span aria-hidden>$</span>}<input inputMode="decimal" aria-label={kind === 'rate' ? 'New rate' : 'Amount'} placeholder={kind === 'rate' ? 'New rate %' : 'Amount'} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} /></span>
          {kind === 'rate' && <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" aria-label="Repayment the bank set" placeholder="Bank's repayment (if told)" value={bankRepay} onChange={(e) => setBankRepay(e.target.value.replace(/[^\d.]/g, ''))} /></span>}
          {kind === 'rate' && <label className="check small"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span>We keep paying the old amount</span></label>}
          <button className="btn small">Record</button>
        </form>
      </section>
    </>
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
        <div className="table-wrap">
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

/* ---------------- Scenarios: what one change does ---------------- */

function Scenarios({ p }: { p: Property }) {
  const { data } = useStore();
  const { f, st } = useForecast();
  const base = useLoan(p);
  const [extra, setExtra] = useState(0);
  const [rate, setRate] = useState(0);
  const [lump, setLump] = useState(0);
  if (!base || !p.loan) return <p className="muted">Add the loan first.</p>;
  const s = base.inputs.setup;
  const offsetStart = offsetAtStart(data, p, st, f.start.cash);
  const from = thisMonth() > s.start ? addMonths(thisMonth(), 1) : s.start;
  const july = `${Number(from.slice(0, 4)) + (from.slice(5) > '07' ? 1 : 0)}-07`;
  const run = (changes: Change[] = [], lumps: Lump[] = []) => runLoan(data, p, { offsetStart, changes, lumps })!;
  const livingChange = (d: number): Change[] => [{ id: 'x', month: from, type: 'living', value: s.living + d }];
  const rows: { label: string; v: LoanView }[] = [
    { label: 'Rates rise 1%', v: run([{ id: 'x', month: from, type: 'rate', value: p.loan.rate + 1 }]) },
    { label: 'Rates fall 0.5%', v: run([{ id: 'x', month: from, type: 'rate', value: Math.max(0, p.loan.rate - 0.5) }]) },
    { label: 'Spend $500 a month less', v: run(livingChange(-500)) },
    { label: 'Spend $500 a month more', v: run(livingChange(500)) },
    { label: `One income for a year from ${monthName(july)}`, v: run([{ id: 'x', month: july, until: addMonths(july, 11), type: 'inc2', value: 0 }]) },
    { label: `$10,000 into the offset in ${monthName(july)}`, v: run([], [{ id: 'x', month: july, amount: 10000 }]) },
  ];
  const ru = base.inputs.rentUntil;
  if (ru && ru > from) rows.push({ label: 'The lease ends 2 months early', v: run([{ id: 'x', month: addMonths(ru, -1) > s.start ? addMonths(ru, -1) : s.start, until: ru, type: 'living', value: s.living }]) });
  const own = run([
    ...(rate ? [{ id: 'r', month: from, type: 'rate' as const, value: p.loan.rate + rate }] : []),
    ...(extra ? livingChange(-extra) : []),
  ], lump ? [{ id: 'l', month: from, amount: lump }] : []);
  const delta = (v: LoanView): ReactNode => {
    const d = v.now.paidMonth - base.now.paidMonth;
    const di = v.now.totalInterest - base.now.totalInterest;
    return <><td className={d < 0 ? 'st-text-good' : d > 0 ? 'st-text-bad' : ''}>{d === 0 ? 'No change' : `${yrs(d)} ${d < 0 ? 'sooner' : 'later'}`}</td><td>{Math.abs(di) < 50 ? '–' : `${money(Math.abs(di))} ${di < 0 ? 'less' : 'more'}`}</td></>;
  };
  return (
    <>
      <section className="panel" aria-labelledby="one-change">
        <div className="panel-head"><h2 id="one-change">What one change does</h2><span className="muted small">Now: paid off {idxName(base.now.paidIdx)}</span></div>
        <div className="table-wrap">
          <table className="score">
            <thead><tr><th>If…</th><th>Paid off</th><th>Change</th><th>Interest</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{idxName(r.v.now.paidIdx)}</td>{delta(r.v)}</tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="panel" aria-labelledby="try">
        <h2 id="try">Try your own</h2>
        <div className="field-grid">
          <label>Spend less each month<NumberField label="Spend less each month" value={extra} onSave={setExtra} /></label>
          <label>Rate up or down<NumberField label="Rate change" prefix="" suffix="%" value={rate} onSave={(n) => setRate(n)} /></label>
          <label>Lump sum into the offset<NumberField label="Lump sum" value={lump} onSave={setLump} /></label>
        </div>
        <p className="lead">Paid off <b>{idxName(own.now.paidIdx)}</b>: {(() => { const d = own.now.paidMonth - base.now.paidMonth; return d === 0 ? 'no change' : `${yrs(d)} ${d < 0 ? 'sooner' : 'later'}`; })()}, {money(Math.abs(own.now.totalInterest - base.now.totalInterest))} {own.now.totalInterest <= base.now.totalInterest ? 'less' : 'more'} interest.</p>
        <p className="fine">Rates can only go down so far: a rate change uses the bank's new repayment worked out on the years left.</p>
      </section>
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
