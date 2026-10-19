import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Info, PageHeader } from '../components/bits';
import { findBills, manualBills, type FoundBill } from '../data/bills';
import { SPEND_CATEGORIES, label } from '../data/categories';
import { useStore } from '../data/store';
import type { Every } from '../data/types';
import { dayName, money } from '../lib/format';

const EVERY: Record<Every, string> = { week: 'Weekly', fortnight: 'Fortnightly', month: 'Monthly', term: 'Each school term', quarter: 'Quarterly', year: 'Yearly' };

export function Bills() {
  const { data, updateSettings } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const found = useMemo(() => findBills(data.transactions, today), [data.transactions, today]);
  const manual = manualBills(data.settings.bills ?? [], today);
  const all = [...found, ...manual].sort((a, b) => a.next.localeCompare(b.next));
  const soon = all.filter((b) => (new Date(b.next).getTime() - new Date(today).getTime()) / 864e5 <= 31);
  const rises = found.filter((b) => b.rise);
  const yearly = all.reduce((a, b) => a + b.yearly, 0);
  const [form, setForm] = useState({ name: '', amount: '', every: 'year' as Every, next: today, category: 'car-rego' });

  const row = (b: FoundBill) => (
    <li key={b.key}>
      <span className="bill-when">{dayName(b.next)}</span>
      <span className="bill-what"><b>{b.name}</b><small>{EVERY[b.every]}{b.manual ? '' : ', seen in statements'}{b.varies ? ', amount varies' : ''}</small></span>
      <span className="bill-amt">{b.varies ? 'about ' : ''}{money(b.amount, { cents: b.amount < 100 })}</span>
    </li>
  );

  return (
    <div className="bills">
      <PageHeader title="Bills & renewals">
        <Info>Bills are found automatically when the same payee shows up at regular intervals. Add yearly ones (rego, insurance renewals) by hand so they don't surprise you.</Info>
      </PageHeader>

      <div className="stat-row">
        <div><span>Regular bills a year</span><b>{money(yearly)}</b></div>
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
                <span className="bill-what"><b>{b.name}</b><small>{EVERY[b.every]}, {label(b.category).toLowerCase()}</small></span>
                <span className="bill-amt">{money(b.yearly)}<small>a year</small></span>
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
