import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CategorySelect } from '../components/CategorySelect';
import { Info, PageHeader, Tabs } from '../components/bits';
import { average, completeMonths, summarise } from '../data/analysis';
import { CATEGORIES, GROUP_KEYS, GROUPS, label } from '../data/categories';
import { Menu } from '../components/Menu';
import { findPayee, kindForCategory } from '../data/payees';
import { useStore } from '../data/store';
import type { Category, Payee, Transaction } from '../data/types';
import { dayName, money } from '../lib/format';
import { FocusTrap } from '../components/FocusTrap';

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
      <FocusTrap onClose={onClose} />
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

type Editing = { kind: 'area' | 'cat' | 'move' | 'add'; id: string } | null;
const slugOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Inline text box for renaming: saves on Enter or when you click away, Escape cancels. */
function RenameBox({ value, label, onSave, onCancel }: { value: string; label: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  return (
    <input className="rename" autoFocus aria-label={label} value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() && v.trim() !== value ? onSave(v.trim()) : onCancel())}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') onCancel(); }} />
  );
}

function NewCategory({ areaKey, onDone }: { areaKey?: string; onDone: () => void }) {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const [name, setName] = useState('');
  const [area, setArea] = useState(areaKey ?? GROUP_KEYS[0]);
  const [newArea, setNewArea] = useState('');
  const [type, setType] = useState<'need' | 'want'>('need');
  return (
    <form className="new-cat" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return;
      const id = `custom-${slugOf(name)}`;
      if (CATEGORIES.some((c) => c.id === id)) return;
      let groups = s.customGroups ?? [];
      let group = area;
      if (area === '__new') {
        if (!newArea.trim()) return;
        group = `area-${slugOf(newArea)}`;
        if (!groups.some((g) => g.id === group)) groups = [...groups, { id: group, label: newArea.trim() }];
      }
      updateSettings({ customGroups: groups, customCategories: [...(s.customCategories ?? []), { id, label: name.trim(), group, type }] });
      onDone();
    }}>
      <input autoFocus placeholder="Category name, e.g. India home upkeep" value={name} onChange={(e) => setName(e.target.value)} aria-label="Category name" />
      {!areaKey && <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
        {GROUP_KEYS.map((k, i) => <option key={k} value={k}>{GROUPS[i]}</option>)}
        <option value="__new">＋ New area…</option>
      </select>}
      {area === '__new' && <input placeholder="New area name, e.g. Government" value={newArea} onChange={(e) => setNewArea(e.target.value)} aria-label="New area name" />}
      <select value={type} onChange={(e) => setType(e.target.value as 'need' | 'want')} aria-label="Need or want"><option value="need">Need</option><option value="want">Want</option></select>
      <span className="row-gap"><button className="btn small primary">Add</button><button type="button" className="btn small ghost" onClick={onDone}>Cancel</button></span>
    </form>
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
  const [editing, setEditing] = useState<Editing>(null);
  const [adding, setAdding] = useState<'cat' | 'area' | null>(null);
  const [areaName, setAreaName] = useState('');
  const [allChips, setAllChips] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  // Searching finds a category by its own name, its area's name, or any payee sorted into it.
  const matches = (c: Category, area: string) => !needle || c.label.toLowerCase().includes(needle) || area.toLowerCase().includes(needle)
    || (payeesBy.get(c.id) ?? []).some((p) => p.name.toLowerCase().includes(needle));
  const used = useMemo(() => new Set(data.transactions.map((t) => t.category)), [data.transactions]);

  const isCustomArea = (k: string) => (s.customGroups ?? []).some((g) => g.id === k);
  const renameArea = (k: string, label: string) => updateSettings(isCustomArea(k)
    ? { customGroups: (s.customGroups ?? []).map((g) => (g.id === k ? { ...g, label } : g)) }
    : { groupNames: { ...(s.groupNames ?? {}), [k]: label } });
  const editCat = (c: Category, patch: { label?: string; group?: string; type?: 'need' | 'want' }) => updateSettings(c.custom
    ? { customCategories: (s.customCategories ?? []).map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }
    : { categoryEdits: { ...(s.categoryEdits ?? {}), [c.id]: { ...(s.categoryEdits?.[c.id] ?? {}), ...patch } } });
  const setHidden = (ids: string[], hide: boolean) => updateSettings({ hiddenCategories: hide ? [...new Set([...hidden, ...ids])] : hidden.filter((h) => !ids.includes(h)) });

  return (
    <>
      <div className="btn-row cat-add">
        <button className="btn small" onClick={() => setAdding(adding === 'cat' ? null : 'cat')}><Plus size={16} aria-hidden /> New category</button>
        <button className="btn small" onClick={() => setAdding(adding === 'area' ? null : 'area')}><Plus size={16} aria-hidden /> New area</button>
        <input type="search" className="cat-search" placeholder="Find a category or payee" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a category or payee" />
      </div>
      {adding === 'cat' && <section className="panel"><NewCategory onDone={() => setAdding(null)} /></section>}
      {adding === 'area' && (
        <section className="panel">
          <form className="new-cat" onSubmit={(e) => {
            e.preventDefault();
            if (!areaName.trim()) return;
            const id = `area-${slugOf(areaName)}`;
            if (!isCustomArea(id) && !GROUPS.includes(areaName.trim())) updateSettings({ customGroups: [...(s.customGroups ?? []), { id, label: areaName.trim() }] });
            setAreaName(''); setAdding(null); setEditing({ kind: 'add', id });
          }}>
            <input autoFocus placeholder="Area name, e.g. Government" value={areaName} onChange={(e) => setAreaName(e.target.value)} aria-label="Area name" />
            <span className="row-gap"><button className="btn small primary">Add area</button><button type="button" className="btn small ghost" onClick={() => setAdding(null)}>Cancel</button></span>
          </form>
        </section>
      )}
      <div className="cat-areas">
      {GROUP_KEYS.map((key, gi) => {
        const name = GROUPS[gi];
        const inArea = CATEGORIES.filter((c) => c.groupKey === key && !c.system);
        const cats = inArea.filter((c) => matches(c, name));
        const allHidden = inArea.length > 0 && inArea.every((c) => hidden.includes(c.id));
        if (needle && !cats.length) return null;
        if (!inArea.length && !isCustomArea(key)) return null;
        return (
          <section key={key} className={`panel cat-panel ${allHidden ? 'is-hidden' : ''}`}>
            <div className="cat-panel-head">
              {editing?.kind === 'area' && editing.id === key
                ? <RenameBox value={name} label="Area name" onSave={(v) => { renameArea(key, v); setEditing(null); }} onCancel={() => setEditing(null)} />
                : <h2>{name} <small>{inArea.length} categor{inArea.length === 1 ? 'y' : 'ies'}{allHidden ? ', hidden' : ''}</small></h2>}
              <Menu label={`${name} options`} items={[
                { label: 'Rename area', onClick: () => setEditing({ kind: 'area', id: key }) },
                { label: 'Add a category here', onClick: () => setEditing({ kind: 'add', id: key }) },
                inArea.length > 0 && { label: allHidden ? 'Show all its categories' : 'Hide all its categories', onClick: () => setHidden(inArea.map((c) => c.id), !allHidden) },
                isCustomArea(key) && !inArea.length && { label: 'Delete area', danger: true, onClick: () => updateSettings({ customGroups: (s.customGroups ?? []).filter((g) => g.id !== key) }) },
              ]} />
            </div>
            {editing?.kind === 'add' && editing.id === key && <NewCategory areaKey={key} onDone={() => setEditing(null)} />}
            {!inArea.length && editing?.id !== key && <p className="muted">No categories yet. Use ⋯ → Add a category here, or move one in.</p>}
            <ul className="cat-rows">
              {cats.map((c) => {
                const ps = (payeesBy.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
                const isHidden = hidden.includes(c.id);
                const many = ps.length > 5 && !allChips.has(c.id) && !needle;
                return (
                  <li key={c.id} className={isHidden ? 'is-hidden' : ''}>
                    <div className="cat-line">
                      {editing?.kind === 'cat' && editing.id === c.id
                        ? <RenameBox value={c.label} label="Category name" onSave={(v) => { editCat(c, { label: v }); setEditing(null); }} onCancel={() => setEditing(null)} />
                        : <span><b>{c.label}</b><small>{c.type === 'need' ? 'Need' : 'Want'}{avg(c.id) > 0 ? ` · about ${money(avg(c.id))} a month` : ''}{isHidden ? ' · hidden' : ''}{c.custom ? ' · yours' : ''}</small></span>}
                      <Menu label={`${c.label} options`} items={[
                        { label: 'Rename', onClick: () => setEditing({ kind: 'cat', id: c.id }) },
                        { label: 'Move to another area', onClick: () => setEditing({ kind: 'move', id: c.id }) },
                        { label: c.type === 'need' ? 'Count it as a want' : 'Count it as a need', onClick: () => editCat(c, { type: c.type === 'need' ? 'want' : 'need' }) },
                        { label: isHidden ? 'Show it' : 'Hide it', onClick: () => setHidden([c.id], !isHidden) },
                        c.custom && !ps.length && !used.has(c.id) && { label: 'Delete', danger: true, onClick: () => updateSettings({ customCategories: (s.customCategories ?? []).filter((x) => x.id !== c.id) }) },
                      ]} />
                    </div>
                    {editing?.kind === 'move' && editing.id === c.id && (
                      <div className="inline-form">
                        <label className="inline">Move to <select autoFocus defaultValue={key} onChange={(e) => { editCat(c, { group: e.target.value }); setEditing(null); }}>
                          {GROUP_KEYS.map((k, i) => <option key={k} value={k}>{GROUPS[i]}</option>)}
                        </select></label>
                        <button className="btn small ghost" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    )}
                    {ps.length > 0 && (
                      <ul className="chips">
                        {(many ? ps.slice(0, 4) : ps).map((p) => <li key={p.id}><button className="chip-btn" onClick={() => setParams({ tab: 'payees', payee: p.id }, { replace: true })}>{p.name}</button></li>)}
                        {many && <li><button className="chip-btn more" onClick={() => setAllChips(new Set([...allChips, c.id]))}>+{ps.length - 4} more</button></li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      </div>
    </>
  );
}

export function Categories() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'categories' | 'payees') ?? 'categories';
  return (
    <div className="categories">
      <PageHeader title="Categories & payees">
        <Info>Every payment belongs to a payee, every payee to a category, and every category to an area. Fix a payee once and its past and future payments follow. Use ⋯ to rename, move or hide.</Info>
        <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[{ id: 'categories', label: 'Categories' }, { id: 'payees', label: 'Payees' }]} />
      </PageHeader>
      {tab === 'categories' ? <CategoriesTab /> : <PayeesTab />}
    </div>
  );
}
