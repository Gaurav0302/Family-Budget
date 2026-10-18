import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, Meter, MonthColumns, MonthPicker, PurseBar } from '../components/bits';
import { allMonths, budgetFor, completeMonths, summarise } from '../data/analysis';
import { CATEGORY } from '../data/categories';
import { reviewMonth } from '../data/review';
import { useStore } from '../data/store';
import { longDate, money, monthName, monthOnly, pct } from '../lib/format';

export function HomeScreen() {
  const { data } = useStore();
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
  const attention = review.findings.filter((f) => f.severity === 'act' || f.severity === 'watch').slice(0, 4);
  const top = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const history = months.slice(-9).map((m) => {
    const x = summarise(m, data);
    return { month: m, value: x.keptRate, partial: !completeSet.has(m) };
  });
  const h = data.settings.home;
  const daysToSettle = Math.ceil((new Date(h.settlement).getTime() - Date.now()) / 864e5);

  return (
    <div className="home">
      <div className="home-head">
        <MonthPicker months={months} value={month} onChange={setMonth} completeSet={completeSet} />
        {!s.complete && <p className="partial-note">Not every account is loaded for {monthOnly(month)} yet ({s.missing.join(', ')} missing), so totals are incomplete.</p>}
      </div>

      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">
          {s.kept >= 0
            ? <>In {monthOnly(month)} you kept <span className="num">{money(s.kept)}</span> of the <span className="num">{money(s.income)}</span> that came in.</>
            : <>In {monthOnly(month)} you spent <span className="num">{money(-s.kept)}</span> more than came in.</>}
        </h1>
        <PurseBar income={s.income} needs={s.needs} wants={s.wants} kept={s.kept} />
        <p className={`verdict tone-${review.verdict.tone}`}>{review.verdict.text}</p>
      </section>

      <div className="home-grid">
        <section className="panel" aria-labelledby="att">
          <div className="panel-head"><h2 id="att">What needs attention</h2><Link to="/review">Full review</Link></div>
          {attention.length ? (
            <ul className="findings">
              {attention.map((f) => (
                <li key={f.id}><Badge severity={f.severity} short /><div><strong>{f.title}</strong><p>{f.detail}</p></div></li>
              ))}
            </ul>
          ) : <p className="muted">Nothing stands out this month.</p>}
        </section>

        <section className="panel" aria-labelledby="where">
          <div className="panel-head"><h2 id="where">Where it went</h2><Link to={`/transactions?month=${month}`}>All spending</Link></div>
          <ul className="cat-list">
            {top.map(([cat, v]) => {
              const b = budgetFor(data.budgets, cat, month);
              return (
                <li key={cat}>
                  <Link to={`/transactions?month=${month}&category=${cat}`} className="cat-row">
                    <span className="cat-name">{CATEGORY[cat]?.label ?? cat}</span>
                    <span className="cat-num">{money(v)}<small>{b ? ` of ${money(b)}` : ' no budget'}</small></span>
                    <Meter actual={v} budget={b} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel" aria-labelledby="kept">
          <div className="panel-head"><h2 id="kept">Share of income kept</h2></div>
          <MonthColumns rows={history} format={pct} target={0.1} targetLabel="Babylon's tenth" />
          <p className="fine">Paler columns are months where not every account is loaded yet.</p>
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
