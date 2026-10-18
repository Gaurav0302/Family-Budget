import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/bits';
import { label } from '../data/categories';
import { useStore } from '../data/store';
import type { Account } from '../data/types';
import { download } from '../lib/format';

export function SettingsScreen() {
  const { data, updateSettings, deleteRule, signOut, email, mode, backup, resetLocal } = useStore();
  const s = data.settings;
  const [newAcc, setNewAcc] = useState<Account>({ key: '', name: '', owner: '', type: 'offset' });

  return (
    <div className="settings">
      <PageHeader title="Settings" />

      <section className="panel">
        <h2>Look</h2>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {(['auto', 'light', 'dark'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={s.theme === t} className={s.theme === t ? 'on' : ''} onClick={() => updateSettings({ theme: t })}>
              {t === 'auto' ? 'Match my device' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Accounts</h2>
        <p className="muted">Accounts marked “needed for a complete month” must be loaded before a month counts in trends.</p>
        <ul className="acct-list">
          {s.accounts.map((a, i) => (
            <li key={a.key}>
              <input aria-label="Account name" value={a.name} onChange={(e) => updateSettings({ accounts: s.accounts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <label className="check small"><input type="checkbox" checked={!!a.core} onChange={(e) => updateSettings({ accounts: s.accounts.map((x, j) => (j === i ? { ...x, core: e.target.checked } : x)) })} /><span>Needed for a complete month</span></label>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={(e) => {
          e.preventDefault();
          if (!newAcc.name.trim()) return;
          const key = newAcc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          updateSettings({ accounts: [...s.accounts, { ...newAcc, key }] });
          setNewAcc({ key: '', name: '', owner: '', type: 'offset' });
        }}>
          <input placeholder="New account, e.g. Unity offset" value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} aria-label="New account name" />
          <select value={newAcc.type} onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value as Account['type'] })} aria-label="Account type">
            <option value="everyday">Everyday</option><option value="savings">Savings</option><option value="offset">Offset</option>
            <option value="loan">Home loan</option><option value="card">Credit card</option>
          </select>
          <button className="btn small">Add account</button>
        </form>
      </section>

      <section className="panel">
        <h2>Your sorting rules</h2>
        <p className="muted">Made when you tick “Always sort similar transactions”. They're tried before the built-in ones.</p>
        {data.rules.length ? (
          <ul className="rule-list">
            {data.rules.map((r) => (
              <li key={r.id}><span>“{r.pattern.replace(/\\/g, '')}” → <b>{label(r.category)}</b></span>
                <button className="icon-btn" onClick={() => deleteRule(r.id)} aria-label={`Delete rule for ${r.pattern}`}><Trash2 size={16} /></button></li>
            ))}
          </ul>
        ) : <p>None yet.</p>}
      </section>

      <section className="panel">
        <h2>Your data</h2>
        <p>{mode === 'supabase' ? <>Stored in your private Supabase database. Signed in as <b>{email}</b>.</> : 'Demo mode: everything is kept in this browser only.'}</p>
        <div className="btn-row">
          <button className="btn" onClick={() => download(`family-budget-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup()))}>Download a backup</button>
          {mode === 'supabase' && <button className="btn" onClick={() => signOut()}>Sign out</button>}
          {mode === 'local' && <button className="btn danger" onClick={() => { if (confirm('Delete all demo data in this browser?')) resetLocal(); }}>Clear demo data</button>}
        </div>
      </section>
    </div>
  );
}
