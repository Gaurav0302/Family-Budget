import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Info, PageHeader } from '../components/bits';
import { Menu } from '../components/Menu';
import { useStore } from '../data/store';
import type { Account, Settings } from '../data/types';
import { people } from '../data/wealth';
import { longDate, money } from '../lib/format';

const TYPES: Record<Account['type'], string> = { everyday: 'Everyday', savings: 'Savings', offset: 'Offset', card: 'Credit card', loan: 'Home loan', paypal: 'PayPal' };
/** The colour family each type belongs to. */
export const KIND: Record<Account['type'], 'spend' | 'save' | 'offset' | 'loan'> = { everyday: 'spend', card: 'spend', paypal: 'spend', savings: 'save', offset: 'offset', loan: 'loan' };
const KIND_LABEL = { spend: 'Spending', save: 'Savings', offset: 'Offset', loan: 'Loan' };
import { today } from '../lib/format';

/** "G", "R" or "G+R": who an account belongs to, coloured the same way everywhere. */
export function OwnerBadge({ owner, s }: { owner: string; s: Settings }) {
  const ps = people(s).filter((p) => p !== 'Joint');
  const i = ps.indexOf(owner);
  const text = i >= 0 ? owner[0] : ps.map((p) => p[0]).join('+') || 'J';
  return <span className={`owner owner-${i >= 0 ? Math.min(i, 2) + 1 : 'joint'}`} title={i >= 0 ? owner : 'Joint'} aria-label={i >= 0 ? owner : 'Joint'}>{text}</span>;
}

const latest = (s: Settings, key: string) => s.balances.filter((b) => b.account === key).sort((x, y) => y.date.localeCompare(x.date));

function AccountRow({ a }: { a: Account }) {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const set = (patch: Partial<Account>) => updateSettings({ accounts: s.accounts.map((x) => (x.key === a.key ? { ...x, ...patch } : x)) });
  const balances = latest(s, a.key);
  const [panel, setPanel] = useState<'balance' | 'edit' | 'history' | 'close' | null>(null);
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState(today());
  const owners = [...new Set([...people(s), 'Joint'])];
  const closed = !!a.closedOn;
  const used = data.transactions.some((t) => t.account === a.key);
  const kind = KIND[a.type];
  const toggle = (p: typeof panel) => setPanel(panel === p ? null : p);
  const movedTo = s.accounts.find((x) => x.key === a.movedTo)?.name;

  return (
    <li className={`acct kind-${kind} ${closed ? 'is-closed' : ''}`}>
      <div className="acct-row">
        <OwnerBadge owner={a.owner} s={s} />
        <div className="acct-main">
          <b>{a.name.replace(/ \(.*\)$/, '')}</b>
          <small><span className={`kind-tag kind-${kind}`}>{KIND_LABEL[kind]}</span>{a.bank ? ` ${a.bank}` : ''}{a.last4 ? ` ••${a.last4}` : ''}{closed ? ` · closed ${longDate(a.closedOn!)}${movedTo ? `, moved to ${movedTo}` : ''}` : ''}</small>
        </div>
        <button className="acct-bal" onClick={() => toggle('balance')} aria-label={`Update ${a.name} balance`}>
          {balances[0] ? <><b>{money(balances[0].amount)}</b><small>{longDate(balances[0].date)}</small></> : <small>Add balance</small>}
        </button>
        <Menu label={`${a.name} options`} items={[
          { label: 'Update balance', onClick: () => setPanel('balance') },
          balances.length > 0 && { label: `Balance history (${balances.length})`, onClick: () => setPanel('history') },
          { label: 'Edit details', onClick: () => setPanel('edit') },
          closed ? { label: 'Reopen', onClick: () => set({ closedOn: undefined, movedTo: undefined }) } : { label: 'Close this account', onClick: () => setPanel('close') },
          !used && { label: 'Delete', danger: true, onClick: () => updateSettings({ accounts: s.accounts.filter((x) => x.key !== a.key) }) },
        ]} />
      </div>

      {panel === 'balance' && (
        <form className="acct-panel inline-form" onSubmit={(e) => { e.preventDefault(); if (!amt) return; updateSettings({ balances: [...s.balances.filter((b) => !(b.account === a.key && b.date === date)), { account: a.key, date, amount: Number(amt) }] }); setAmt(''); setPanel(null); }}>
          <span className="money-input"><span aria-hidden>$</span><input autoFocus inputMode="decimal" placeholder="Balance" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.-]/g, ''))} aria-label={`${a.name} balance`} /></span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Balance date" />
          <button className="btn small primary">Save</button>
          <button type="button" className="btn small ghost" onClick={() => setPanel(null)}>Cancel</button>
        </form>
      )}
      {panel === 'history' && (
        <div className="acct-panel">
          <ul className="value-list">
            {balances.map((b) => (
              <li key={b.date}><span>{longDate(b.date)}</span><span className="row-gap">{money(b.amount, { cents: true })}
                <button className="icon-btn" aria-label={`Delete the balance on ${longDate(b.date)}`} onClick={() => updateSettings({ balances: s.balances.filter((x) => !(x.account === a.key && x.date === b.date)) })}><Trash2 size={14} /></button></span></li>
            ))}
          </ul>
          <button className="btn small ghost" onClick={() => setPanel(null)}>Done</button>
        </div>
      )}
      {panel === 'edit' && (
        <div className="acct-panel">
          <div className="fund-fields">
            <label>Name<input defaultValue={a.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.name) set({ name: e.target.value.trim() }); }} /></label>
            <label>Bank<input defaultValue={a.bank ?? ''} placeholder="e.g. CommBank" onBlur={(e) => e.target.value !== (a.bank ?? '') && set({ bank: e.target.value })} /></label>
            <label>Type<select value={a.type} onChange={(e) => set({ type: e.target.value as Account['type'] })}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Whose<select value={a.owner} onChange={(e) => set({ owner: e.target.value })}>{owners.map((o) => <option key={o}>{o}</option>)}</select></label>
            <label>Last 4 digits<input inputMode="numeric" maxLength={4} defaultValue={a.last4 ?? ''} placeholder="1234" onBlur={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v !== (a.last4 ?? '')) set({ last4: v }); }} /></label>
            <label>Opened<input type="date" defaultValue={a.openedOn ?? ''} onBlur={(e) => e.target.value !== (a.openedOn ?? '') && set({ openedOn: e.target.value || undefined })} /></label>
          </div>
          <label className="check small"><input type="checkbox" checked={!!a.core} onChange={(e) => set({ core: e.target.checked })} />
            <span>Needed for a complete month <small>Tick for accounts you spend from: a month only counts once their statements are in.</small></span></label>
          <button className="btn small ghost" onClick={() => setPanel(null)}>Done</button>
        </div>
      )}
      {panel === 'close' && (
        <div className="acct-panel">
          <div className="fund-fields">
            <label>Closed on<input type="date" defaultValue={a.closedOn ?? today()} id={`close-${a.key}`} /></label>
            <label>Money moved to<select defaultValue={a.movedTo ?? ''} id={`moved-${a.key}`}>
              <option value="">Not moved</option>
              {s.accounts.filter((x) => x.key !== a.key && !x.closedOn).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select></label>
          </div>
          <span className="row-gap">
            <button className="btn small primary" onClick={() => {
              const d = (document.getElementById(`close-${a.key}`) as HTMLInputElement).value;
              const m = (document.getElementById(`moved-${a.key}`) as HTMLSelectElement).value;
              if (d) set({ closedOn: d, movedTo: m || undefined });
              setPanel(null);
            }}>Close account</button>
            <button className="btn small ghost" onClick={() => setPanel(null)}>Cancel</button>
          </span>
        </div>
      )}
    </li>
  );
}

export function Accounts() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('offset');
  const [owner, setOwner] = useState('Joint');
  const ps = people(s).filter((p) => p !== 'Joint');
  const open = s.accounts.filter((a) => !a.closedOn);
  const closed = s.accounts.filter((a) => a.closedOn);
  const groups = [...ps, 'Joint'].map((o) => ({ o, list: open.filter((a) => (o === 'Joint' ? !ps.includes(a.owner) : a.owner === o)) })).filter((g) => g.list.length);
  const totals = (['spend', 'save', 'offset'] as const).map((k) => ({ k, sum: open.filter((a) => KIND[a.type] === k).reduce((t, a) => t + (latest(s, a.key)[0]?.amount ?? 0), 0), n: open.filter((a) => KIND[a.type] === k).length })).filter((x) => x.n);

  return (
    <div className="accounts">
      <PageHeader title="Accounts">
        <Info>Your bank accounts, cards and loans. Tap a balance to update it; ⋯ for details, history or closing. The last 4 digits tie statements to the right account. When savings move to an offset, close the old account and say where the money went: its history stays.</Info>
      </PageHeader>
      <div className="acct-totals">
        {totals.map((t) => <div key={t.k} className={`kind-${t.k}`}><span>{KIND_LABEL[t.k]}</span><b>{money(t.sum)}</b></div>)}
      </div>
      {groups.map((g) => (
        <section key={g.o} className="panel acct-group">
          <h2><OwnerBadge owner={g.o} s={s} /> {g.o === 'Joint' ? 'Joint' : g.o}</h2>
          <ul className="acct-list-new">{g.list.map((a) => <AccountRow key={a.key} a={a} />)}</ul>
        </section>
      ))}
      {adding ? (
        <section className="panel">
          <form className="new-cat" onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            let key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            while (s.accounts.some((a) => a.key === key)) key += '-2';
            updateSettings({ accounts: [...s.accounts, { key, name: name.trim(), owner, type, openedOn: today() }] });
            setName(''); setAdding(false);
          }}>
            <input autoFocus placeholder="e.g. Offset 1" value={name} onChange={(e) => setName(e.target.value)} aria-label="New account name" />
            <select value={type} onChange={(e) => setType(e.target.value as Account['type'])} aria-label="Type">{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Whose">{[...ps, 'Joint'].map((o) => <option key={o}>{o}</option>)}</select>
            <span className="row-gap"><button className="btn small primary">Add account</button><button type="button" className="btn small ghost" onClick={() => setAdding(false)}>Cancel</button></span>
          </form>
        </section>
      ) : <button className="btn small add-acct-btn" onClick={() => setAdding(true)}>＋ Add an account</button>}
      {closed.length > 0 && (
        <details className="panel acct-group closed-group">
          <summary>Closed accounts ({closed.length})</summary>
          <ul className="acct-list-new">{closed.map((a) => <AccountRow key={a.key} a={a} />)}</ul>
        </details>
      )}
    </div>
  );
}
