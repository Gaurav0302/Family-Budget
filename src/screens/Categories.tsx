import { Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CategorySelect } from '../components/CategorySelect';
import { Info, PageHeader, Tabs } from '../components/bits';
import { average, completeMonths, summarise } from '../data/analysis';
import { CATEGORIES, GROUPS, label } from '../data/categories';
import { findPayee, kindForCategory } from '../data/payees';
import { useStore } from '../data/store';
import type { Category, Payee, Transaction } from '../data/types';
import { dayName, money } from '../lib/format';

function usePayeeStats() {
  const { data, payeeIdx } = useStore();
  return useMemo(() => {
    const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const from = yearAgo.toISOString().slice(0, 10);
    const stats = new Map<string, { count: number; total: number; last: string; txs: Transaction[] }>();
    for (const t of data.transactions) {
      const p = findPayee(t, payeeIdx);
      if (!p) continue;
      const s = stats.get(p.id) ?? { count: 0, total: 0, last: '', txs: [] };
      s.count++; s.txs.push(t);
      if (t.date >= from) s.total -= t.amount;
      if (t.date > s.last) s.last = t.date;
      stats.set(p.id, s);
    }
    return stats;
  }, [data.transactions, payeeIdx]);
}

/** Change a payee's category, asking whether past payments move too. */
function CategoryChange({ payee, count, onDone }: { payee: Payee; count: number; onDone?: (msg: string) => void }) {
  const { setPayee } = useStore();
  const [pending, setPending] = useState<string | null>(null);
  if (pending) return (
    <div className="confirm">
      <span>Move to {label(pending)}:</span>
      <button className="btn small primary" onClick={async () => { const n = await setPayee(payee.id, { category: pending, kind: kindForCategory(pending), checked: true }, true); setPending(null); onDone?.(`${payee.name}: ${n} payment${n === 1 ? '' : 's'} moved to ${label(pending)}.`); }}>All {count} payments</button>
      <button className="btn small" onClick={async () => { await setPayee(payee.id, { category: pending, kind: kindForCategory(pending), checked: true }, false); setPending(null); onDone?.(`${payee.name}: new payments will go to ${label(pending)}.`); }}>Only new ones</button>
      <button className="btn small ghost" onClick={() => setPending(null)}>Cancel</button>
    </div>
  );
  return <CategorySelect small label={`Category for ${payee.name}`} value={payee.category} onChange={(c) => (count ? setPending(c) : setPayee(payee.id, { category: c, kind: kindForCategory(c), checked: true }, false))} />;
}

function PayeeSheet({ payee, onClose }: { payee: Payee; onClose: () => void }) {
  const { data, setPayee, mergePayees } = useStore();
  const stats = usePayeeStats().get(payee.id);
  const [name, setName] = useState(payee.name);
  const [pattern, setPattern] = useState('');
  const [into, setInto] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const others = data.payees.filter((p) => p.id !== payee.id).sort((a, b) => a.name.localeCompare(b.name));
  const recent = (stats?.txs ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const acct = (k: string) => data.settings.accounts.find((a) => a.key === k)?.name.replace(/ \(.*\)$/, '') ?? k;

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="payee-title" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="payee-title">{payee.name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <p className="muted">{stats ? `${stats.count} payments, ${money(stats.total)} in the last year.` : 'No payments yet.'}</p>
        {msg && <p className="ok" role="status">{msg}</p>}
        <label htmlFor="pname">Name</label>
        <input id="pname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== payee.name) setPayee(payee.id, { name: name.trim() }, false); }} />
        <label>Category</label>
        <CategoryChange payee={payee} count={stats?.count ?? 0} onDone={setMsg} />
        <label className="check"><input type="checkbox" checked={!!payee.askEachTime} onChange={(e) => setPayee(payee.id, { askEachTime: e.target.checked }, false)} />
          <span>Ask me each time <small>For payees where the purpose changes, like money sent overseas. New payments wait under "Needs your input".</small></span></label>
        <label>Bank wording it matches <Info>The app recognises this payee from the bank's description. Add extra wording if the same payee appears under different names.</Info></label>
        <ul className="chips">
          {payee.match.map((m) => <li key={`m${m}`} className="chip-static">{m}</li>)}
          {(payee.patterns ?? []).map((p) => (
            <li key={`p${p}`} className="chip-static">contains “{p}”<button aria-label={`Remove ${p}`} onClick={() => setPayee(payee.id, { patterns: (payee.patterns ?? []).filter((x) => x !== p) }, true)}>×</button></li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (!pattern.trim()) return; setPayee(payee.id, { patterns: [...(payee.patterns ?? []), pattern.trim()] }, true); setPattern(''); }}>
          <input placeholder="e.g. PAYPAL *UBEREATS" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Description contains" />
          <button className="btn small">Add wording</button>
        </form>
        <label htmlFor="merge">Same as another payee?</label>
        <div className="inline-form">
          <select id="merge" value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">Choose the payee to combine with…</option>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn small" disabled={!into} onClick={async () => { await mergePayees(payee.id, into); onClose(); }}>Combine</button>
        </div>
        {recent.length > 0 && (
          <>
            <h3 className="sub">Recent payments</h3>
            <ul className="dg-list">{recent.map((t) => <li key={t.id}><span className="dg-date">{dayName(t.date)}<small>{acct(t.account)}</small></span><span className="dg-amt">{money(t.amount, { cents: true })}</span><span className="muted">{label(t.category)}{t.manual ? ' (set by hand)' : ''}</span></li>)}</ul>
          </>
        )}
      </div>
    </div>
  );
}

function PayeesTab() {
  const { data, setPayee, markChecked } = useStore();
  const [params, setParams] = useSearchParams();
  const stats = usePayeeStats();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'check' | 'ask' | 'all'>(data.payees.some((p) => !p.checked) ? 'check' : 'all');
  const [msg, setMsg] = useState<string | null>(null);
  const open = data.payees.find((p) => p.id === params.get('payee'));
  const list = data.payees
    .filter((p) => (filter === 'check' ? !p.checked : filter === 'ask' ? p.askEachTime : true))
    .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase()) || label(p.category).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (stats.get(b.id)?.total ?? 0) - (stats.get(a.id)?.total ?? 0));
  const toCheck = data.payees.filter((p) => !p.checked).length;

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search payees or categories" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search payees" />
        <button className={`chip ${filter === 'check' ? 'on' : ''}`} onClick={() => setFilter('check')}>To check <b>{toCheck}</b></button>
        <button className={`chip ${filter === 'ask' ? 'on' : ''}`} onClick={() => setFilter('ask')}>Ask each time</button>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All <b>{data.payees.length}</b></button>
      </div>
      {msg && <p className="ok" role="status">{msg}</p>}
      {filter === 'check' && list.length > 0 && <p className="muted">Check each payee's category, then tick it. Biggest spending first. <button className="link" onClick={() => markChecked(list.map((p) => p.id))}>Tick all {list.length} as checked</button></p>}
      <ul className="payee-list">
        {list.map((p) => {
          const st = stats.get(p.id);
          return (
            <li key={p.id} className={p.checked ? '' : 'unchecked'}>
              <button className="payee-name" onClick={() => setParams({ tab: 'payees', payee: p.id }, { replace: true })}>
                <b>{p.name}</b><small>{st ? `${st.count} payment${st.count === 1 ? '' : 's'}, ${money(st.total)} last year` : 'no payments'}{p.askEachTime ? ', ask each time' : ''}</small>
              </button>
              <CategoryChange payee={p} count={st?.count ?? 0} onDone={setMsg} />
              {!p.checked && <button className="btn small" onClick={() => setPayee(p.id, { checked: true }, false)}>Looks right</button>}
            </li>
          );
        })}
      </ul>
      {!list.length && <p className="muted">{filter === 'check' ? 'All payees checked.' : 'No payees match.'}</p>}
      {open && <PayeeSheet payee={open} onClose={() => setParams({ tab: 'payees' }, { replace: true })} />}
    </>
  );
}

function CategoriesTab() {
  const { data, updateSettings } = useStore();
  const [, setParams] = useSearchParams();
  const s = data.settings;
  const hidden = s.hiddenCategories ?? [];
  const complete = completeMonths(data).slice(-3);
  const sums = useMemo(() => complete.map((m) => summarise(m, data)), [complete.join(), data]);
  const avg = (c: string) => average(sums.map((x) => x.byCategory[c] ?? 0));
  const payeesBy = useMemo(() => {
    const m = new Map<string, Payee[]>();
    for (const p of data.payees) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return m;
  }, [data.payees]);
  const [newCat, setNewCat] = useState<{ label: string; group: string; type: 'need' | 'want' }>({ label: '', group: GROUPS[0], type: 'want' });

  return (
    <>
      {GROUPS.map((g) => {
        const cats = CATEGORIES.filter((c) => c.group === g && !c.system);
        if (!cats.length) return null;
        return (
          <section key={g} className="panel cat-panel">
            <h2>{g}</h2>
            <ul className="cat-rows">
              {cats.map((c) => {
                const ps = (payeesBy.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
                const isHidden = hidden.includes(c.id);
                return (
                  <li key={c.id} className={isHidden ? 'is-hidden' : ''}>
                    <div className="cat-line">
                      <span><b>{c.label}</b>{c.custom && <small> yours</small>}<small>{c.type === 'need' ? 'Need' : 'Want'}{avg(c.id) > 0 ? `, about ${money(avg(c.id))} a month` : ''}</small></span>
                      <span className="cat-actions">
                        <label className="check small"><input type="checkbox" checked={!isHidden} onChange={(e) => updateSettings({ hiddenCategories: e.target.checked ? hidden.filter((h) => h !== c.id) : [...hidden, c.id] })} /><span>Show</span></label>
                        {c.custom && !ps.length && <button className="icon-btn" aria-label={`Delete ${c.label}`} onClick={() => updateSettings({ customCategories: (s.customCategories ?? []).filter((x) => x.id !== c.id) })}><Trash2 size={15} /></button>}
                      </span>
                    </div>
                    {ps.length > 0 && (
                      <ul className="chips">{ps.map((p) => <li key={p.id}><button className="chip-btn" onClick={() => setParams({ tab: 'payees', payee: p.id }, { replace: true })}>{p.name}</button></li>)}</ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <section className="panel">
        <h2>Add a category</h2>
        <form className="inline-form" onSubmit={(e) => {
          e.preventDefault();
          if (!newCat.label.trim()) return;
          const id = `custom-${newCat.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          if (CATEGORIES.some((c) => c.id === id)) return;
          const cat: Category = { id, label: newCat.label.trim(), group: newCat.group, type: newCat.type };
          updateSettings({ customCategories: [...(s.customCategories ?? []), cat] });
          setNewCat({ ...newCat, label: '' });
        }}>
          <input placeholder="e.g. India home maintenance" value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} aria-label="New category name" />
          <select value={newCat.group} onChange={(e) => setNewCat({ ...newCat, group: e.target.value })} aria-label="Group">{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
          <select value={newCat.type} onChange={(e) => setNewCat({ ...newCat, type: e.target.value as 'need' | 'want' })} aria-label="Need or want"><option value="want">Want</option><option value="need">Need</option></select>
          <button className="btn small primary">Add category</button>
        </form>
      </section>
    </>
  );
}

export function Categories() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'categories' | 'payees') ?? 'categories';
  return (
    <div className="categories">
      <PageHeader title="Categories & payees">
        <Info>Every payment belongs to a payee, and every payee to a category. Fix a payee once and its past and future payments follow. Untick "Show" for categories you don't use.</Info>
        <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[{ id: 'categories', label: 'Categories' }, { id: 'payees', label: 'Payees' }]} />
      </PageHeader>
      {tab === 'categories' ? <CategoriesTab /> : <PayeesTab />}
    </div>
  );
}
