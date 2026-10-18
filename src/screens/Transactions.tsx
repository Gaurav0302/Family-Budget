import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Info, PageHeader } from '../components/bits';
import { allMonths, monthOf } from '../data/analysis';
import { CATEGORIES, CATEGORY, GROUPS, label } from '../data/categories';
import { merchantOf } from '../data/merchant';
import { ruleMatches } from '../data/rules';
import { useStore } from '../data/store';
import type { Kind, Transaction } from '../data/types';
import { dayName, money, monthName } from '../lib/format';

const kindFor = (category: string): Kind =>
  ['salary', 'interest', 'other-income'].includes(category) ? 'income'
  : ['own-transfer', 'card-payment'].includes(category) ? 'transfer'
  : category === 'shares' ? 'invest' : 'spend';

export function CategorySelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const groups = [...GROUPS, 'Money in', 'Moving money', 'Investing'];
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {CATEGORIES.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function suggestedPattern(t: Transaction): string {
  const first = t.description.split(' | ')[0].replace(/\(matched by amount\)/, '').replace(/\(US\$.*\)/, '');
  return first.replace(/^Direct Debit \d+ /i, '').replace(/\s+\d[\d\s]*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim().slice(0, 40);
}

function Editor({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { data, updateTransaction, addRule } = useStore();
  const [category, setCategory] = useState(tx.category ?? 'other');
  const [note, setNote] = useState(tx.note ?? '');
  const [oneOff, setOneOff] = useState(!!tx.oneOff);
  const [always, setAlways] = useState(!!tx.needsReview);
  const [pattern, setPattern] = useState(suggestedPattern(tx));
  const [done, setDone] = useState<string | null>(null);
  const matches = useMemo(() => {
    if (!always || !pattern.trim()) return 0;
    return data.transactions.filter((t) => !t.manual && ruleMatches({ id: '', pattern, category, kind: 'spend' }, t)).length;
  }, [always, pattern, category, data.transactions]);
  const account = data.settings.accounts.find((a) => a.key === tx.account)?.name ?? tx.account;

  async function save() {
    await updateTransaction(tx.id, { category, kind: kindFor(category), note: note || null, oneOff });
    let msg = 'Saved.';
    if (always && pattern.trim()) {
      const n = await addRule({ pattern: pattern.trim(), category, kind: kindFor(category) });
      msg = `Saved. ${n} other transaction${n === 1 ? '' : 's'} sorted the same way.`;
    }
    setDone(msg);
    setTimeout(onClose, 900);
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="ed-title" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="ed-title">{merchantOf(tx.description)}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <p className={`sheet-amount ${tx.amount > 0 ? 'in' : ''}`}>{money(tx.amount, { cents: true, sign: true })}</p>
        <dl className="facts">
          <div><dt>Date</dt><dd>{dayName(tx.date)}</dd></div>
          <div><dt>Account</dt><dd>{account}</dd></div>
          <div className="wide"><dt>Bank's description</dt><dd>{tx.description}</dd></div>
        </dl>
        <label htmlFor="cat">Category</label>
        <CategorySelect id="cat" value={category} onChange={setCategory} />
        <label className="check"><input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} />
          <span>One-off <small>Leave it out of trends and budget checks (e.g. a visa fee or a big repair)</small></span></label>
        <label className="check"><input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
          <span>Always sort similar transactions as {label(category)}</span></label>
        {always && (
          <div className="rule-box">
            <label htmlFor="pat">Match descriptions containing</label>
            <input id="pat" value={pattern} onChange={(e) => setPattern(e.target.value)} />
            <p className="fine">{matches} transaction{matches === 1 ? '' : 's'} match. Ones you've sorted by hand won't change.</p>
          </div>
        )}
        <label htmlFor="note">Note</label>
        <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
        <div className="sheet-actions">
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
  const { data } = useStore();
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
      (category === 'all' || t.category === category) &&
      (account === 'all' || t.account === account) &&
      (!onlyReview || t.needsReview) &&
      (!needle || t.description.toLowerCase().includes(needle) || (t.note ?? '').toLowerCase().includes(needle) || merchantOf(t.description).toLowerCase().includes(needle)));
  }, [data.transactions, month, category, account, onlyReview, q]);

  const out = rows.filter((t) => t.kind === 'spend').reduce((s, t) => s - t.amount, 0);
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
        <div className="tx-list" role="list">
          {rows.slice(0, limit).map((t) => (
            <button key={t.id} role="listitem" className={`tx ${t.needsReview ? 'needs' : ''} kind-${t.kind}`} onClick={() => setEditing(t)}>
              <span className="tx-date">{dayName(t.date)}</span>
              <span className="tx-what">
                <b>{merchantOf(t.description)}</b>
                <small>{accountName(t.account)}{t.note ? ` – ${t.note}` : ''}</small>
              </span>
              <span className="tx-cat">
                <span className={`pill ${t.needsReview ? 'pill-warn' : ''}`}>{t.needsReview ? 'Needs your input' : label(t.category)}</span>
                {t.oneOff && <span className="pill pill-quiet">One-off</span>}
              </span>
              <span className={`tx-amt ${t.amount > 0 ? 'in' : ''}`}>{money(t.amount, { cents: true, sign: true })}</span>
            </button>
          ))}
          {rows.length > limit && <button className="btn wide" onClick={() => setLimit(limit + 300)}>Show more ({rows.length - limit} left)</button>}
        </div>
      )}
      {editing && <Editor tx={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
