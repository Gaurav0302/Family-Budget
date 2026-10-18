import { Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Info, MonthPicker, PageHeader, Tabs } from '../components/bits';
import { addMonths, allMonths, budgetFor, completeMonths, monthOf, summarise } from '../data/analysis';
import { findBills, manualBills } from '../data/bills';
import { CATEGORY, GROUPS } from '../data/categories';
import { reviewMonth } from '../data/review';
import { useStore } from '../data/store';
import { financialYear, netWorth, payFor, people } from '../data/wealth';
import { dayName, money, monthName, monthOnly, pct } from '../lib/format';

const endOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };

function MoneyMeeting() {
  const { data, updateSettings } = useStore();
  const months = useMemo(() => allMonths(data.transactions), [data.transactions]);
  const complete = useMemo(() => completeMonths(data), [data]);
  const [month, setMonth] = useState(complete.at(-1) ?? months.at(-1) ?? '');
  const [text, setText] = useState('');
  if (!month) return <p className="muted">Add statements first.</p>;
  const r = reviewMonth(data, month);
  const s = r.summary;
  const actions = data.settings.actions ?? [];
  const prev = addMonths(month, -1);
  const lastActions = actions.filter((a) => a.month === prev);
  const nextActions = actions.filter((a) => a.month === month);
  const top = r.findings.filter((f) => f.severity === 'act' || f.severity === 'watch').slice(0, 5);
  const cats = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const nextMonth = addMonths(month, 1);
  const bills = [...findBills(data.transactions, `${nextMonth}-01`), ...manualBills(data.settings.bills ?? [], `${nextMonth}-01`)]
    .filter((b) => monthOf(b.next) === nextMonth).sort((a, b) => a.next.localeCompare(b.next));
  const nwNow = netWorth(data.settings, endOf(month)).total;
  const before = netWorth(data.settings, endOf(prev));
  const nwBefore = before.cash > 0 ? before.total : 0;   // only compare when last month's bank balances are known
  const setActions = (list: typeof actions) => updateSettings({ actions: list });

  return (
    <div className="report">
      <div className="report-tools no-print">
        <MonthPicker months={months} value={month} onChange={setMonth} />
        <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print or save as PDF</button>
      </div>
      <header className="report-head">
        <h2>Money meeting: {monthName(month)}</h2>
        <p>{r.verdict.text}</p>
      </header>
      <div className="stat-row">
        <div><span>Came in</span><b>{money(s.income)}</b></div>
        <div><span>Spent</span><b>{money(s.spend)}</b></div>
        <div><span>Kept</span><b>{money(s.kept)} ({pct(s.keptRate)})</b></div>
        {nwNow !== 0 && <div><span>Net worth</span><b>{money(nwNow)}</b><small>{nwBefore ? `${money(nwNow - nwBefore, { sign: true })} on last month` : ''}</small></div>}
      </div>

      {lastActions.length > 0 && (
        <section className="report-sec">
          <h3>Did we do what we agreed in {monthOnly(prev)}?</h3>
          <ul className="checklist">
            {lastActions.map((a) => (
              <li key={a.id}><label className="check"><input type="checkbox" checked={a.done} onChange={(e) => setActions(actions.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)))} /><span>{a.text}</span></label></li>
            ))}
          </ul>
        </section>
      )}

      <section className="report-sec">
        <h3>What to talk about</h3>
        <ul className="findings">
          {top.map((f) => <li key={f.id}><Badge severity={f.severity} short /><div><strong>{f.title}</strong><p>{f.detail}</p></div></li>)}
        </ul>
      </section>

      <section className="report-sec">
        <h3>Where it went</h3>
        <table className="score compact">
          <thead><tr><th>Category</th><th>Spent</th><th>Budget</th></tr></thead>
          <tbody>{cats.map(([c, v]) => { const b = budgetFor(data.budgets, c, month); return (
            <tr key={c} className={b && v > b * 1.1 ? 'st-over' : ''}><th scope="row">{CATEGORY[c]?.label ?? c}</th><td>{money(v)}</td><td>{b ? money(b) : '–'}</td></tr>); })}</tbody>
        </table>
      </section>

      {bills.length > 0 && (
        <section className="report-sec">
          <h3>Bills due in {monthOnly(nextMonth)}</h3>
          <ul className="bill-list">{bills.map((b) => <li key={b.key}><span className="bill-when">{dayName(b.next)}</span><span className="bill-what"><b>{b.name}</b></span><span className="bill-amt">{b.varies ? 'about ' : ''}{money(b.amount)}</span></li>)}</ul>
        </section>
      )}

      <section className="report-sec">
        <h3>What we'll do in {monthOnly(nextMonth)}</h3>
        <ul className="checklist">
          {nextActions.map((a) => (
            <li key={a.id}><span>{a.text}</span><button className="icon-btn no-print" aria-label="Remove" onClick={() => setActions(actions.filter((x) => x.id !== a.id))}><Trash2 size={15} /></button></li>
          ))}
        </ul>
        <form className="inline-form no-print" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; setActions([...actions, { id: `a${Date.now().toString(36)}`, month, text: text.trim(), done: false }]); setText(''); }}>
          <input placeholder="e.g. Cap takeaway at $300" value={text} onChange={(e) => setText(e.target.value)} aria-label="New action" />
          <button className="btn small">Add</button>
        </form>
        <p className="fine no-print">Next month's report asks whether these got done.</p>
      </section>
    </div>
  );
}

function FinancialYear() {
  const { data } = useStore();
  const s = data.settings;
  const months = allMonths(data.transactions);
  const fys = [...new Set(months.map(financialYear))].reverse();
  const [fy, setFy] = useState(fys[0] ?? '');
  if (!fy) return <p className="muted">Add statements first.</p>;
  const start = Number(fy.slice(0, 4));
  const fyMonths = Array.from({ length: 12 }, (_, i) => addMonths(`${start}-07`, i));
  const have = fyMonths.filter((m) => months.includes(m));
  const complete = new Set(completeMonths(data));
  const sums = have.map((m) => summarise(m, data));
  const total = (f: (x: ReturnType<typeof summarise>) => number) => sums.reduce((a, x) => a + f(x), 0);
  const owner = new Map(s.accounts.map((a) => [a.key, a.owner]));
  const inFy = data.transactions.filter((t) => have.includes(monthOf(t.date)));
  const pay = new Map<string, number>(), interest = new Map<string, number>();
  for (const t of inFy) {
    const who = owner.get(t.account) ?? 'Joint';
    if (t.category === 'salary') pay.set(who, (pay.get(who) ?? 0) + t.amount);
    if (t.category === 'interest') interest.set(who, (interest.get(who) ?? 0) + t.amount);
  }
  const superIn = people(s).map((p) => ({ p, amount: have.reduce((a, m) => { const e = payFor(s, p, m); return a + (e ? (e.grossYearly / 12) * (e.superPct / 100) + e.salarySacrifice : 0); }, 0) }));
  const groups = GROUPS.map((g) => ({ g, amount: Object.entries(sums.reduce((acc, x) => { for (const [c, v] of Object.entries(x.byCategory)) acc[c] = (acc[c] ?? 0) + v; return acc; }, {} as Record<string, number>))
    .filter(([c]) => CATEGORY[c]?.group === g).reduce((a, [, v]) => a + v, 0) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const cat = (id: string) => inFy.filter((t) => t.category === id && t.kind === 'spend').reduce((a, t) => a - t.amount, 0);
  const inc = total((x) => x.income), spend = total((x) => x.spend);

  return (
    <div className="report">
      <div className="report-tools no-print">
        <select value={fy} onChange={(e) => setFy(e.target.value)} aria-label="Financial year">{fys.map((f) => <option key={f} value={f}>Financial year {f}</option>)}</select>
        <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print or save as PDF</button>
      </div>
      <header className="report-head">
        <h2>Financial year {fy}</h2>
        <p>1 July {start} to 30 June {start + 1}. {have.length < 12 ? `Covers ${have.length} of 12 months so far` : 'All 12 months'}{have.some((m) => !complete.has(m)) ? '; some months are missing accounts, so totals are low' : ''}.</p>
      </header>
      <div className="stat-row">
        <div><span>Came in</span><b>{money(inc)}</b></div>
        <div><span>Spent</span><b>{money(spend)}</b></div>
        <div><span>Kept</span><b>{money(inc - spend)} ({pct(inc ? (inc - spend) / inc : 0)})</b></div>
      </div>
      <div className="wealth-grid">
        <section className="report-sec">
          <h3>Income</h3>
          <ul className="value-list">
            {[...pay].map(([p, v]) => <li key={p}><span>{p}'s take-home pay</span><span>{money(v)}</span></li>)}
            {[...interest].map(([p, v]) => <li key={`i${p}`}><span>{p}'s bank interest</span><span>{money(v)}</span></li>)}
            {superIn.filter((x) => x.amount).map((x) => <li key={`s${x.p}`}><span>Into {x.p}'s super</span><span>{money(x.amount)}</span></li>)}
          </ul>
        </section>
        <section className="report-sec">
          <h3>For tax time <Info>Things your accountant usually asks about. Bank interest is taxable income. Donations to registered charities ($2 or more) are deductible with a receipt.</Info></h3>
          <ul className="value-list">
            <li><span>Donations</span><span>{money(cat('donations'))}</span></li>
            <li><span>Accountant & tax fees</span><span>{money(cat('accountant'))}</span></li>
            <li><span>Income protection paid personally</span><span>{money(cat('life-insurance'))}</span></li>
            <li><span>Bank interest earned</span><span>{money([...interest.values()].reduce((a, b) => a + b, 0))}</span></li>
          </ul>
        </section>
      </div>
      <section className="report-sec">
        <h3>Spending by area</h3>
        <table className="score compact">
          <thead><tr><th>Area</th><th>Spent</th><th>Share</th></tr></thead>
          <tbody>{groups.map((x) => <tr key={x.g}><th scope="row">{x.g}</th><td>{money(x.amount)}</td><td>{pct(x.amount / (spend || 1))}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

export function Reports() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'meeting' | 'year') ?? 'meeting';
  return (
    <div>
      <PageHeader title="Reports">
        <div className="no-print"><Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[{ id: 'meeting', label: 'Money meeting' }, { id: 'year', label: 'Financial year' }]} /></div>
      </PageHeader>
      {tab === 'meeting' ? <MoneyMeeting /> : <FinancialYear />}
    </div>
  );
}
