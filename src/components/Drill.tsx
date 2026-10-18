import { X } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { monthOf } from '../data/analysis';
import { CATEGORY, label } from '../data/categories';
import { groupByPayee, kindForCategory } from '../data/payees';
import { useStore } from '../data/store';
import type { Transaction } from '../data/types';
import { dayName, money, monthName } from '../lib/format';
import { CategorySelect } from './CategorySelect';

export interface DrillSpec { title: string; subtitle?: string; filter: (t: Transaction) => boolean; link?: string }

const Ctx = createContext<(spec: DrillSpec) => void>(() => {});
export const useDrill = () => useContext(Ctx);

const spendIn = (month: string) => (t: Transaction) => monthOf(t.date) === month && t.kind === 'spend';
export const drillCategory = (month: string, category: string): DrillSpec => ({
  title: label(category), subtitle: monthName(month), filter: (t) => spendIn(month)(t) && t.category === category,
  link: `/transactions?month=${month}&category=${category}`,
});
export const drillType = (month: string, type: 'need' | 'want'): DrillSpec => ({
  title: type === 'need' ? 'Needs' : 'Wants', subtitle: monthName(month),
  filter: (t) => spendIn(month)(t) && (CATEGORY[t.category ?? 'other']?.type ?? 'want') === type,
});
export const drillGroup = (month: string, group: string): DrillSpec => ({
  title: group, subtitle: monthName(month), filter: (t) => spendIn(month)(t) && CATEGORY[t.category ?? 'other']?.group === group,
});

function Sheet({ spec, onClose }: { spec: DrillSpec; onClose: () => void }) {
  const { data, payeeIdx, setPayee, updateTransaction } = useStore();
  const txs = data.transactions.filter(spec.filter);
  const groups = groupByPayee(txs, payeeIdx);
  const total = txs.reduce((a, t) => a - t.amount, 0);
  const acct = (k: string) => data.settings.accounts.find((a) => a.key === k)?.name.replace(/ \(.*\)$/, '') ?? k;
  const [moved, setMoved] = useState<string | null>(null);

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="drill-title" onClick={onClose}>
      <div className="sheet drill" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div><h2 id="drill-title">{spec.title}</h2>{spec.subtitle && <p className="muted">{spec.subtitle}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <p className="drill-total"><b>{money(total)}</b> across {txs.length} payment{txs.length === 1 ? '' : 's'} from {groups.length} payee{groups.length === 1 ? '' : 's'}.</p>
        {moved && <p className="ok" role="status">{moved}</p>}
        <div className="drill-groups">
          {groups.map((g) => (
            <details key={g.payee?.id ?? g.name} className="drill-group" open={groups.length <= 4}>
              <summary>
                <span className="dg-name"><b>{g.name}</b><small>{g.txs.length} payment{g.txs.length === 1 ? '' : 's'}</small></span>
                <span className="dg-total">{money(-g.total)}</span>
              </summary>
              {g.payee && (
                <div className="dg-payee">
                  <span>All {g.name} payments go to</span>
                  <CategorySelect small label={`Category for all ${g.name} payments`} value={g.payee.category} onChange={async (c) => {
                    const n = await setPayee(g.payee!.id, { category: c, kind: kindForCategory(c), checked: true }, true);
                    setMoved(`${g.name} now goes to ${label(c)}. ${n} past payment${n === 1 ? '' : 's'} moved.`);
                  }} />
                </div>
              )}
              <ul className="dg-list">
                {g.txs.map((t) => (
                  <li key={t.id}>
                    <span className="dg-date">{dayName(t.date)}<small>{acct(t.account)}</small></span>
                    <span className="dg-amt">{money(t.amount, { cents: true })}</span>
                    <CategorySelect small label="Move just this payment" value={t.category ?? 'other'} onChange={async (c) => {
                      await updateTransaction(t.id, { category: c, kind: kindForCategory(c) });
                      setMoved(`Moved one payment to ${label(c)}.`);
                    }} />
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
        {spec.link && <Link to={spec.link} className="btn small ghost" onClick={onClose}>Open in Spending</Link>}
      </div>
    </div>
  );
}

export function DrillProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<DrillSpec | null>(null);
  const { pathname, search } = useLocation();
  useEffect(() => setSpec(null), [pathname, search]);   // close when moving to another page
  useEffect(() => {
    if (!spec) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setSpec(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [spec]);
  return <Ctx.Provider value={setSpec}>{children}{spec && <Sheet spec={spec} onClose={() => setSpec(null)} />}</Ctx.Provider>;
}

/** A number or label that opens its transactions when tapped. */
export function DrillLink({ spec, children, className = '' }: { spec: DrillSpec; children: ReactNode; className?: string }) {
  const open = useDrill();
  return <button type="button" className={`drill-link ${className}`} onClick={() => open(spec)}>{children}</button>;
}
