import { addMonths, completeMonths, lastDay, monthOf, withSplits } from '../data/analysis';
import { reviewFor } from '../data/reviewCache';
import { Link } from 'react-router-dom';
import { homeProperty, propertiesOf, repaymentOf } from '../data/property';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Info, PageHeader } from '../components/bits';
import { addEvery, findBills, manualBills, type FoundBill } from '../data/bills';
import { SPEND_CATEGORIES, label } from '../data/categories';
import { useStore } from '../data/store';
import type { Every } from '../data/types';
import { dayName, money, monthName } from '../lib/format';
import { today as todayLocal } from '../lib/format';

const monthsFrom = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
/** The next monthly date on or after today, keeping the day of the month (clamped to short months). */
const rollMonthly = (first: string, today: string) => { let k = 1, d = addEvery(first, 'month', k); while (d < today) d = addEvery(first, 'month', ++k); return d; };

const EVERY: Record<Every, string> = { week: 'Weekly', fortnight: 'Fortnightly', month: 'Monthly', term: 'Each school term', quarter: 'Quarterly', year: 'Yearly' };

export function Bills() {
  const { data, updateSettings } = useStore();
  const today = todayLocal();
  const found = useMemo(() => findBills(withSplits(data.transactions, data.settings.splits), today), [data.transactions, data.settings.splits, today]);
  const manual = manualBills(data.settings.bills ?? [], today);
  // Bills the plans already know about: each property's loan repayment, from its first repayment.
  // (Once repayments show up in the statements, the statements' version is used instead.)
  const loans: FoundBill[] = found.some((b) => b.category === 'mortgage') ? [] : propertiesOf(data.settings, data.budgets).filter((p) => p.loan && !p.soldOn).map((p) => {
    // The settlement day in the first repayment month, clamped to that month's length (no 30 February).
    const fm = p.loan!.firstRepayment || monthOf(p.settlement);
    const first = `${fm}-${String(Math.min(Number(p.settlement.slice(8, 10)), Number(lastDay(fm).slice(8, 10)))).padStart(2, '0')}`;
    const next = first >= today ? first : rollMonthly(first, today);
    const amount = Math.round(repaymentOf(p.loan!));
    return { key: `loan|${p.id}`, name: `${p.name} loan repayment`, category: 'mortgage', every: 'month', amount, varies: false, last: '', next, yearly: amount * 12, fromPlan: true } as FoundBill & { fromPlan: boolean };
  });
  // A bill whose budget drops to $0 later (rent once the lease ends) stops then; its yearly cost counts only the months left.
  const stops = (cat: string) => data.budgets.filter((b) => b.category === cat && b.from > monthOf(today) && b.amount === 0).map((b) => b.from).sort()[0];
  const all = [...found, ...manual, ...loans].map((b) => {
    const stop = stops(b.category);
    if (!stop) return b;
    const left = Math.max(0, Math.min(12, monthsFrom(monthOf(today), stop)));
    return { ...b, stopsAfter: addMonths(stop, -1), yearly: (b.yearly / 12) * left };
  }).sort((a, b) => a.next.localeCompare(b.next));
  const soon = all.filter((b) => (new Date(b.next).getTime() - new Date(today).getTime()) / 864e5 <= 31);
  const rises = found.filter((b) => b.rise);
  const yearly = all.reduce((a, b) => a + b.yearly, 0);
  // Subscriptions: the same list the monthly review uses (with "you have two of these" notes), as of the last complete month.
  const lastComplete = completeMonths(data).at(-1);
  const subs = lastComplete ? reviewFor(data, lastComplete).subscriptions : [];
  const home = homeProperty(data.settings, data.budgets);
  const [form, setForm] = useState({ name: '', amount: '', every: 'year' as Every, next: today, category: 'car-rego' });

  const row = (b: FoundBill) => (
    <li key={b.key}>
      <span className="bill-when">{dayName(b.next)}</span>
      <span className="bill-what"><b>{b.name}</b><small>{EVERY[b.every]}{b.manual ? '' : (b as any).fromPlan ? ', from Property' : ', seen in statements'}{b.varies ? ', amount varies' : ''}</small></span>
      <span className="bill-amt">{b.varies ? 'about ' : ''}{money(b.amount, { cents: b.amount < 100 })}</span>
    </li>
  );

  return (
    <div className="bills">
      <PageHeader title="Bills & subscriptions">
        <Info>Bills are found automatically when the same payee shows up at regular intervals. Add yearly ones (rego, insurance renewals) by hand so they don't surprise you.</Info>
      </PageHeader>

      <div className="stat-row">
        <div><span>Regular bills, next 12 months</span><b>{money(yearly)}</b></div>
        <div><span>Averages out to</span><b>{money(yearly / 12)}<small> a month</small></b></div>
        <div><span>Due in the next month</span><b>{money(soon.reduce((a, b) => a + b.amount, 0))}</b></div>
      </div>

      {rises.length > 0 && (
        <section className="panel rise-panel">
          <h2>Prices that went up</h2>
          <ul className="value-list">
            {rises.map((b) => (
              <li key={b.key}><span><b>{b.name}</b><small>Since {dayName(b.rise!.since)}</small></span>
                <span>{money(b.rise!.from, { cents: true })} → {money(b.rise!.to, { cents: true })}<small>{money(((b.rise!.to - b.rise!.from) * b.yearly) / b.amount)} a year more</small></span></li>
            ))}
          </ul>
        </section>
      )}

      {subs.length > 0 && (
        <section className="panel" aria-labelledby="subs">
          <div className="panel-head"><h2 id="subs">Subscriptions and memberships</h2>{home && <Link to={`/property/${home.id}?tab=whatif`}>Try cancelling some</Link>}</div>
          <ul className="subs">
            {subs.map((x) => (
              <li key={x.merchant}>
                <span><b>{x.merchant}</b>{x.overlap && <small className="warn"> You have {x.overlap}</small>}</span>
                <span>{money(x.monthly)}/month<small>{money(x.yearly)} a year{x.every === 'year' ? ', paid yearly' : ''}</small></span>
              </li>
            ))}
          </ul>
          <p className="total-line">Together about <b>{money(subs.reduce((a, x) => a + x.monthly, 0))}</b> a month, or <b>{money(subs.reduce((a, x) => a + x.yearly, 0))}</b> a year.</p>
        </section>
      )}

      <div className="wealth-grid">
        <section className="panel">
          <h2>Coming up</h2>
          {soon.length ? <ul className="bill-list">{soon.map(row)}</ul> : <p className="muted">Nothing due in the next month.</p>}
        </section>
        <section className="panel">
          <h2>All regular bills</h2>
          <ul className="bill-list">
            {all.map((b) => (
              <li key={b.key}>
                <span className="bill-what"><b>{b.name}</b><small>{EVERY[b.every]}, {label(b.category).toLowerCase()}{(b as any).stopsAfter ? `, stops after ${monthName((b as any).stopsAfter)}` : ''}{(b as any).fromPlan ? ', from Property' : ''}</small></span>
                <span className="bill-amt">{money(b.yearly)}<small>{(b as any).stopsAfter ? 'in the next 12 months' : 'a year'}</small></span>
                {b.manual && <button className="icon-btn" aria-label={`Remove ${b.name}`} onClick={() => updateSettings({ bills: (data.settings.bills ?? []).filter((x) => `manual|${x.id}` !== b.key) })}><Trash2 size={16} /></button>}
              </li>
            ))}
          </ul>
          <details className="add">
            <summary>Add a bill</summary>
            <form className="bill-form" onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim() || !form.amount) return;
              updateSettings({ bills: [...(data.settings.bills ?? []), { id: `b${Date.now().toString(36)}`, name: form.name.trim(), amount: Number(form.amount), every: form.every, next: form.next, category: form.category }] });
              setForm({ ...form, name: '', amount: '' });
            }}>
              <input placeholder="Name, e.g. Car rego" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Bill name" />
              <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Amount" /></span>
              <select value={form.every} onChange={(e) => setForm({ ...form, every: e.target.value as Every })} aria-label="How often">
                {Object.entries(EVERY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <label className="inline">Next due <input type="date" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Category">
                {SPEND_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <button className="btn small primary">Add bill</button>
            </form>
          </details>
        </section>
      </div>
    </div>
  );
}
