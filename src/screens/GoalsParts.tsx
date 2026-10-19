import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NumberField } from '../components/bits';
import { addMonths } from '../data/analysis';
import { useStore } from '../data/store';
import { money, monthName, thisMonth } from '../lib/format';

const id = () => Math.random().toString(36).slice(2, 9);
const monthsUntil = (to: string) => { const n = thisMonth(); return (Number(to.slice(0, 4)) - Number(n.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(n.slice(5, 7)); };

/** The family's own goals: what each costs, what's put aside, and what a month gets there by the date wanted. */
export function OwnGoals() {
  const { data, updateSettings } = useStore();
  const goals = data.settings.goals ?? [];
  const [form, setForm] = useState({ name: '', target: '', by: addMonths(thisMonth(), 12) });
  const save = (list: typeof goals) => updateSettings({ goals: list });
  return (
    <section className="panel" aria-labelledby="own">
      <h2 id="own">Our own goals</h2>
      {!goals.length && <p className="muted">A car, a holiday, a trip home: add what you're saving for and the app works out a month's amount.</p>}
      <ul className="own-goals">
        {goals.map((g) => {
          const share = g.target ? Math.min(1, g.saved / g.target) : 0;
          const left = Math.max(0, g.target - g.saved);
          const months = g.by ? Math.max(1, monthsUntil(g.by)) : 0;
          return (
            <li key={g.id}>
              <div className="own-head"><b>{g.name}</b><button className="icon-btn" aria-label={`Remove ${g.name}`} onClick={() => save(goals.filter((x) => x.id !== g.id))}><Trash2 size={15} /></button></div>
              <div className="progress" role="img" aria-label={`${Math.round(share * 100)}% saved`}><span style={{ width: `${share * 100}%` }} /></div>
              <p className="own-line">
                <span>Saved <NumberField label={`${g.name} saved so far`} value={g.saved} width="6em" onSave={(n) => save(goals.map((x) => (x.id === g.id ? { ...x, saved: n } : x)))} /> of {money(g.target)}</span>
                <span className="muted">{left <= 0 ? 'Reached' : g.by ? `about ${money(left / months)} a month to ${monthName(g.by)}` : `${money(left)} to go`}</span>
              </p>
            </li>
          );
        })}
      </ul>
      <details className="add">
        <summary>Add a goal</summary>
        <form className="stack-form" onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim() || !Number(form.target)) return;
          save([...goals, { id: id(), name: form.name.trim(), target: Number(form.target), saved: 0, by: form.by || undefined }]);
          setForm({ ...form, name: '', target: '' });
        }}>
          <label>What for<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. New car" /></label>
          <label>How much<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.replace(/[^\d.]/g, '') })} /></span></label>
          <label>Wanted by<input type="month" value={form.by} min={thisMonth()} onChange={(e) => setForm({ ...form, by: e.target.value })} /></label>
          <button className="btn small primary">Add goal</button>
        </form>
      </details>
    </section>
  );
}

/** Baby step 2: every debt except the home, paid smallest balance first (the snowball). */
export function Debts() {
  const { data, updateSettings } = useStore();
  const debts = [...(data.settings.debts ?? [])].sort((a, b) => a.balance - b.balance);
  const open = debts.filter((d) => d.balance > 0);
  const [form, setForm] = useState({ name: '', balance: '', rate: '', minimum: '' });
  const save = (list: typeof debts) => updateSettings({ debts: list });
  return (
    <section className="panel" aria-labelledby="debts">
      <h2 id="debts">Debts other than the house</h2>
      {!debts.length ? <p className="muted">None added. A credit card paid in full every month isn't a debt here. Add a car loan, a personal loan or a card balance carried over, and the app orders them smallest first.</p> : (
        <ol className="debt-list">
          {debts.map((d) => (
            <li key={d.id} className={d.balance <= 0 ? 'is-paid' : open[0]?.id === d.id ? 'is-next' : ''}>
              <span><b>{d.name}</b><small>{d.balance <= 0 ? 'Paid off' : open[0]?.id === d.id ? 'Pay this one first: the minimum on the rest, everything spare here' : `${d.rate ? `${d.rate}% a year` : ''}${d.minimum ? `${d.rate ? ', ' : ''}minimum ${money(d.minimum)} a month` : ''}`}</small></span>
              <NumberField label={`${d.name} balance`} value={d.balance} width="6em" onSave={(n) => save(debts.map((x) => (x.id === d.id ? { ...x, balance: n } : x)))} />
              <button className="icon-btn" aria-label={`Remove ${d.name}`} onClick={() => save(debts.filter((x) => x.id !== d.id))}><Trash2 size={15} /></button>
            </li>
          ))}
        </ol>
      )}
      {open.length > 0 && <p className="fine">Together {money(open.reduce((a, d) => a + d.balance, 0))} owed.</p>}
      <details className="add">
        <summary>Add a debt</summary>
        <form className="stack-form" onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim() || !Number(form.balance)) return;
          save([...debts, { id: id(), name: form.name.trim(), balance: Number(form.balance), rate: Number(form.rate) || undefined, minimum: Number(form.minimum) || undefined }]);
          setForm({ name: '', balance: '', rate: '', minimum: '' });
        }}>
          <label>What<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Car loan" /></label>
          <label>Owed now<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value.replace(/[^\d.]/g, '') })} /></span></label>
          <label>Interest a year (%)<input inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value.replace(/[^\d.]/g, '') })} /></label>
          <label>Minimum a month<span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" value={form.minimum} onChange={(e) => setForm({ ...form, minimum: e.target.value.replace(/[^\d.]/g, '') })} /></span></label>
          <button className="btn small primary">Add debt</button>
        </form>
      </details>
    </section>
  );
}
