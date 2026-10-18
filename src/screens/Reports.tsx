import { ChevronRight, Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Info, MonthPicker, NumberField, PageHeader, Tabs } from '../components/bits';
import { DrillLink, drillCategory, drillGroup, drillType } from '../components/Drill';
import { addMonths, allMonths, average, budgetFor, completeMonths, monthOf, summarise } from '../data/analysis';
import { CATEGORIES, CATEGORY, GROUPS } from '../data/categories';
import { reviewMonth } from '../data/review';
import { useStore } from '../data/store';
import { expectedIncome, financialYear, netWorth, payFor, people } from '../data/wealth';
import { money, monthName, monthOnly, pct } from '../lib/format';

const endOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };

function MoneyMeeting() {
  const { data, updateSettings, setBudget } = useStore();
  const months = useMemo(() => allMonths(data.transactions), [data.transactions]);
  const complete = useMemo(() => completeMonths(data), [data]);
  const [month, setMonth] = useState(complete.at(-1) ?? months.at(-1) ?? '');
  const [text, setText] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  if (!month) return <p className="muted">Add statements first.</p>;
  const r = reviewMonth(data, month);
  const s = r.summary;
  const actions = data.settings.actions ?? [];
  const prev = addMonths(month, -1);
  const lastActions = actions.filter((a) => a.month === prev);
  const nextActions = actions.filter((a) => a.month === month);
  const top = r.findings.filter((f) => f.severity === 'act' || f.severity === 'watch').slice(0, 5);
  const nextMonth = addMonths(month, 1);
  const nwNow = netWorth(data.settings, endOf(month)).total;
  const before = netWorth(data.settings, endOf(prev));
  const nwBefore = before.cash > 0 ? before.total : 0;   // only compare when last month's bank balances are known
  const setActions = (list: typeof actions) => updateSettings({ actions: list });

  // "Usual" is the average of the three complete months before this one.
  const usualMonths = complete.filter((m) => m < month).slice(-3);
  const usualSums = usualMonths.map((m) => summarise(m, data));
  const usual = (c: string) => average(usualSums.map((x) => x.byCategory[c] ?? 0));
  const groups = GROUPS.map((g) => {
    const cats = CATEGORIES.filter((c) => !c.system && c.group === g)
      .map((c) => ({ id: c.id, label: c.label, spent: s.byCategory[c.id] ?? 0, budget: budgetFor(data.budgets, c.id, month), usual: usual(c.id), next: budgetFor(data.budgets, c.id, nextMonth) }))
      .filter((c) => c.spent || c.budget || c.usual || c.next);
    const sum = (k: 'spent' | 'budget' | 'usual' | 'next') => cats.reduce((a, c) => a + c[k], 0);
    return { g, cats, spent: sum('spent'), budget: sum('budget'), usual: sum('usual'), next: sum('next') };
  }).filter((x) => x.cats.length).sort((a, b) => b.spent - a.spent);
  const tot = (k: 'spent' | 'budget' | 'usual' | 'next') => groups.reduce((a, g) => a + g[k], 0);
  const toggle = (g: string) => setOpenGroups((o) => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const diff = (spent: number, budget: number) => budget ? <span className={spent > budget * 1.05 ? 'bad' : 'good'}>{money(budget - spent, { sign: true })}</span> : '–';
  const share = (n: number) => (s.income ? pct(n / s.income) : '–');

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

      <section className="report-sec">
        <h3>Needs, wants and kept <Info>The 50/30/20 guide: about half of take-home pay on needs, under 30% on wants, at least 20% kept. Tap needs or wants to see every payment in it and fix any that are in the wrong place.</Info></h3>
        <div className="split-tiles">
          <DrillLink spec={drillType(month, 'need')} className="tile"><span>Needs</span><b>{money(s.needs)}</b><small>{share(s.needs)} of pay · aim 50%</small></DrillLink>
          <DrillLink spec={drillType(month, 'want')} className="tile"><span>Wants</span><b>{money(s.wants)}</b><small>{share(s.wants)} of pay · aim 30%</small></DrillLink>
          <div className="tile"><span>Kept</span><b>{money(s.kept)}</b><small>{share(s.kept)} of pay · aim 20%</small></div>
        </div>
      </section>

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
        <h3>Budget and next month's targets <Info>Tap an area to open its categories, and a category or amount to check what's in it. “Usual” is the average of the last {usualMonths.length || 3} complete months. Set {monthOnly(nextMonth)}'s target in the last column: it becomes the budget from then on.</Info></h3>
        <div className="table-wrap">
          <table className="score meeting">
            <thead><tr><th>Area</th><th>Budget</th><th>Spent</th><th>Left</th><th className="hide-sm">Usual</th><th>{monthOnly(nextMonth)} target</th></tr></thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = openGroups.has(g.g);
                return [
                  <tr key={g.g} className="grp-row">
                    <th scope="row"><button className="grp-toggle" aria-expanded={isOpen} onClick={() => toggle(g.g)}><ChevronRight size={15} aria-hidden className={isOpen ? 'rot' : ''} />{g.g}</button></th>
                    <td>{g.budget ? money(g.budget) : '–'}</td>
                    <td><DrillLink spec={drillGroup(month, g.g)}>{money(g.spent)}</DrillLink></td>
                    <td>{diff(g.spent, g.budget)}</td>
                    <td className="hide-sm">{money(g.usual)}</td>
                    <td>{g.next ? money(g.next) : '–'}</td>
                  </tr>,
                  ...g.cats.map((c) => (
                    <tr key={c.id} className={`cat-sub ${isOpen ? '' : 'is-folded'}`}>
                      <th scope="row"><DrillLink spec={drillCategory(month, c.id)}>{c.label}</DrillLink></th>
                      <td>{c.budget ? money(c.budget) : '–'}</td>
                      <td><DrillLink spec={drillCategory(month, c.id)}>{money(c.spent)}</DrillLink></td>
                      <td>{diff(c.spent, c.budget)}</td>
                      <td className="hide-sm">{money(c.usual)}</td>
                      <td><NumberField label={`${c.label} target for ${monthOnly(nextMonth)}`} width="5.5em" value={c.next} onSave={(n) => setBudget(c.id, nextMonth, n)} /></td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
            <tfoot><tr><th scope="row">Total</th><td>{money(tot('budget'))}</td><td>{money(tot('spent'))}</td><td>{diff(tot('spent'), tot('budget'))}</td><td className="hide-sm">{money(tot('usual'))}</td><td>{money(tot('next'))}</td></tr></tfoot>
          </table>
        </div>
        <p className="fine no-print">{tot('next') > 0 && s.income > 0 && <>Next month's targets add up to {money(tot('next'))}, leaving about {money(expectedIncome(data.settings, nextMonth) - tot('next'))} of expected pay to keep.</>}</p>
      </section>

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
