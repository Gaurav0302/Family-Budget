import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, Info, PageHeader } from '../components/bits';
import { allMonths, monthOf, withSplits } from '../data/analysis';
import { CATEGORIES, CATEGORY, label } from '../data/categories';
import { SplitEditor } from '../components/SplitEditor';
import { CategorySelect } from '../components/CategorySelect';
import { findPayee, kindForCategory } from '../data/payees';
import { merchantOf } from '../data/merchant';
import { toCsv } from '../lib/csv';
import { useStore } from '../data/store';
import type { Settings, TaxKind, Transaction } from '../data/types';
import { dayName, money, monthName, today as todayLocal } from '../lib/format';
import { TAX_KINDS, TAX_LABEL } from '../data/tax';
import { people } from '../data/wealth';
import { FocusTrap } from '../components/FocusTrap';

function Editor({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { data, updateTransaction, setPayee, payeeIdx, updateSettingsBy, email } = useStore();
  const payee = findPayee(tx, payeeIdx);
  const tag = data.settings.taxTags?.[tx.id];
  const [taxKind, setTaxKind] = useState<TaxKind | ''>(tag?.kind ?? '');
  const [taxWho, setTaxWho] = useState(tag?.person ?? '');
  const [taxPart, setTaxPart] = useState(tag?.part ?? 0);
  const asked = data.settings.questions?.[tx.id];
  const [ask, setAsk] = useState(!!asked);
  const [category, setCategory] = useState(tx.category ?? 'other');
  const [note, setNote] = useState(tx.note ?? '');
  const [oneOff, setOneOff] = useState(!!tx.oneOff);
  const [allOfPayee, setAllOfPayee] = useState(!!tx.needsReview && !payee?.askEachTime);
  const [done, setDone] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const parts = data.settings.splits?.[tx.id];
  const count = payee ? data.transactions.filter((t) => findPayee(t, payeeIdx)?.id === payee.id).length : 0;
  const account = data.settings.accounts.find((a) => a.key === tx.account)?.name ?? tx.account;

  async function save() {
    let msg = 'Saved.';
    // Tax mark and meeting question live in settings, keyed by the payment. Worked out on the latest copy, so the other
    // person's marks and questions made meanwhile are kept.
    const taxChanged = taxKind !== (tag?.kind ?? '') || taxWho !== (tag?.person ?? '') || taxPart !== (tag?.part ?? 0);
    const askChanged = ask !== !!asked;
    if (taxChanged || askChanged) await updateSettingsBy((s) => {
      const patch: Partial<Settings> = {};
      if (taxChanged) {
        const next = { ...(s.taxTags ?? {}) };
        if (taxKind) next[tx.id] = { kind: taxKind, ...(taxWho ? { person: taxWho } : {}), ...(parts && taxPart ? { part: taxPart } : {}) }; else delete next[tx.id];
        patch.taxTags = next;
      }
      if (askChanged) {
        const next = { ...(s.questions ?? {}) };
        if (ask) next[tx.id] = { by: email ?? undefined, on: todayLocal() }; else delete next[tx.id];
        patch.questions = next;
      }
      return patch;
    });
    if (allOfPayee && payee) {
      const n = await setPayee(payee.id, { category, kind: kindForCategory(category), checked: true }, true);
      msg = `Saved. ${payee.name} now goes to ${label(category)}; ${n} payment${n === 1 ? '' : 's'} moved.`;
      if (note !== (tx.note ?? '') || oneOff !== !!tx.oneOff) await updateTransaction(tx.id, { note: note || null, oneOff });
    } else {
      await updateTransaction(tx.id, { category, kind: kindForCategory(category), note: note || null, oneOff });
    }
    setDone(msg);
    setTimeout(onClose, 1100);
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="ed-title" onClick={onClose}>
      <FocusTrap onClose={onClose} />
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="ed-title">{payee?.name ?? merchantOf(tx.description)}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <p className={`sheet-amount ${tx.amount > 0 ? 'in' : ''}`}>{money(tx.amount, { cents: true, sign: true })}</p>
        <dl className="facts">
          <div><dt>Date</dt><dd>{dayName(tx.date)}</dd></div>
          <div><dt>Account</dt><dd>{account}</dd></div>
          <div className="wide"><dt>Bank's description</dt><dd>{tx.description}</dd></div>
        </dl>
        {splitting ? <SplitEditor tx={tx} onDone={(msg) => { setSplitting(false); if (msg) setDone(msg); }} /> : parts ? (
          <div className="split-summary">
            <b>Split into {parts.length} parts</b>
            <ul>{parts.map((p, i) => <li key={i}><span>{label(p.category)}{p.note ? <small> {p.note}</small> : null}</span><span>{money(Math.abs(p.amount), { cents: true })}</span></li>)}</ul>
            <button className="btn small" onClick={() => setSplitting(true)}>Change the split</button>
          </div>
        ) : <>
        <label htmlFor="cat">Category</label>
        <CategorySelect id="cat" value={category} onChange={setCategory} />
        <button className="btn small ghost split-open" onClick={() => setSplitting(true)}>Split into parts</button>
        </>}
        {payee && !parts && !splitting && (
          <label className="check"><input type="checkbox" checked={allOfPayee} onChange={(e) => setAllOfPayee(e.target.checked)} />
            <span>Use this for all {count} {payee.name} payments, and future ones
              <small>{payee.askEachTime ? 'This payee is set to "ask me each time", so leave this unticked to sort just this one.' : 'Untick to change just this payment.'}</small></span></label>
        )}
        <label className="check"><input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} />
          <span>One-off <small>Leave it out of trends and budget checks (e.g. a visa fee or a big repair)</small></span></label>
        <label htmlFor="note">Note</label>
        <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
        <label className="check"><input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} />
          <span>Ask about this at the money meeting <small>{asked ? `Asked${asked.by ? ` by ${asked.by.split('@')[0]}` : ''} on ${dayName(asked.on)}. Untick once it's answered.` : 'It shows in the meeting and on Home until someone unticks it.'}</small></span></label>
        {tx.amount < 0 && (
          <details className="tax-mark" open={!!taxKind}>
            <summary>For tax time{taxKind ? `: ${TAX_LABEL[taxKind]}` : ''}</summary>
            <div className="tax-fields">
              <label>Kind<select value={taxKind} onChange={(e) => setTaxKind(e.target.value as TaxKind | '')}>
                <option value="">Not for tax</option>
                {TAX_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select></label>
              {taxKind && parts && (
                <label>Which part<select value={taxPart} onChange={(e) => setTaxPart(Number(e.target.value))}>
                  <option value={0}>The whole payment</option>
                  {parts.map((p, i) => <option key={i} value={i + 1}>{label(p.category)}: {money(Math.abs(p.amount), { cents: true })}</option>)}
                </select></label>
              )}
              {taxKind && people(data.settings).length > 1 && (
                <label>Whose<select value={taxWho} onChange={(e) => setTaxWho(e.target.value)}>
                  <option value="">{data.settings.accounts.find((a) => a.key === tx.account)?.owner ?? 'Joint'} (account owner)</option>
                  {people(data.settings).map((p) => <option key={p} value={p}>{p}</option>)}
                </select></label>
              )}
            </div>
            {taxKind && <p className="fine">{TAX_KINDS.find((k) => k.id === taxKind)?.hint}. Keep the receipt.</p>}
          </details>
        )}
        <div className="sheet-actions">
          {payee && !done && <Link className="btn small ghost" to={`/categories?tab=payees&payee=${payee.id}`} onClick={onClose}>Edit payee</Link>}
          {done ? <p className="ok" role="status">{done}</p> : <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}>Save</button>
          </>}
        </div>
      </div>
    </div>
  );
}

type Sort = 'new' | 'old' | 'out' | 'in';
const SORTS: { id: Sort; label: string }[] = [{ id: 'new', label: 'Newest first' }, { id: 'old', label: 'Oldest first' }, { id: 'out', label: 'Biggest payments out' }, { id: 'in', label: 'Biggest money in' }];

export function Transactions() {
  const { data, payeeIdx, updateTransactions } = useStore();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? 'all';
  const category = params.get('category') ?? 'all';
  const account = params.get('account') ?? 'all';
  const onlyReview = params.get('review') === '1';
  const onlyAsk = params.get('ask') === '1';
  // Questions about payments still in the app (one removed since can't be answered, so it isn't counted).
  const questions = useMemo(() => { const have = new Set(data.transactions.map((t) => t.id)); return Object.fromEntries(Object.entries(data.settings.questions ?? {}).filter(([id]) => have.has(id))); }, [data.settings.questions, data.transactions]);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(150);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const sort = (params.get('sort') as Sort) ?? 'new';
  // Sorting several at once: tick them, pick a category, apply.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState('groceries');
  const [bulkDone, setBulkDone] = useState<string | null>(null);
  const months = useMemo(() => allMonths(data.transactions).reverse(), [data.transactions]);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v === 'all' || !v) p.delete(k); else p.set(k, v); setParams(p, { replace: true }); };
  useEffect(() => setLimit(150), [month, category, account, onlyReview, onlyAsk, q]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.transactions.filter((t) =>
      (month === 'all' || monthOf(t.date) === month) &&
      (category === 'all' || t.category === category || (data.settings.splits?.[t.id] ?? []).some((p) => p.category === category)) &&
      (account === 'all' || t.account === account) &&
      (!onlyReview || t.needsReview) &&
      (!onlyAsk || !!questions[t.id]) &&
      (!needle || t.description.toLowerCase().includes(needle) || (t.note ?? '').toLowerCase().includes(needle) || merchantOf(t.description).toLowerCase().includes(needle)))
      .sort((a, b) => sort === 'old' ? a.date.localeCompare(b.date) : sort === 'out' ? a.amount - b.amount : sort === 'in' ? b.amount - a.amount : b.date.localeCompare(a.date));
  }, [data.transactions, data.settings.splits, month, category, account, onlyReview, onlyAsk, questions, q, sort]);

  const parts = withSplits(rows, data.settings.splits).filter((t) => category === 'all' || t.category === category);
  const out = parts.filter((t) => t.kind === 'spend').reduce((s, t) => s - t.amount, 0);
  const cameIn = parts.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const exportCsv = () => {
    const csv = toCsv(['Date', 'Payee', 'Description', 'Account', 'Category', 'Amount', 'Note'], rows.map((t) => [t.date, findPayee(t, payeeIdx)?.name ?? merchantOf(t.description), t.description, accountName(t.account), label(t.category), t.amount, t.note ?? '']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `transactions-${month === 'all' ? 'all' : month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const applyBulk = async () => {
    const ids = [...picked];
    await updateTransactions(ids, { category: bulkCat, kind: kindForCategory(bulkCat) });
    setBulkDone(`${ids.length} payment${ids.length === 1 ? '' : 's'} moved to ${label(bulkCat)}.`);
    setPicked(new Set());
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toSort = data.transactions.filter((t) => t.needsReview).length;
  const accountName = (k: string) => data.settings.accounts.find((a) => a.key === k)?.name.replace(/ \(.*\)$/, '') ?? k;

  return (
    <div>
      <PageHeader title="Transactions"><Info>Every payment in and out. Tap one to change its category, add a note, split it, or mark it as a one-off so it doesn't skew your trends. "Sort several" lets you move many at once.</Info></PageHeader>
      <div className="filters">
        <select value={month} onChange={(e) => set('month', e.target.value)} aria-label="Month">
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
        <select value={category} onChange={(e) => set('category', e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={account} onChange={(e) => set('account', e.target.value)} aria-label="Account">
          <option value="all">All accounts</option>
          {data.settings.accounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
        </select>
        <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search descriptions and notes" />
        <select value={sort} onChange={(e) => set('sort', e.target.value === 'new' ? '' : e.target.value)} aria-label="Order">
          {SORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <button className={`chip ${onlyReview ? 'on' : ''}`} onClick={() => set('review', onlyReview ? '' : '1')} aria-pressed={onlyReview}>
          Needs your input <b>{toSort}</b>
        </button>
        {(Object.keys(questions).length > 0 || onlyAsk) && (
          <button className={`chip ${onlyAsk ? 'on' : ''}`} onClick={() => set('ask', onlyAsk ? '' : '1')} aria-pressed={onlyAsk}>
            To ask at the meeting <b>{Object.keys(questions).length}</b>
          </button>
        )}
      </div>
      <div className="result-bar">
        <p className="result-line">{rows.length} transaction{rows.length === 1 ? '' : 's'}{category !== 'all' && CATEGORY[category] ? ` in ${CATEGORY[category].label}` : ''}: <b>{money(out)}</b> spent{cameIn ? <>, <b>{money(cameIn)}</b> came in</> : ''}.</p>
        <span className="result-tools">
          <button className={`btn small ${picking ? 'primary' : ''}`} aria-pressed={picking} onClick={() => { setPicking(!picking); setPicked(new Set()); setBulkDone(null); }}>{picking ? 'Done sorting' : 'Sort several'}</button>
          <button className="btn small" onClick={exportCsv} disabled={!rows.length}>Download as CSV</button>
        </span>
      </div>
      {picking && (
        <div className="bulk-bar" role="region" aria-label="Sort several payments">
          {bulkDone ? <span className="st-text-good" role="status">{bulkDone}</span> : <span>{picked.size ? `${picked.size} ticked` : 'Tick the payments to move'}</span>}
          <CategorySelect id="bulk-cat" value={bulkCat} onChange={setBulkCat} />
          <button className="btn small primary" disabled={!picked.size} onClick={applyBulk}>Move {picked.size || ''} to this category</button>
          <button className="link" onClick={() => setPicked(new Set(rows.slice(0, limit).map((t) => t.id)))}>Tick all shown</button>
        </div>
      )}

      {!rows.length ? <Empty title={onlyReview ? 'All sorted' : 'No transactions match'}><p>{onlyReview ? 'Every transaction has a category.' : 'Try a different month, category or search.'}</p></Empty> : (
        <div className="tx-wrap">
        <ul className="tx-list">
          {rows.slice(0, limit).map((t, i, list) => {
            // Month headings when the list is in date order, with what went out that month.
            const head = (sort === 'new' || sort === 'old') && (i === 0 || monthOf(list[i - 1].date) !== monthOf(t.date));
            return [
            head && <li key={`h${monthOf(t.date)}`} className="tx-month" aria-hidden={false}><h2>{monthName(monthOf(t.date))}</h2></li>,
            <li key={t.id} className={picking ? 'is-picking' : ''}>
              {picking && <input type="checkbox" className="tx-pick" checked={picked.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Tick ${findPayee(t, payeeIdx)?.name ?? merchantOf(t.description)} on ${dayName(t.date)}`} />}
              <button type="button" className={`tx ${t.needsReview ? 'needs' : ''} kind-${t.kind}`} onClick={() => (picking ? toggle(t.id) : setEditing(t))}>
              <span className="tx-date">{dayName(t.date)}</span>
              <span className="tx-what">
                <b>{findPayee(t, payeeIdx)?.name ?? merchantOf(t.description)}</b>
                <small>{accountName(t.account)}{t.note ? ` – ${t.note}` : ''}</small>
              </span>
              <span className="tx-cat">
                <span className={`pill ${t.needsReview ? 'pill-warn' : ''}`}>{data.settings.splits?.[t.id] ? `Split: ${data.settings.splits[t.id].map((p) => label(p.category)).join(' + ')}` : t.needsReview ? 'Needs your input' : label(t.category)}</span>
                {t.oneOff && <span className="pill pill-quiet">One-off</span>}
                {data.settings.taxTags?.[t.splitOf ?? t.id] && <span className="pill pill-quiet">Tax</span>}
                {data.settings.questions?.[t.splitOf ?? t.id] && <span className="pill pill-ask">To ask</span>}
              </span>
              <span className={`tx-amt ${t.amount > 0 ? 'in' : ''}`}>{money(t.amount, { cents: true, sign: true })}</span>
            </button></li>,
            ];
          })}
        </ul>
        {rows.length > limit && <button className="btn wide" onClick={() => setLimit(limit + 300)}>Show more ({rows.length - limit} left)</button>}
        </div>
      )}
      {editing && <Editor tx={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
