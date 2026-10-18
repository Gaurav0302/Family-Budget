import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/bits';
import { CATEGORIES, GROUPS, label } from '../data/categories';
import { Info } from '../components/bits';
import { useStore } from '../data/store';
import type { Account, Category } from '../data/types';
import { download } from '../lib/format';

export function SettingsScreen() {
  const { data, updateSettings, deleteRule, signOut, email, mode, backup, resetLocal } = useStore();
  const s = data.settings;
  const [newAcc, setNewAcc] = useState<Account>({ key: '', name: '', owner: '', type: 'offset' });
  const [newCat, setNewCat] = useState<{ label: string; group: string; type: 'need' | 'want' }>({ label: '', group: 'Kids & school', type: 'want' });
  const hidden = s.hiddenCategories ?? [];
  const used = new Set(data.transactions.map((t) => t.category));
  const toggle = (id: string, show: boolean) => updateSettings({ hiddenCategories: show ? hidden.filter((h) => h !== id) : [...hidden, id] });

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
              <input aria-label="Account name" defaultValue={a.name} onBlur={(e) => { if (e.target.value !== a.name) updateSettings({ accounts: s.accounts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }); }} />
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
        <div className="panel-head"><h2>Categories</h2><Info>Untick a category you don't use and it disappears from the budget and lists (past transactions keep it). Add your own, like a new class for the kids.</Info></div>
        {GROUPS.map((g) => {
          const cats = CATEGORIES.filter((c) => c.group === g && !c.system);
          if (!cats.length) return null;
          return (
            <details key={g} className="cat-group">
              <summary>{g} <small>{cats.filter((c) => !hidden.includes(c.id)).length} of {cats.length} shown</small></summary>
              <ul className="cat-manage">
                {cats.map((c) => (
                  <li key={c.id}>
                    <label className="check small"><input type="checkbox" checked={!hidden.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} /><span>{c.label}{c.custom && <small> (yours)</small>}</span></label>
                    {c.custom && !used.has(c.id) && <button className="icon-btn" aria-label={`Delete ${c.label}`} onClick={() => updateSettings({ customCategories: (s.customCategories ?? []).filter((x) => x.id !== c.id) })}><Trash2 size={15} /></button>}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        <form className="inline-form" onSubmit={(e) => {
          e.preventDefault();
          if (!newCat.label.trim()) return;
          const id = `custom-${newCat.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          if (CATEGORIES.some((c) => c.id === id)) return;
          const cat: Category = { id, label: newCat.label.trim(), group: newCat.group, type: newCat.type };
          updateSettings({ customCategories: [...(s.customCategories ?? []), cat] });
          setNewCat({ ...newCat, label: '' });
        }}>
          <input placeholder="New category, e.g. Singing lessons" value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} aria-label="New category name" />
          <select value={newCat.group} onChange={(e) => setNewCat({ ...newCat, group: e.target.value })} aria-label="Group">{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
          <select value={newCat.type} onChange={(e) => setNewCat({ ...newCat, type: e.target.value as 'need' | 'want' })} aria-label="Need or want"><option value="want">Want</option><option value="need">Need</option></select>
          <button className="btn small">Add category</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Your sorting rules</h2><Info>Made when you tick “Always sort similar transactions” on a transaction. They're tried before the built-in ones. Delete one if it sorts things wrongly.</Info></div>
        {data.rules.length ? (
          <details><summary>Show {data.rules.length} rule{data.rules.length === 1 ? '' : 's'}</summary>
          <ul className="rule-list">
            {data.rules.map((r) => (
              <li key={r.id}><span>“{r.pattern.replace(/\\/g, '')}” → <b>{label(r.category)}</b></span>
                <button className="icon-btn" onClick={() => deleteRule(r.id)} aria-label={`Delete rule for ${r.pattern}`}><Trash2 size={16} /></button></li>
            ))}
          </ul>
          </details>
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
