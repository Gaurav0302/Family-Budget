import { ChevronRight, Maximize2, Minimize2, Printer, Trash2 } from 'lucide-react';
import { Chart, inRange, RangePicker, seriesColor, type Range } from '../components/Chart';
import { budgetOf, spendOf, useMonthly } from '../data/useMonthly';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Info, MonthPicker, NumberField, PageHeader, Spark, Tabs } from '../components/bits';
import { DrillLink, drillCategory, drillGroup, drillType, useDrill } from '../components/Drill';
import { addMonths, allMonths, budgetFor, completeMonths, monthOf, summarise } from '../data/analysis';
import { CATEGORIES, CATEGORY, GROUPS } from '../data/categories';
import { reviewMonth } from '../data/review';
import { useStore } from '../data/store';
import { expectedIncome, financialYear, netWorth, payFor, people } from '../data/wealth';
import { money, monthName, monthOnly, pct } from '../lib/format';

const endOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };

/** One small chart per area, sharing one time span; tap an area's name to see its categories stacked. */
function AreaCharts({ month }: { month: string }) {
  const { data } = useStore();
  const drill = useDrill();
  const m = useMonthly();
  const upTo = m.months.findIndex((x) => x === month) + 1;
  const months = m.months.slice(0, upTo), sums = m.sums.slice(0, upTo);
  const [range, setRange] = useState<Range>('6m');
  const [big, setBig] = useState<string | null>(null);
  const shown = new Set(inRange(months, range));
  const areas = GROUPS.map((g) => {
    const cats = CATEGORIES.filter((c) => !c.system && c.group === g);
    const ids = cats.map((c) => c.id);
    const values = spendOf(sums, ids);
    const inSpan = values.filter((_, i) => shown.has(months[i])).reduce((a, b) => a + b, 0);
    return { g, cats, ids, values, inSpan, now: values[values.length - 1] ?? 0, budget: budgetOf(data.budgets, months, ids) };
  }).filter((a) => a.inSpan > 0).sort((a, b) => b.inSpan - a.inSpan);
  return (
    <section className="report-sec">
      <div className="sec-head">
        <h3>Each area over time <Info>Bars are what each area cost each month; the dashed line is its budget. Hover or tap a month for the numbers, click it for the payments. Tap ⤢ to split an area into its categories.</Info></h3>
        <RangePicker months={months} value={range} onChange={setRange} />
      </div>
      <div className="area-grid">
        {areas.map((a) => {
          const isBig = big === a.g;
          const bud = a.budget[a.budget.length - 1];
          return (
            <div key={a.g} className={`area-card ${isBig ? 'is-big' : ''}`}>
              <div className="area-head">
                <span><b>{a.g}</b><small>{money(a.now)} in {monthOnly(month)}{bud ? ` · budget ${money(bud)}` : ''}</small></span>
                <button className="icon-btn no-print" aria-label={isBig ? `Shrink ${a.g}` : `Split ${a.g} into categories`} aria-expanded={isBig} onClick={() => setBig(isBig ? null : a.g)}>{isBig ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              </div>
              {isBig ? (
                <Chart noRange range={range} kind="stacked" height={240} label={`${a.g} by category`} months={months} highlight={month} partial={m.partial}
                  series={a.cats.map((c, i) => ({ id: c.id, label: c.label, values: spendOf(sums, [c.id]), color: seriesColor(i) })).filter((x) => x.values.some((v) => v > 0)).slice(0, 8)}
                  budget={a.budget} onPick={(mm) => drill(drillGroup(mm, a.g))} />
              ) : (
                <Chart compact noRange range={range} height={110} label={`${a.g} by month`} months={months} highlight={month} partial={m.partial}
                  series={[{ id: a.g, label: a.g, values: a.values, color: 'var(--euc)' }]} budget={a.budget} onPick={(mm) => drill(drillGroup(mm, a.g))} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Money in against money out, month by month, with the share kept. */
function InOutChart({ month }: { month: string }) {
  const m = useMonthly();
  const upTo = m.months.findIndex((x) => x === month) + 1;
  const months = m.months.slice(0, upTo), sums = m.sums.slice(0, upTo);
  return (
    <section className="report-sec">
      <Chart title={<h3>Came in and spent</h3>} label="Came in and spent by month" months={months} highlight={month} partial={m.partial} height={190}
        series={[{ id: 'in', label: 'Came in', values: sums.map((x) => x.income), color: 'var(--s1)' }, { id: 'out', label: 'Spent', values: sums.map((x) => x.spend), color: 'var(--s2)' }]}
        tipExtra={(mm) => { const x = sums[months.indexOf(mm)]; return [{ label: 'Kept', value: `${money(x.kept)} (${pct(x.keptRate)})` }]; }} />
    </section>
  );
}

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

  // The trend shows up to six complete months ending with this one.
  const trendMonths = [...complete.filter((m) => m < month).slice(-5), month];
  const trendSums = trendMonths.map((m) => (m === month ? s : summarise(m, data)));
  const trend = (ids: string[]) => trendMonths.map((m, i) => ({ month: m, value: ids.reduce((a, c) => a + (trendSums[i].byCategory[c] ?? 0), 0) }));
  const groups = GROUPS.map((g) => {
    const cats = CATEGORIES.filter((c) => !c.system && c.group === g)
      .map((c) => ({ id: c.id, label: c.label, spent: s.byCategory[c.id] ?? 0, budget: budgetFor(data.budgets, c.id, month), next: budgetFor(data.budgets, c.id, nextMonth) }))
      .filter((c) => c.spent || c.budget || c.next || trend([c.id]).some((x) => x.value));
    const sum = (k: 'spent' | 'budget' | 'next') => cats.reduce((a, c) => a + c[k], 0);
    return { g, cats, spent: sum('spent'), budget: sum('budget'), next: sum('next') };
  }).filter((x) => x.cats.length).sort((a, b) => b.spent - a.spent);
  const tot = (k: 'spent' | 'budget' | 'next') => groups.reduce((a, g) => a + g[k], 0);
  const toggle = (g: string) => setOpenGroups((o) => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const diff = (spent: number, budget: number) => budget ? <span className={spent > budget * 1.05 ? 'bad' : 'good'}>{money(budget - spent, { sign: true })}</span> : '–';
  const share = (n: number) => (s.income ? pct(n / s.income) : '–');
  const rate = (n: number) => (s.income ? n / s.income : 0);

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
          <DrillLink spec={drillType(month, 'need')} className={`tile tile-${rate(s.needs) > 0.5 ? 'warn' : 'ok'}`}><span>Needs</span><b>{money(s.needs)}</b><small>{share(s.needs)} of pay, {rate(s.needs) > 0.5 ? 'over' : 'within'} the 50% guide</small></DrillLink>
          <DrillLink spec={drillType(month, 'want')} className={`tile tile-${rate(s.wants) > 0.3 ? 'warn' : 'ok'}`}><span>Wants</span><b>{money(s.wants)}</b><small>{share(s.wants)} of pay, {rate(s.wants) > 0.3 ? `${money(s.wants - 0.3 * s.income)} over` : 'within'} the 30% guide</small></DrillLink>
          <div className={`tile tile-${rate(s.kept) >= 0.2 ? 'good' : rate(s.kept) >= 0.1 ? 'warn' : 'bad'}`}><span>Kept</span><b>{money(s.kept)}</b><small>{share(s.kept)} of pay, {rate(s.kept) >= 0.2 ? 'on track for' : 'under'} the 20% guide</small></div>
        </div>
      </section>

      <InOutChart month={month} />

      {lastActions.length > 0 && (
        <section className="report-sec">
          <h3>Did we do what we planned for {monthOnly(month)}?</h3>
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

      <AreaCharts month={month} />

      <section className="report-sec">
        <h3>Budget and next month's targets <Info>Tap an area to open its categories, and a category or amount to check what's in it. The trend shows the last {trendMonths.length} complete months, this one darker, with the budget as a faint line. Set {monthOnly(nextMonth)}'s target in the last column: it becomes the budget from then on.</Info></h3>
        <div className="table-wrap">
          <table className="score meeting">
            <thead><tr><th>Area</th><th className="hide-sm">Budget</th><th>Spent</th><th>Left</th><th>Trend</th><th>{monthOnly(nextMonth)} target</th></tr></thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = openGroups.has(g.g);
                return [
                  <tr key={g.g} className="grp-row">
                    <th scope="row"><button className="grp-toggle" aria-expanded={isOpen} onClick={() => toggle(g.g)}><ChevronRight size={15} aria-hidden className={isOpen ? 'rot' : ''} />{g.g}</button></th>
                    <td className="hide-sm">{g.budget ? money(g.budget) : '–'}</td>
                    <td><DrillLink spec={drillGroup(month, g.g)}>{money(g.spent)}</DrillLink></td>
                    <td>{diff(g.spent, g.budget)}</td>
                    <td><Spark label={`${g.g} by month`} values={trend(g.cats.map((c) => c.id))} highlight={month} budget={g.budget} /></td>
                    <td>{g.next ? money(g.next) : '–'}</td>
                  </tr>,
                  ...g.cats.map((c) => (
                    <tr key={c.id} className={`cat-sub ${isOpen ? '' : 'is-folded'}`}>
                      <th scope="row"><DrillLink spec={drillCategory(month, c.id)}>{c.label}</DrillLink></th>
                      <td className="hide-sm">{c.budget ? money(c.budget) : '–'}</td>
                      <td><DrillLink spec={drillCategory(month, c.id)}>{money(c.spent)}</DrillLink></td>
                      <td>{diff(c.spent, c.budget)}</td>
                      <td><Spark label={`${c.label} by month`} values={trend([c.id])} highlight={month} budget={c.budget} /></td>
                      <td><NumberField label={`${c.label} target for ${monthOnly(nextMonth)}`} width="5.5em" value={c.next} onSave={(n) => setBudget(c.id, nextMonth, n)} /></td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
            <tfoot><tr><th scope="row">Total</th><td className="hide-sm">{money(tot('budget'))}</td><td>{money(tot('spent'))}</td><td>{diff(tot('spent'), tot('budget'))}</td><td><Spark label="All spending by month" values={trend(groups.flatMap((g) => g.cats.map((c) => c.id)))} highlight={month} budget={tot('budget')} /></td><td>{money(tot('next'))}</td></tr></tfoot>
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
