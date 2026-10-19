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
import { useStore } from '../data/store';
import type { Transaction } from '../data/types';
import { dayName, money, monthName } from '../lib/format';
import { FocusTrap } from '../components/FocusTrap';

function Editor({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { data, updateTransaction, setPayee, payeeIdx } = useStore();
  const payee = findPayee(tx, payeeIdx);
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

export function Transactions() {
  const { data, payeeIdx } = useStore();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? 'all';
  const category = params.get('category') ?? 'all';
  const account = params.get('account') ?? 'all';
  const onlyReview = params.get('review') === '1';
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(150);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const months = useMemo(() => allMonths(data.transactions).reverse(), [data.transactions]);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v === 'all' || !v) p.delete(k); else p.set(k, v); setParams(p, { replace: true }); };
  useEffect(() => setLimit(150), [month, category, account, onlyReview, q]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.transactions.filter((t) =>
      (month === 'all' || monthOf(t.date) === month) &&
      (category === 'all' || t.category === category || (data.settings.splits?.[t.id] ?? []).some((p) => p.category === category)) &&
      (account === 'all' || t.account === account) &&
      (!onlyReview || t.needsReview) &&
      (!needle || t.description.toLowerCase().includes(needle) || (t.note ?? '').toLowerCase().includes(needle) || merchantOf(t.description).toLowerCase().includes(needle)));
  }, [data.transactions, data.settings.splits, month, category, account, onlyReview, q]);

  const out = withSplits(rows, data.settings.splits).filter((t) => t.kind === 'spend' && (category === 'all' || t.category === category)).reduce((s, t) => s - t.amount, 0);
  const toSort = data.transactions.filter((t) => t.needsReview).length;
  const accountName = (k: string) => data.settings.accounts.find((a) => a.key === k)?.name.replace(/ \(.*\)$/, '') ?? k;

  return (
    <div>
      <PageHeader title="Spending"><Info>Tap a transaction to change its category, add a note, or mark it as a one-off so it doesn't skew your trends.</Info></PageHeader>
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
        <button className={`chip ${onlyReview ? 'on' : ''}`} onClick={() => set('review', onlyReview ? '' : '1')} aria-pressed={onlyReview}>
          Needs your input <b>{toSort}</b>
        </button>
      </div>
      <p className="result-line">{rows.length} transactions{category !== 'all' && CATEGORY[category] ? ` in ${CATEGORY[category].label}` : ''}. Spending in this view: <b>{money(out)}</b>.</p>

      {!rows.length ? <Empty title={onlyReview ? 'All sorted' : 'No transactions match'}><p>{onlyReview ? 'Every transaction has a category.' : 'Try a different month, category or search.'}</p></Empty> : (
        <div className="tx-wrap">
        <ul className="tx-list">
          {rows.slice(0, limit).map((t) => (
            <li key={t.id}><button type="button" className={`tx ${t.needsReview ? 'needs' : ''} kind-${t.kind}`} onClick={() => setEditing(t)}>
              <span className="tx-date">{dayName(t.date)}</span>
              <span className="tx-what">
                <b>{findPayee(t, payeeIdx)?.name ?? merchantOf(t.description)}</b>
                <small>{accountName(t.account)}{t.note ? ` – ${t.note}` : ''}</small>
              </span>
              <span className="tx-cat">
                <span className={`pill ${t.needsReview ? 'pill-warn' : ''}`}>{data.settings.splits?.[t.id] ? `Split: ${data.settings.splits[t.id].map((p) => label(p.category)).join(' + ')}` : t.needsReview ? 'Needs your input' : label(t.category)}</span>
                {t.oneOff && <span className="pill pill-quiet">One-off</span>}
              </span>
              <span className={`tx-amt ${t.amount > 0 ? 'in' : ''}`}>{money(t.amount, { cents: true, sign: true })}</span>
            </button></li>
          ))}
        </ul>
        {rows.length > limit && <button className="btn wide" onClick={() => setLimit(limit + 300)}>Show more ({rows.length - limit} left)</button>}
        </div>
      )}
      {editing && <Editor tx={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
