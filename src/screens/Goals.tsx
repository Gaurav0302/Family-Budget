import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/bits';
import { average, budgetFor, cashOnHand, completeMonths, monthOf, summarise } from '../data/analysis';
import { reviewMonth } from '../data/review';
import { expectedIncome } from '../data/wealth';
import { useStore } from '../data/store';
import type { Settings, UniFund } from '../data/types';
import { longDate, money } from '../lib/format';

function Num({ value, onSave, prefix = '$', label, step }: { value: number; onSave: (n: number) => void; prefix?: string; label: string; step?: string }) {
  const [t, setT] = useState<string | null>(null);
  return (
    <span className="money-input">
      {prefix && <span aria-hidden>{prefix}</span>}
      <input inputMode="decimal" aria-label={label} step={step} value={t ?? String(value)}
        onChange={(e) => setT(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={() => { if (t !== null) { onSave(Number(t || 0)); setT(null); } }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </span>
  );
}

export function Goals() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const cash = cashOnHand(s);
  const complete = useMemo(() => completeMonths(data), [data]);
  const last = complete.at(-1);
  const r = last ? reviewMonth(data, last) : null;
  const avgSpend = average(complete.slice(-3).map((m) => summarise(m, data).spend));
  // Spending once the mortgage starts: recent spending, minus rent, plus the repayment and the new house bills.
  const settle = monthOf(s.home.settlement);
  const rent = last ? budgetFor(data.budgets, 'rent', last) : 0;
  const houseBills = ['council-rates', 'water', 'home-insurance'].reduce((a, c) => a + budgetFor(data.budgets, c, settle), 0)
    - (last ? budgetFor(data.budgets, 'water', last) : 0);
  const monthly = avgSpend - rent + s.home.repayment + houseBills;
  const incomeAtSettle = expectedIncome(s, settle);
  const months = monthly > 0 ? cash.total / monthly : 0;
  const [acct, setAcct] = useState(s.accounts.find((a) => a.type === 'savings')?.key ?? s.accounts[0]?.key);
  const [amt, setAmt] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const latest = s.accounts.map((a) => {
    const b = s.balances.filter((x) => x.account === a.key).sort((x, y) => y.date.localeCompare(x.date))[0];
    return { a, b };
  }).filter((x) => x.b);

  const setFund = (i: number, patch: Partial<UniFund>) => updateSettings({ uniFunds: s.uniFunds.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const setHome = (patch: Partial<Settings['home']>) => updateSettings({ home: { ...s.home, ...patch } });

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
                  <label className="check small"><input type="checkbox" checked={!!s.babySteps[String(st.n)]}
                    onChange={(e) => updateSettings({ babySteps: { ...s.babySteps, [String(st.n)]: e.target.checked } })} /><span>Mark as done</span></label>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="cash">
          <h2 id="cash">Cash on hand</h2>
          <p className="big-num">{money(cash.total)}</p>
          <p>{monthly > 0 ? <>Enough for about <b>{months.toFixed(1)} months</b> of spending once the mortgage starts ({money(monthly)} a month). Ramsey's full emergency fund is 3 to 6 months.</> : 'Load a complete month of statements to work this out.'}</p>
          <ul className="balances">
            {latest.map(({ a, b }) => <li key={a.key}><span>{a.name}</span><span>{money(b!.amount)}<small>{longDate(b!.date)}</small></span></li>)}
          </ul>
          <form className="inline-form" onSubmit={(e) => {
            e.preventDefault();
            if (!amt) return;
            updateSettings({ balances: [...s.balances, { account: acct, date: today, amount: Number(amt) }] });
            setAmt('');
          }}>
            <select value={acct} onChange={(e) => setAcct(e.target.value)} aria-label="Account">{s.accounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select>
            <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" aria-label="Balance today" placeholder="Balance today" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></span>
            <button className="btn small">Update balance</button>
          </form>
          <p className="fine">After settlement, update these and add the offset account in Settings.</p>
        </section>

        <section className="panel" aria-labelledby="uni">
          <h2 id="uni">University funds</h2>
          {s.uniFunds.map((f, i) => {
            const now = new Date();
            const monthsLeft = Math.max(0, (f.year - now.getFullYear()) * 12 - now.getMonth());
            const projected = f.saved + f.monthly * monthsLeft;
            const share = f.target ? Math.min(projected / f.target, 1) : 0;
            return (
              <div key={f.name} className="fund">
                <h3>{f.name}, starting {f.year}</h3>
                <div className="fund-fields">
                  <label>Saved so far<Num label={`${f.name} saved`} value={f.saved} onSave={(n) => setFund(i, { saved: n })} /></label>
                  <label>Each month<Num label={`${f.name} monthly`} value={f.monthly} onSave={(n) => setFund(i, { monthly: n })} /></label>
                  <label>Target<Num label={`${f.name} target`} value={f.target} onSave={(n) => setFund(i, { target: n })} /></label>
                </div>
                <p>At {money(f.monthly)} a month for {monthsLeft} months: <b>{money(projected)}</b> by {f.year}{f.target ? `, ${Math.round(share * 100)}% of the target` : ''}.{!f.target && ' Set a target to track progress.'}</p>
                {f.target > 0 && <div className="progress" role="img" aria-label={`${Math.round(share * 100)}% of target`}><span style={{ width: `${share * 100}%` }} /></div>}
              </div>
            );
          })}
        </section>

        <section className="panel" aria-labelledby="house">
          <h2 id="house">{s.home.name || 'Home'}</h2>
          <div className="fund-fields">
            <label>Settlement<input type="date" value={s.home.settlement} onChange={(e) => setHome({ settlement: e.target.value })} /></label>
            <label>Monthly repayment<Num label="Repayment" value={s.home.repayment} onSave={(n) => setHome({ repayment: n })} /></label>
            <label>Interest rate<Num label="Rate" prefix="" value={s.home.rate} onSave={(n) => setHome({ rate: n })} /></label>
            <label>Current lease ends<input type="date" value={s.home.leaseEnds} onChange={(e) => setHome({ leaseEnds: e.target.value })} /></label>
          </div>
          <p>Repayment is about <b>{incomeAtSettle ? Math.round((s.home.repayment / incomeAtSettle) * 100) : 0}%</b> of take-home pay. With rates, water and insurance, housing comes to about <b>{Math.round((r?.ramsey.housingAfter ?? 0) * 100)}%</b>. Ramsey's guide is 25% or less.</p>
          <p>A common rule of thumb for upkeep is 1% of the home's value a year: about <b>{money(s.home.value * 0.01 / 12)}</b> a month for repairs and replacements. Add it to the budget under Repairs & maintenance when you're ready.</p>
          {s.home.loanPlannerUrl && <a className="btn" href={s.home.loanPlannerUrl} target="_blank" rel="noreferrer">Open the Loan Planner <ExternalLink size={15} aria-hidden /></a>}
        </section>
      </div>
    </div>
  );
}
