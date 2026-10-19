import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, Meter, MonthPicker, PurseBar } from '../components/bits';
import { Chart } from '../components/Chart';
import { useMonthly } from '../data/useMonthly';
import { drillCategory, drillType, useDrill } from '../components/Drill';
import { addMonths, allMonths, budgetFor, completeMonths } from '../data/analysis';
import { CATEGORY } from '../data/categories';
import { reviewMonth } from '../data/review';
import { useStore } from '../data/store';
import { longDate, money, monthName, monthOnly, pct, thisMonth } from '../lib/format';

export function HomeScreen() {
  const { data, updateSettings } = useStore();
  const drill = useDrill();
  const monthly = useMonthly();
  const months = useMemo(() => allMonths(data.transactions), [data.transactions]);
  const complete = useMemo(() => completeMonths(data), [data]);
  const completeSet = useMemo(() => new Set(complete), [complete]);
  const [month, setMonth] = useState<string>(() => complete.at(-1) ?? months.at(-1) ?? '');

  if (!data.transactions.length) return (
    <Empty title="Nothing here yet">
      <p>Add your first statements to see where the money goes.</p>
      <Link className="btn primary" to="/import">Add statements</Link>
    </Empty>
  );

  const review = reviewMonth(data, month);
  const s = review.summary;
  const scream = review.findings.filter((f) => f.scream).slice(0, 2);
  const attention = review.findings.filter((f) => !f.scream && (f.severity === 'act' || f.severity === 'watch')).slice(0, 4);
  const top = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // Actions agreed at last month's meeting are this month's plan.
  const actions = data.settings.actions ?? [];
  const now = thisMonth();
  const plan = actions.filter((a) => a.month === addMonths(now, -1));
  const h = data.settings.home;
  const daysToSettle = Math.ceil((new Date(h.settlement).getTime() - Date.now()) / 864e5);

  return (
    <div className="home">
      <div className="home-head">
        <MonthPicker months={months} value={month} onChange={setMonth} completeSet={completeSet} />
        {!s.complete && <p className="partial-note">Not every account is loaded for {monthOnly(month)} yet ({s.missing.join(', ')} missing), so totals are incomplete.</p>}
      </div>

      {scream.length > 0 && (
        <section className="scream" aria-label="Needs attention now">
          {scream.map((f) => (
            <div key={f.id} className="scream-item"><AlertTriangle size={20} aria-hidden /><div><b>{f.title}</b><p>{f.detail}</p></div></div>
          ))}
        </section>
      )}

      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">
          {s.kept >= 0
            ? <>In {monthOnly(month)} you kept <span className={`num is-${s.keptRate >= 0.2 ? 'good' : s.keptRate >= 0.1 ? 'warn' : 'bad'}`}>{money(s.kept)}</span> of the <span className="num">{money(s.income)}</span> that came in.</>
            : <>In {monthOnly(month)} you spent <span className="num is-bad">{money(-s.kept)}</span> more than came in.</>}
        </h1>
        <PurseBar income={s.income} needs={s.needs} wants={s.wants} kept={s.kept} complete={s.complete} onOpen={(t) => drill(drillType(month, t))} />
        <p className={`verdict tone-${review.verdict.tone}`}>{review.verdict.text}</p>
      </section>

      <div className="home-grid">
        <section className="panel" aria-labelledby="att">
          <div className="panel-head"><h2 id="att">What needs attention</h2><Link to="/review">Full review</Link></div>
          {attention.length ? (
            <ul className="findings">
              {attention.map((f) => (
                <li key={f.id}><Badge severity={f.severity} short /><div><strong>{f.title}</strong><p>{f.detail.split(/(?<=\.) /)[0]}</p></div></li>
              ))}
            </ul>
          ) : <p className="muted">Nothing stands out this month.</p>}
        </section>

        {plan.length > 0 && (
          <section className="panel" aria-labelledby="plan">
            <div className="panel-head"><h2 id="plan">Our plan for {monthOnly(now)}</h2><Link to="/reports">Money meeting</Link></div>
            <ul className="checklist">
              {plan.map((a) => (
                <li key={a.id}><label className="check"><input type="checkbox" checked={a.done} onChange={(e) => updateSettings({ actions: actions.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)) })} /><span>{a.text}</span></label></li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel" aria-labelledby="where">
          <div className="panel-head"><h2 id="where">Where it went</h2><Link to={`/transactions?month=${month}`}>All spending</Link></div>
          <ul className="cat-list">
            {top.map(([cat, v]) => {
              const b = budgetFor(data.budgets, cat, month);
              return (
                <li key={cat}>
                  <button type="button" onClick={() => drill(drillCategory(month, cat))} className="cat-row">
                    <span className="cat-name">{CATEGORY[cat]?.label ?? cat}</span>
                    <span className="cat-num">{money(v)}<small>{b ? ` of ${money(b)}` : ' no budget'}</small></span>
                    <Meter actual={v} budget={b} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel" aria-labelledby="kept">
          <Chart title={<h2 id="kept">Share of income kept</h2>} label="Share of income kept by month" months={monthly.months} highlight={month} partial={monthly.partial} height={180}
            series={[{ id: 'kept', label: 'Kept', values: monthly.sums.map((x) => x.keptRate), color: 'var(--data)' }]}
            format={pct} axisFormat={pct} target={{ value: 0.1, label: "Babylon's tenth (10%)" }}
            tipExtra={(m) => { const x = monthly.sums[monthly.months.indexOf(m)]; return [{ label: 'Kept', value: money(x.kept) }, { label: 'Came in', value: money(x.income) }]; }}
            onPick={setMonth} pickLabel="Show this month" />
          <p className="fine">Paler bars: not every account loaded yet. Click a month to look at it.</p>
        </section>

        <section className="panel coming" aria-labelledby="up">
          <div className="panel-head"><h2 id="up">Coming up</h2><Link to="/goals">Goals</Link></div>
          <ul className="timeline">
            {h.settlement && daysToSettle > 0 && <li><b>{longDate(h.settlement)}</b><span>Settlement on {h.name || 'the house'}, in {daysToSettle} days. Repayments of about {money(h.repayment)} a month begin.</span></li>}
            {h.settlement && h.leaseEnds > h.settlement && <li><b>{longDate(h.leaseEnds)}</b><span>The current lease ends. Until then rent of {money(budgetFor(data.budgets, 'rent', month))} a month may overlap with the mortgage.</span></li>}
            <li><b>Each month</b><span>Add the new statements and read the review. Last complete month: {complete.length ? monthName(complete.at(-1)!) : 'none yet'}.</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
