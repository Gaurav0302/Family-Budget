import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Info, PageHeader } from '../components/bits';
import { label } from '../data/categories';
import { useStore } from '../data/store';
import { download } from '../lib/format';

export function SettingsScreen() {
  const { data, updateSettings, deleteRule, signOut, email, mode, backup, resetLocal } = useStore();
  const s = data.settings;

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
        <h2>Accounts, categories and payees</h2>
        <div className="btn-row">
          <Link className="btn" to="/accounts">Accounts</Link>
          <Link className="btn" to="/categories">Categories &amp; payees</Link>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Your sorting rules</h2><Info>Older rules from before the payee list. They only decide for payees the app hasn't seen before. Delete one if it sorts things wrongly.</Info></div>
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
