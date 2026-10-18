import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Info, PageHeader } from '../components/bits';
import { useStore } from '../data/store';
import type { Account } from '../data/types';
import { people } from '../data/wealth';
import { longDate, money } from '../lib/format';

const TYPES: Record<Account['type'], string> = { everyday: 'Everyday', savings: 'Savings', offset: 'Offset', card: 'Credit card', loan: 'Home loan', paypal: 'PayPal' };
const today = () => new Date().toLocaleDateString('en-CA');   // local date, YYYY-MM-DD

function AccountCard({ a }: { a: Account }) {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const set = (patch: Partial<Account>) => updateSettings({ accounts: s.accounts.map((x) => (x.key === a.key ? { ...x, ...patch } : x)) });
  const balances = s.balances.filter((b) => b.account === a.key).sort((x, y) => y.date.localeCompare(x.date));
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState(today());
  const [showAll, setShowAll] = useState(false);
  const owners = [...new Set([...people(s), 'Joint'])];
  const closed = !!a.closedOn;
  const used = data.transactions.filter((t) => t.account === a.key).length;

  return (
    <section className={`panel account ${closed ? 'is-closed' : ''}`}>
      <div className="acct-head">
        <input className="acct-name" aria-label="Account name" defaultValue={a.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.name) set({ name: e.target.value.trim() }); }} />
        {closed && <span className="pill pill-quiet">Closed {longDate(a.closedOn!)}</span>}
      </div>
      <div className="fund-fields">
        <label>Bank<input defaultValue={a.bank ?? ''} placeholder="e.g. CommBank" onBlur={(e) => e.target.value !== (a.bank ?? '') && set({ bank: e.target.value })} /></label>
        <label>Type<select value={a.type} onChange={(e) => set({ type: e.target.value as Account['type'] })}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Whose<select value={a.owner} onChange={(e) => set({ owner: e.target.value })}>{owners.map((o) => <option key={o}>{o}</option>)}</select></label>
        <label>Last 4 digits<input inputMode="numeric" maxLength={4} defaultValue={a.last4 ?? ''} placeholder="1234" onBlur={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v !== (a.last4 ?? '')) set({ last4: v }); }} /></label>
        <label>Opened<input type="date" defaultValue={a.openedOn ?? ''} onBlur={(e) => e.target.value !== (a.openedOn ?? '') && set({ openedOn: e.target.value || undefined })} /></label>
      </div>
      <label className="check small"><input type="checkbox" checked={!!a.core} onChange={(e) => set({ core: e.target.checked })} />
        <span>Spending account <small>A month only counts as complete once this account's statement is in.</small></span></label>

      <h3 className="sub">Balance</h3>
      {balances[0] ? <p><b className="num">{money(balances[0].amount, { cents: true })}</b> <span className="muted">on {longDate(balances[0].date)}</span></p> : <p className="muted">No balance yet.</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (!amt) return; updateSettings({ balances: [...s.balances.filter((b) => !(b.account === a.key && b.date === date)), { account: a.key, date, amount: Number(amt) }] }); setAmt(''); }}>
        <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" placeholder="Balance" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.-]/g, ''))} aria-label={`${a.name} balance`} /></span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Balance date" />
        <button className="btn small">Save balance</button>
      </form>
      {balances.length > 1 && (
        <details className="add" open={showAll} onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
          <summary>Earlier balances ({balances.length - 1})</summary>
          <ul className="value-list">
            {balances.slice(1).map((b) => (
              <li key={b.date}><span>{longDate(b.date)}</span><span>{money(b.amount, { cents: true })}
                <button className="icon-btn" aria-label="Delete this balance" onClick={() => updateSettings({ balances: s.balances.filter((x) => !(x.account === a.key && x.date === b.date)) })}><Trash2 size={14} /></button></span></li>
            ))}
          </ul>
        </details>
      )}

      <details className="add">
        <summary>{closed ? 'Reopen or change closing' : 'Close this account'}</summary>
        <div className="fund-fields">
          <label>Closed on<input type="date" defaultValue={a.closedOn ?? ''} onBlur={(e) => e.target.value !== (a.closedOn ?? '') && set({ closedOn: e.target.value || undefined })} /></label>
          <label>Money moved to<select value={a.movedTo ?? ''} onChange={(e) => set({ movedTo: e.target.value || undefined })}>
            <option value="">Not moved</option>
            {s.accounts.filter((x) => x.key !== a.key).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
          </select></label>
        </div>
        {closed && <button className="btn small" onClick={() => set({ closedOn: undefined, movedTo: undefined })}>Reopen</button>}
        {!used && <button className="btn small danger" onClick={() => updateSettings({ accounts: s.accounts.filter((x) => x.key !== a.key) })}>Delete account (no transactions)</button>}
      </details>
    </section>
  );
}

export function Accounts() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('offset');
  const open = s.accounts.filter((a) => !a.closedOn);
  const closed = s.accounts.filter((a) => a.closedOn);
  return (
    <div className="accounts">
      <PageHeader title="Accounts">
        <Info>Your bank accounts, cards and loans. The last 4 digits let statements and transfers between your own accounts tie up automatically. When an account closes (for example savings moving to an offset), close it here: its history stays.</Info>
      </PageHeader>
      <div className="wealth-grid">{open.map((a) => <AccountCard key={a.key} a={a} />)}</div>
      <section className="panel add-account">
        <h2>Add an account</h2>
        <form className="inline-form" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          let key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          while (s.accounts.some((a) => a.key === key)) key += '-2';
          updateSettings({ accounts: [...s.accounts, { key, name: name.trim(), owner: 'Joint', type, openedOn: today() }] });
          setName('');
        }}>
          <input placeholder="e.g. Unity offset 1" value={name} onChange={(e) => setName(e.target.value)} aria-label="New account name" />
          <select value={type} onChange={(e) => setType(e.target.value as Account['type'])} aria-label="Type">{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className="btn small primary">Add account</button>
        </form>
      </section>
      {closed.length > 0 && <><h2 className="section-title">Closed</h2><div className="wealth-grid">{closed.map((a) => <AccountCard key={a.key} a={a} />)}</div></>}
    </div>
  );
}
