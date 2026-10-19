import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Meter, MonthPicker, PurseBar } from '../components/bits';
import { Chart } from '../components/Chart';
import { MonthBanner } from '../components/MonthBanner';
import { useForecast } from '../data/useProperties';
import { EVERY_UNIT, freqOf, meterLimit } from '../data/frequency';
import { CashChart } from './Property';
import { useMonthly } from '../data/useMonthly';
import { drillCategory, drillType, useDrill } from '../components/Drill';
import { addMonths, allMonths, budgetFor, completeMonths } from '../data/analysis';
import { CATEGORY } from '../data/categories';
import { reviewFor } from '../data/reviewCache';
import { todosFor } from '../data/todos';
import { useAudits } from '../data/useAudit';
import { useStore } from '../data/store';
import { money, monthName, monthOnly, pct, thisMonth } from '../lib/format';

export function HomeScreen() {
  const { data, updateSettings } = useStore();
  const drill = useDrill();
  const { st } = useForecast();
  const monthly = useMonthly();
  const { audits } = useAudits();
  const months = useMemo(() => allMonths(data.transactions), [data.transactions]);
  const complete = useMemo(() => completeMonths(data), [data]);
  const completeSet = useMemo(() => new Set(complete), [complete]);
  const [month, setMonth] = useState<string>(() => complete.at(-1) ?? months.at(-1) ?? '');

  if (!data.transactions.length) {
    // First run: a short setup, each step ticking itself off as it's done.
    const s0 = data.settings;
    const steps = [
      { done: s0.household !== 'Our family', text: 'Name your household', why: 'It shows at the top of the menu.', to: '/settings', go: 'Settings' },
      { done: s0.accounts.length > 0, text: 'Add your bank accounts and cards', why: 'With the last 4 digits, so each statement lands in the right place.', to: '/accounts', go: 'Accounts' },
      { done: (s0.pay ?? []).length > 0, text: "Add each person's pay", why: 'Take-home pay sets the budget and the Babylon tenth.', to: '/wealth?tab=income', go: 'Income & super' },
      { done: false, text: 'Add three months of statements', why: 'A bank CSV, or a data file Claude prepares from PDF statements. The app sorts every payment.', to: '/statements?tab=add', go: 'Add statements' },
      { done: false, text: 'Set the budget', why: "Once statements are in, each line shows your average spending with a 'use' button.", to: '/budget', go: 'Budget' },
    ];
    return (
      <div className="setup">
                <h1>Let's set up your family purse</h1>
        <p className="lead">Five steps, about half an hour with your statements to hand. Each one ticks itself off.</p>
        <ol className="setup-steps">
          {steps.map((x, i) => (
            <li key={x.text} className={x.done ? 'is-done' : ''}>
              <span className="step-n">{x.done ? '✓' : i + 1}</span>
              <div><b>{x.text}</b><p>{x.why}</p></div>
              {!x.done && <Link className={`btn small ${steps.findIndex((y) => !y.done) === i ? 'primary' : ''}`} to={x.to}>{x.go}</Link>}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const review = reviewFor(data, month);
  const s = review.summary;
  const scream = review.findings.filter((f) => f.scream).slice(0, 2);
  const attention = review.findings.filter((f) => !f.scream && (f.severity === 'act' || f.severity === 'watch')).slice(0, 4);
  const top = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // Actions agreed at last month's meeting are this month's plan.
  const actions = data.settings.actions ?? [];
  const now = thisMonth();
  const plan = actions.filter((a) => a.month === addMonths(now, -1));
  const todos = todosFor(data, audits);

  return (
    <div className="home">
      <div className="home-head">
        <MonthPicker months={months} value={month} onChange={setMonth} completeSet={completeSet} />
      </div>
      {/* What to do next, as one short list (last month's statements, sorting, the meeting, loan check-ins). */}
      {todos.length > 0 && (
        <section className="todo no-print" aria-labelledby="todo-h">
          <h2 id="todo-h">To do</h2>
          <ul>{todos.map((t) => <li key={t.id} className={`todo-${t.tone}`}><span>{t.text}</span><Link className="btn small" to={t.to}>{t.action}</Link></li>)}</ul>
        </section>
      )}
      {/* The month being viewed, if its statements aren't all in (its numbers are a draft). */}
      {(audits.get(month)?.state === 'missing' || audits.get(month)?.state === 'in-progress') && <MonthBanner month={month} />}

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
          <div className="panel-head"><h2 id="att">What needs attention</h2><Link to="/check-in?step=m-talk">In the check-in</Link></div>
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
            <div className="panel-head"><h2 id="plan">Our plan for {monthOnly(now)}</h2><Link to="/check-in">Money meeting</Link></div>
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
                    <span className="cat-name">{CATEGORY[cat]?.label ?? cat}{cat === 'other' && <small className="cat-sort"> sort these</small>}</span>
                    <span className="cat-num">{money(v)}<small>{b ? ` of ${money(meterLimit(data, cat, month, v))}${freqOf(data.settings, cat).every !== 'month' ? ` (${EVERY_UNIT[freqOf(data.settings, cat).every]})` : ''}` : ' no budget'}</small></span>
                    <Meter actual={v} budget={b ? meterLimit(data, cat, month, v) : 0} />
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
          <div className="panel-head"><h2 id="up">Looking ahead</h2><Link to="/check-in?step=m-ahead">In the money meeting</Link></div>
          <p className={`ahead-verdict st-text-${st.tone}`}><b>{st.headline}</b></p>
          <ul className="ahead-lines">{st.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <CashChart height={150} />
          <p className="fine">Last complete month: {complete.length ? monthName(complete.at(-1)!) : 'none yet'}. Property details on <Link to="/property">Property</Link>.</p>
        </section>
      </div>
    </div>
  );
}
