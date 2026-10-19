import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { people } from '../data/wealth';
import { Link } from 'react-router-dom';
import { Info, PageHeader } from '../components/bits';
import { label } from '../data/categories';
import { useStore } from '../data/store';
import { ThemePicker } from '../theme/ThemePicker';
import { download } from '../lib/format';
import { today as todayLocal } from '../lib/format';

export function SettingsScreen() {
  const { data, deleteRule, signOut, email, mode, backup, resetLocal, updateSettings, changePassword } = useStore();
  const [pw, setPw] = useState({ a: '', b: '', msg: '' });

  return (
    <div className="settings">
      <PageHeader title="Settings" />

      <section className="panel">
        <h2>Household</h2>
        <label className="lp-field"><span>Household name</span>
          <input defaultValue={data.settings.household} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== data.settings.household && updateSettings({ household: e.target.value.trim() })} /></label>
        <p className="fine">People in the household come from their pay on <Link to="/wealth?tab=income">Wealth → Income &amp; super</Link>{people(data.settings).length ? `: ${people(data.settings).join(', ')}` : ''}.</p>
      </section>

      {mode === 'supabase' && (
        <section className="panel">
          <h2>Your login</h2>
          <p>Signed in as <b>{email}</b>.</p>
          <details>
            <summary>Change your password</summary>
            <form className="stack-form" onSubmit={async (e) => {
              e.preventDefault();
              if (pw.a.length < 8) return setPw({ ...pw, msg: 'Use at least 8 characters.' });
              if (pw.a !== pw.b) return setPw({ ...pw, msg: "The two passwords don't match." });
              const err = await changePassword(pw.a);
              setPw({ a: '', b: '', msg: err ? `Not changed: ${err}` : 'Password changed. Use it next time you sign in.' });
            }}>
              <label>New password<input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value, msg: '' })} /></label>
              <label>Type it again<input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value, msg: '' })} /></label>
              <button className="btn small primary">Change password</button>
              {pw.msg && <p role="status">{pw.msg}</p>}
            </form>
          </details>
          <button className="btn" onClick={() => signOut()}>Sign out</button>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Look</h2><Info>Your choice is just for you{email ? ` (${email})` : ''}: the rest of the family keeps theirs. It follows you to any device you sign in on. Every theme has a light and a dark version, and all text meets accessibility contrast.</Info></div>
        <details className="look-details">
          <summary>Change the look</summary>
          <ThemePicker />
        </details>
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
          <button className="btn" onClick={() => download(`family-budget-backup-${todayLocal()}.json`, JSON.stringify(backup()))}>Download a backup</button>
          <Link className="btn" to="/transactions">Transactions as a spreadsheet (CSV)</Link>
          {mode === 'local' && <button className="btn danger" onClick={() => { if (confirm('Delete all demo data in this browser?')) resetLocal(); }}>Clear demo data</button>}
        </div>
      </section>
    </div>
  );
}
