import { ChevronRight, X } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { monthOf } from '../data/analysis';
import { CATEGORIES, CATEGORY, label } from '../data/categories';
import { budgetOf, spendOf, useMonthly } from '../data/useMonthly';
import { Chart } from './Chart';
import { groupByPayee, kindForCategory } from '../data/payees';
import { useStore } from '../data/store';
import type { Transaction } from '../data/types';
import { money, monthName } from '../lib/format';
import { CategorySelect } from './CategorySelect';
import { Menu } from './Menu';

export interface DrillSpec {
  title: string; subtitle?: string; filter: (t: Transaction) => boolean; link?: string;
  /** For the chart at the top: the month shown, the categories it covers, and how to switch to another month. */
  month?: string; cats?: string[]; make?: (month: string) => DrillSpec;
}

const Ctx = createContext<(spec: DrillSpec) => void>(() => {});
export const useDrill = () => useContext(Ctx);

const spendIn = (month: string) => (t: Transaction) => monthOf(t.date) === month && t.kind === 'spend';
export const drillCategory = (month: string, category: string): DrillSpec => ({
  title: label(category), subtitle: monthName(month), filter: (t) => spendIn(month)(t) && t.category === category,
  link: `/transactions?month=${month}&category=${category}`, month, cats: [category], make: (m) => drillCategory(m, category),
});
export const drillType = (month: string, type: 'need' | 'want'): DrillSpec => ({
  title: type === 'need' ? 'Needs' : 'Wants', subtitle: monthName(month),
  filter: (t) => spendIn(month)(t) && (CATEGORY[t.category ?? 'other']?.type ?? 'want') === type,
  month, cats: CATEGORIES.filter((c) => !c.system && c.type === type).map((c) => c.id), make: (m) => drillType(m, type),
});
export const drillCats = (month: string, title: string, ids: string[]): DrillSpec => ({
  title, subtitle: monthName(month), filter: (t) => spendIn(month)(t) && ids.includes(t.category ?? 'other'),
  month, cats: ids, make: (m) => drillCats(m, title, ids),
});
export const drillGroup = (month: string, group: string): DrillSpec => ({
  title: group, subtitle: monthName(month), filter: (t) => spendIn(month)(t) && CATEGORY[t.category ?? 'other']?.group === group,
  month, cats: CATEGORIES.filter((c) => !c.system && c.group === group).map((c) => c.id), make: (m) => drillGroup(m, group),
});

type Moving = { tx: Transaction } | { payeeId: string; name: string } | null;

function Sheet({ spec: first, onClose }: { spec: DrillSpec; onClose: () => void }) {
  const { data, payeeIdx, setPayee, updateTransaction } = useStore();
  const [spec, setSpec] = useState(first);
  const monthly = useMonthly();
  const navigate = useNavigate();
  const txs = data.transactions.filter(spec.filter);
  const groups = groupByPayee(txs, payeeIdx);
  const total = txs.reduce((a, t) => a - t.amount, 0);
  const acct = (k: string) => data.settings.accounts.find((a) => a.key === k)?.name.replace(/ \(.*\)$/, '') ?? k;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<Moving>(null);
  const [done, setDone] = useState<string | null>(null);
  const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  const mover = (m: NonNullable<Moving>, current: string) => (
    <div className="dl-move">
      <span>{'tx' in m ? 'Move this payment to' : `Move all ${m.name} payments to`}</span>
      <CategorySelect small label="New category" value={current} onChange={async (c) => {
        if ('tx' in m) { await updateTransaction(m.tx.id, { category: c, kind: kindForCategory(c) }); setDone(`Moved one payment to ${label(c)}.`); }
        else { const n = await setPayee(m.payeeId, { category: c, kind: kindForCategory(c), checked: true }, true); setDone(`${m.name}: ${n} payment${n === 1 ? '' : 's'} moved to ${label(c)}. New ones will follow.`); }
        setMoving(null);
      }} />
      <button className="btn small ghost" onClick={() => setMoving(null)}>Cancel</button>
    </div>
  );
  const isMoving = (t: Transaction) => !!moving && 'tx' in moving && moving.tx.id === t.id;

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="drill-title" onClick={onClose}>
      <div className="sheet drill" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div><h2 id="drill-title">{spec.title}</h2><p className="muted">{spec.subtitle ? `${spec.subtitle} · ` : ''}{money(total)} · {txs.length} payment{txs.length === 1 ? '' : 's'}</p></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {spec.cats && spec.make && (
          <div className="drill-chart">
            <Chart compact height={120} label={`${spec.title} by month`} months={monthly.months} series={[{ id: 'x', label: spec.title, values: spendOf(monthly.sums, spec.cats), color: 'var(--euc)' }]}
              budget={budgetOf(data.budgets, monthly.months, spec.cats)} highlight={spec.month} partial={monthly.partial}
              onPick={(m) => { setSpec(spec.make!(m)); setOpen(new Set()); setMoving(null); }} pickLabel="Show this month" />
          </div>
        )}
        {done && <p className="ok drill-done" role="status">{done}</p>}
        <ul className="dl">
          {groups.map((g) => {
            const key = g.payee?.id ?? g.name;
            const single = g.txs.length === 1 ? g.txs[0] : null;
            const isOpen = open.has(key);
            const groupMenu = [
              g.payee && { label: `Move all ${g.name} payments`, onClick: () => setMoving({ payeeId: g.payee!.id, name: g.name }) },
              single && { label: 'Move just this payment', onClick: () => setMoving({ tx: single }) },
              g.payee && { label: 'Edit payee', onClick: () => navigate(`/categories?tab=payees&payee=${g.payee!.id}`) },
            ];
            return (
              <li key={key} className="dl-item">
                <div className="dl-row">
                  {single ? (
                    <span className="dl-main"><b>{g.name}</b><small>{short(single.date)} · {acct(single.account)}</small></span>
                  ) : (
                    <button className="dl-main dl-toggle" aria-expanded={isOpen} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; })}>
                      <ChevronRight size={15} aria-hidden className={isOpen ? 'rot' : ''} />
                      <span><b>{g.name}</b><small>{g.txs.length} payments</small></span>
                    </button>
                  )}
                  <span className="dl-amt">{money(-g.total, { cents: !!single })}</span>
                  <Menu label={`Options for ${g.name}`} items={groupMenu} />
                </div>
                {moving && 'payeeId' in moving && moving.payeeId === g.payee?.id && mover(moving, g.payee!.category)}
                {single && isMoving(single) && mover(moving!, single.category ?? 'other')}
                {!single && isOpen && (
                  <ul className="dl-sub">
                    {g.txs.slice().sort((x, y) => y.date.localeCompare(x.date)).map((t) => (
                      <li key={t.id}>
                        <div className="dl-row">
                          <span className="dl-main"><span>{short(t.date)}</span><small>{acct(t.account)}</small></span>
                          <span className="dl-amt">{money(-t.amount, { cents: true })}</span>
                          <Menu label={`Options for the ${short(t.date)} payment`} items={[{ label: 'Move just this payment', onClick: () => setMoving({ tx: t }) }]} />
                        </div>
                        {isMoving(t) && mover(moving!, t.category ?? 'other')}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {spec.link && <Link to={spec.link} className="drill-more" onClick={onClose}>Open in Spending</Link>}
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
