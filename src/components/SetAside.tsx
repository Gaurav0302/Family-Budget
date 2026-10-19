import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { pots, safeToSpend } from '../data/setAside';
import { useStore } from '../data/store';
import { label } from '../data/categories';
import { longDate, money, monthName, thisMonth, today } from '../lib/format';
import { Info } from './bits';

/** Sinking funds: each big cost paid a few times a year, and what should already be put aside for it. */
export function SetAsidePanel({ month }: { month: string }) {
  const { data } = useStore();
  const p = useMemo(() => pots(data, month), [data, month]);
  if (!p.pots.length && !p.unset.length) return null;
  return (
    <section className="panel set-aside" aria-labelledby="pots-h">
      <div className="panel-head">
        <h2 id="pots-h">Put aside for big bills</h2>
        <Info>School terms, rego, insurance and other costs paid a few times a year. Saving a little each month means the bill is already covered when it lands. "By now" is what should be put aside by the end of {monthName(month)}, saving evenly since the last payment. Keep it in the offset or savings and don't count it as spare.</Info>
      </div>
      {p.pots.length > 0 && (
        <>
          <p className="pots-total"><b>{money(p.total)}</b> should be put aside by the end of {monthName(month)}</p>
          <ul className="pots">
            {p.pots.map((x) => (
              <li key={x.cat}>
                <span className="pot-name"><b>{x.label}</b><small>{money(x.per)} due {x.monthsToGo === 0 ? 'this month' : monthName(x.due)}, {money(x.monthly)} a month</small></span>
                <span className="pot-num">{money(x.target)}<small>by now</small></span>
                <span className="pot-bar" aria-hidden><span style={{ width: `${Math.round((x.target / (x.per || 1)) * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.unset.length > 0 && <p className="fine">No due month yet for {p.unset.map(label).join(', ')}: pick "Each year" and the month on the line below to plan for it.</p>}
    </section>
  );
}

/** What's left of this month's day-to-day budget, per week, with how fresh the figure is. */
export function SafeToSpendPanel() {
  const { data } = useStore();
  const t = today();
  const s = useMemo(() => safeToSpend(data, t), [data, t]);
  const p = useMemo(() => pots(data, thisMonth()), [data]);
  if (!s.planned) return null;
  const left = s.planned - s.spent;
  const stale = s.asOf && (new Date(t).getTime() - new Date(s.asOf).getTime()) / 864e5 > 10;
  return (
    <section className="panel safe" aria-labelledby="safe-h">
      <div className="panel-head">
        <h2 id="safe-h">Safe to spend</h2>
        <Info>Day-to-day spending: {s.cats.map(label).join(', ')}. Not rent, the loan, regular bills or money kept. Bank statements only come in when you add them, so the figure is as fresh as the last one.</Info>
      </div>
      {s.asOf ? (
        <>
          <p className="safe-big"><b className={left < 0 ? 'st-text-bad' : ''}>{left < 0 ? 'Nothing' : money(s.perWeek)}</b>{left >= 0 && <span> a week to the end of {monthName(thisMonth())}</span>}</p>
          <p className="safe-line">{money(s.spent)} of {money(s.planned)} spent on day-to-day things, up to {longDate(s.asOf)}{left < 0 ? `: ${money(-left)} over for the month` : ''}.
            {stale && <> <Link to="/statements?tab=add">Add newer statements</Link> for a fresher figure.</>}</p>
        </>
      ) : (
        <>
          <p className="safe-big"><b>{money(s.perWeek)}</b><span> a week in the plan</span></p>
          <p className="safe-line">{money(s.planned)} for day-to-day things in {monthName(thisMonth())}. {s.missing.length ? <>Nothing from {s.missing.join(', ')} this month yet{s.spent ? `; ${money(s.spent)} spent on the other accounts` : ''}. </> : null}<Link to="/statements?tab=add">Add this month's statements</Link> to see what's left.</p>
        </>
      )}
      {p.total > 0 && <p className="fine">Also keep {money(p.total)} put aside for big bills (<Link to="/budget">Budget</Link>).</p>}
    </section>
  );
}
