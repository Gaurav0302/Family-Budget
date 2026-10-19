import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { splitAddsUp } from '../data/analysis';
import { label } from '../data/categories';
import { useStore } from '../data/store';
import type { SplitPart, Transaction } from '../data/types';
import { money } from '../lib/format';
import { CategorySelect } from './CategorySelect';

/** Divide one bank payment between categories. Amounts are typed as positive numbers; the parts must add up to the payment. */
export function SplitEditor({ tx, onDone }: { tx: Transaction; onDone: (msg?: string) => void }) {
  const { data, updateSettings, updateTransaction } = useStore();
  const all = data.settings.splits ?? {};
  const sign = tx.amount < 0 ? -1 : 1;
  const start: SplitPart[] = all[tx.id] ?? [{ amount: tx.amount, category: tx.category ?? 'other' }, { amount: 0, category: 'other' }];
  const [parts, setParts] = useState(start.map((p) => ({ ...p, text: p.amount ? String(Math.abs(p.amount)) : '' })));
  const amounts = parts.map((p) => sign * (Number(p.text) || 0));
  const left = Math.round((Math.abs(tx.amount) - amounts.reduce((a, v) => a + Math.abs(v), 0)) * 100) / 100;
  const ready = splitAddsUp(tx.amount, amounts.map((amount) => ({ amount }))) && parts.filter((_, i) => amounts[i]).length >= 2;
  const set = (i: number, patch: Partial<(typeof parts)[number]>) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const save = () => {
    const clean = parts.map((p, i) => ({ amount: amounts[i], category: p.category, ...(p.note?.trim() ? { note: p.note.trim() } : {}) })).filter((p) => p.amount);
    updateSettings({ splits: { ...all, [tx.id]: clean } });
    if (tx.needsReview) updateTransaction(tx.id, { needsReview: false });   // a person has now decided where it goes
    onDone(`Split into ${clean.length}: ${clean.map((p) => `${money(Math.abs(p.amount), { cents: true })} ${label(p.category)}`).join(', ')}.`);
  };
  const remove = () => {
    const next = { ...all };
    delete next[tx.id];
    updateSettings({ splits: next });
    onDone('Split removed: the whole payment is back in one category.');
  };

  return (
    <div className="split-ed">
      <p className="split-head"><b>Split {money(Math.abs(tx.amount), { cents: true })}</b> <span className="muted">{tx.description}</span></p>
      <ul className="split-parts">
        {parts.map((p, i) => (
          <li key={i}>
            <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" aria-label={`Part ${i + 1} amount`} value={p.text} placeholder="0.00"
              onChange={(e) => set(i, { text: e.target.value.replace(/[^\d.]/g, '') })} /></span>
            <CategorySelect small label={`Part ${i + 1} category`} value={p.category} onChange={(c) => set(i, { category: c })} />
            <input className="split-note" aria-label={`Part ${i + 1} note`} placeholder="Note (optional)" value={p.note ?? ''} onChange={(e) => set(i, { note: e.target.value })} />
            {parts.length > 2 && <button className="icon-btn" aria-label={`Remove part ${i + 1}`} onClick={() => setParts(parts.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}
          </li>
        ))}
      </ul>
      <div className="split-foot">
        <button className="btn small ghost" onClick={() => setParts([...parts, { amount: 0, category: 'other', text: left > 0 ? String(left) : '' }])}>Add a part</button>
        <span className={left === 0 ? 'ok' : 'bad'}>{left === 0 ? 'Adds up' : left > 0 ? `${money(left, { cents: true })} still to place` : `${money(-left, { cents: true })} too much`}</span>
      </div>
      <div className="row-gap split-actions">
        <button className="btn small primary" disabled={!ready} onClick={save}>Save split</button>
        <button className="btn small ghost" onClick={() => onDone()}>Cancel</button>
        {all[tx.id] && <button className="btn small danger" onClick={remove}>Remove split</button>}
      </div>
    </div>
  );
}
