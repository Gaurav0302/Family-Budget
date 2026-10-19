import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/bits';
import { cashOnHand, completeMonths } from '../data/analysis';
import { reviewFor } from '../data/reviewCache';
import { propertiesOf } from '../data/property';
import { useForecast } from '../data/useProperties';
import { useStore } from '../data/store';
import { longDate, money, monthName } from '../lib/format';
import { today as todayLocal } from '../lib/format';

export function Goals() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const cash = cashOnHand(s, data.transactions);
  const complete = useMemo(() => completeMonths(data), [data]);
  const last = complete.at(-1);
  const r = last ? reviewFor(data, last) : null;
  const { f, st } = useForecast();
  // Payments made after the latest statements (a deposit): the forecast takes them off; say so here so the figures agree.
  const pending = f.months.filter((x) => x.part).flatMap((x) => x.oneOffs.filter((o) => !o.settles));
  const props = propertiesOf(s, data.budgets);
  const [acct, setAcct] = useState(s.accounts.find((a) => a.type === 'savings')?.key ?? s.accounts[0]?.key);
  const [amt, setAmt] = useState('');
  const today = todayLocal();

  const latest = s.accounts.filter((a) => !a.closedOn && a.type !== 'loan' && a.type !== 'card').map((a) => {
    const b = s.balances.filter((x) => x.account === a.key).sort((x, y) => y.date.localeCompare(x.date))[0];
    return { a, b };
  }).filter((x) => x.b);


  return (
    <div className="goals">
      <PageHeader title="Goals" />

      <div className="goals-grid">
        <section className="panel" aria-labelledby="steps">
          <h2 id="steps">Baby steps</h2>
          <ol className="steps">
            {(r?.ramsey.steps ?? []).map((st) => (
              <li key={st.n} className={`step ${st.status === 'good' ? 'done' : ''} ${st.current ? 'current' : ''}`}>
                <span className="step-n">{st.n}</span>
                <div>
                  <b>{st.title}</b>{st.current && <em> You are here</em>}
                  <p>{st.detail}</p>
                  {st.auto
                    ? <p className="step-auto st-text-good">Done, on your figures</p>
                    : <label className="check small"><input type="checkbox" checked={!!s.babySteps[String(st.n)]}
                        onChange={(e) => updateSettings({ babySteps: { ...s.babySteps, [String(st.n)]: e.target.checked } })} /><span>{s.babySteps[String(st.n)] ? 'Done' : 'Mark as done'}</span></label>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="cash">
          <h2 id="cash">Cash on hand</h2>
          <p className="big-num">{money(cash.total)}</p>
          {pending.length > 0 && <p className="fine">In your latest statements. {pending.map((o) => `The ${money(o.amount)} ${o.label.replace(/ \(.*\)$/, '').toLowerCase()}`).join(' and ')} {pending.length > 1 ? 'have' : 'has'} gone out since, so about <b>{money(cash.total - pending.reduce((a, o) => a + o.amount, 0))}</b> is really there.</p>}
          <p>{st.low ? <>At its lowest in the forecast, about <b>{money(st.low.cash)}</b> in {monthName(st.low.month)}: enough for <b>{st.cover.toFixed(1)} months</b> of spending. Ramsey's full emergency fund is 3 to 6 months. <Link to="/reports?step=m-ahead">See the forecast</Link></> : 'Load a complete month of statements to work this out.'}</p>
          <ul className="balances">
            {latest.map(({ a, b }) => <li key={a.key}><span>{a.name}</span><span>{money(b!.amount)}<small>{longDate(b!.date)}</small></span></li>)}
          </ul>
          <form className="inline-form" onSubmit={(e) => {
            e.preventDefault();
            if (!amt) return;
            updateSettings({ balances: [...s.balances, { account: acct, date: today, amount: Number(amt) }] });
            setAmt('');
          }}>
            <select value={acct} onChange={(e) => setAcct(e.target.value)} aria-label="Account">{s.accounts.filter((a) => !a.closedOn && a.type !== 'loan').map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select>
            <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" aria-label="Balance today" placeholder="Balance today" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></span>
            <button className="btn small">Update balance</button>
          </form>
          <p className="fine">After settlement, add the offset account and close the old savings on <Link to="/accounts">Accounts</Link>.</p>
        </section>

        <section className="panel" aria-labelledby="uni">
          <div className="panel-head"><h2 id="uni">University funds</h2><Link to="/uni">Uni funds</Link></div>
          <ul className="balances">{s.uniFunds.map((f) => <li key={f.name}><span>{f.name}, uni {f.year}</span><span>{money(f.monthly)} a month<small>{money(f.saved)} saved</small></span></li>)}</ul>
        </section>

        <section className="panel" aria-labelledby="house">
          <div className="panel-head"><h2 id="house">Property</h2><Link to="/property">Property</Link></div>
          {props.length ? <ul className="balances">{props.map((p) => <li key={p.id}><Link to={`/property/${p.id}`}>{p.name}</Link><span>{money(p.value ?? p.price)}<small>{p.use === 'home' ? 'our home' : 'investment'}, settles {longDate(p.settlement)}</small></span></li>)}</ul>
            : <p className="muted">No property yet. <Link to="/property">Add one</Link>.</p>}
        </section>
      </div>
    </div>
  );
}
