import { budgetFor, completeMonths, monthOf, withSplits } from '../data/analysis';
import { reviewFor } from '../data/reviewCache';
import { Link } from 'react-router-dom';
import { homeProperty } from '../data/property';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Info, PageHeader } from '../components/bits';
import { findBills } from '../data/bills';
import { billList, type ListedBill } from '../data/billList';
import { SPEND_CATEGORIES, label } from '../data/categories';
import { useStore } from '../data/store';
import type { Every } from '../data/types';
import { dayName, money, monthName } from '../lib/format';
import { today as todayLocal } from '../lib/format';


const WHEN = [
  { label: 'This week', test: (d: number) => d <= 7 },
  { label: 'Next week', test: (d: number) => d > 7 && d <= 14 },
  { label: 'Later', test: (d: number) => d > 14 },
];

const EVERY: Record<Every, string> = { week: 'Weekly', fortnight: 'Fortnightly', month: 'Monthly', term: 'Each school term', quarter: 'Quarterly', year: 'Yearly' };

export function Bills() {
  const { data, updateSettings } = useStore();
  const today = todayLocal();
  const found = useMemo(() => findBills(withSplits(data.transactions, data.settings.splits), today), [data.transactions, data.settings.splits, today]);
  const all = useMemo(() => billList(data, today, found), [data, today, found]);
  const daysTo = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 864e5);
  const soon = all.filter((b) => daysTo(b.next) <= 31);
  // Yearly bills renewing within six weeks: time to compare prices before they roll over.
  const renewing = all.filter((b) => b.every === 'year' && daysTo(b.next) >= 0 && daysTo(b.next) <= 42);
  const rises = found.filter((b) => b.rise);
  const yearly = all.reduce((a, b) => a + b.yearly, 0);
  // Subscriptions: the same list the monthly review uses (with "you have two of these" notes), as of the last complete month.
  const lastComplete = completeMonths(data).at(-1);
  const subs = lastComplete ? reviewFor(data, lastComplete).subscriptions : [];
  const home = homeProperty(data.settings, data.budgets);
  const [form, setForm] = useState({ name: '', amount: '', every: 'year' as Every, next: today, category: 'car-rego' });

  const row = (b: ListedBill) => (
    <li key={b.key}>
      <span className="bill-when">{dayName(b.next)}</span>
      <span className="bill-what"><b>{b.name}</b><small>{EVERY[b.every]}{b.manual ? '' : b.fromPlan ? ', from Property' : ', seen in statements'}{b.varies ? ', amount varies' : ''}</small></span>
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

      {renewing.length > 0 && (
        <section className="panel rise-panel" aria-labelledby="renew">
          <h2 id="renew">Renewing soon: worth comparing prices</h2>
          <ul className="value-list">{renewing.map((b) => <li key={b.key}><span><b>{b.name}</b><small>Renews {dayName(b.next)}, in {daysTo(b.next)} days</small></span><span>{money(b.amount)}<small>last time</small></span></li>)}</ul>
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
          {soon.length ? WHEN.map((w) => {
            const list = soon.filter((b) => w.test(daysTo(b.next)));
            return list.length ? (
              <div key={w.label} className="bill-when-group">
                <h3>{w.label} <small>{money(list.reduce((a, b) => a + b.amount, 0))}</small></h3>
                <ul className="bill-list">{list.map(row)}</ul>
              </div>
            ) : null;
          }) : <p className="muted">Nothing due in the next month.</p>}
        </section>
        <section className="panel">
          <h2>All regular bills</h2>
          <ul className="bill-list">
            {all.map((b) => (
              <li key={b.key}>
                <span className="bill-what"><b>{b.name}</b><small>{EVERY[b.every]}, {label(b.category).toLowerCase()}{(() => { const bud = budgetFor(data.budgets, b.category, monthOf(today)); return bud ? `, budget ${money(bud)} a month` : ', no budget yet'; })()}{b.stopsAfter ? `, stops after ${monthName(b.stopsAfter)}` : ''}{b.fromPlan ? `, from Property, starts ${monthName(monthOf(b.next))}` : ''}</small></span>
                <span className="bill-amt">{money(b.yearly)}<small>{b.stopsAfter || b.partYear ? 'in the next 12 months' : 'a year'}</small></span>
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
