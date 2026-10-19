import { AlertTriangle, Check, CircleCheck, CircleDashed, CircleHelp, Clock, Minus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, PageHeader, Tabs } from '../components/bits';
import { Import } from './Import';
import type { AccountMonth, CheckState, MonthAudit } from '../data/audit';
import { useAudits } from '../data/useAudit';
import { useStore } from '../data/store';
import { monthName } from '../lib/format';
import { OwnerBadge } from './Accounts';

const STATE_WORDS: Record<MonthAudit['state'], string> = { done: 'All in and checked', checks: 'All in, a few things to finish', missing: 'Statements missing', 'in-progress': 'Month still going', empty: 'Nothing yet' };
const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

function MonthIcon({ state, size = 16 }: { state: MonthAudit['state']; size?: number }) {
  if (state === 'done') return <CircleCheck size={size} className="ic-good" aria-label="All in and checked" />;
  if (state === 'checks') return <AlertTriangle size={size} className="ic-warn" aria-label="A few things to finish" />;
  if (state === 'missing') return <X size={size} className="ic-bad" aria-label="Statements missing" />;
  if (state === 'in-progress') return <Clock size={size} className="ic-muted" aria-label="Month still going" />;
  return <Minus size={size} className="ic-muted" aria-label="Nothing yet" />;
}

function Cell({ c, finished }: { c: AccountMonth; finished: boolean }) {
  if (c.state === 'closed') return <span className="cell cell-closed" title="Account not open"><Minus size={14} aria-label="Not open" /></span>;
  if (c.state === 'missing') return finished
    ? <span className="cell cell-missing" title="No statement"><X size={15} strokeWidth={3} aria-label="Missing" /></span>
    : <span className="cell cell-waiting" title="Not in yet"><CircleDashed size={15} aria-label="Not in yet" /></span>;
  if (c.state === 'part') return <span className={`cell ${finished ? 'cell-part' : 'cell-waiting'}`} title={`Only ${short(c.from!)} to ${short(c.to!)}`}><span className="cell-half" aria-label={`Part: to ${short(c.to!)}`} /><small>{short(c.to!)}</small></span>;
  if (c.ties === 'no') return <span className="cell cell-missing" title={`Statement doesn't add up (out by $${Math.abs(c.diff ?? 0).toFixed(2)})`}><AlertTriangle size={15} aria-label="Doesn't add up" /></span>;
  return <span className={`cell cell-full ${c.ties === 'yes' ? 'is-proved' : ''}`} title={c.ties === 'yes' ? 'Whole month, balances add up' : 'Whole month (balances not recorded)'}><Check size={15} strokeWidth={3} aria-label={c.ties === 'yes' ? 'In and adds up' : 'In'} /></span>;
}

const CHECK_ICON: Record<CheckState, JSX.Element> = {
  ok: <CircleCheck size={18} className="ic-good" aria-label="Done" />,
  warn: <AlertTriangle size={18} className="ic-warn" aria-label="To look at" />,
  fail: <X size={18} className="ic-bad" aria-label="Missing" />,
  unknown: <CircleHelp size={18} className="ic-muted" aria-label="Can't tell yet" />,
};

function MonthDetail({ a }: { a: MonthAudit }) {
  const open = a.checks.filter((c) => c.state !== 'ok');
  const done = a.checks.filter((c) => c.state === 'ok');
  return (
    <section className="panel audit-detail" aria-labelledby="audit-month">
      <div className="audit-head">
        <MonthIcon state={a.state} size={26} />
        <div><h2 id="audit-month">{monthName(a.month)}</h2><p className="muted">{a.summary}</p></div>
      </div>
      {open.length > 0 && (
        <ol className="audit-checks">
          {open.map((c) => (
            <li key={c.id} className={`audit-check ac-${c.state}`}>
              {CHECK_ICON[c.state]}
              <div>
                <b>{c.title}</b>
                <p>{c.detail}</p>
                {c.items?.length ? <ul className="audit-items">{c.items.map((x) => <li key={x}>{x}</li>)}</ul> : null}
                {c.fix && <Link className="btn small" to={c.fix.to}>{c.fix.label}</Link>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {done.length > 0 && (
        <details className="audit-done" open={!open.length}>
          <summary>{done.length} check{done.length === 1 ? '' : 's'} passed</summary>
          <ul>{done.map((c) => <li key={c.id}>{CHECK_ICON.ok}<span><b>{c.title}</b> <small>{c.detail}</small></span></li>)}</ul>
        </details>
      )}
    </section>
  );
}

/** Statements: add new ones, and see what's in for every month. One page for getting the data in and proving it's complete. */
export function Statements() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'add' ? 'add' : 'checks';
  return (
    <div className="statements">
      <PageHeader title="Statements">
        <Info>Add a bank CSV, or a data file Claude prepared from your PDF statements: anything already in is skipped, so adding a file twice is safe. Then check each month: a month is trusted once every statement is in and the numbers prove nothing was missed (balances add up, transfers arrive at both ends, pay is there, card repayments match, no unknown accounts).</Info>
      </PageHeader>
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[{ id: 'add', label: 'Add statements' }, { id: 'checks', label: 'What’s in' }]} />
      <div className="tab-body">{tab === 'add' ? <Import embedded /> : <StatementChecks />}</div>
    </div>
  );
}

function StatementChecks() {
  const { data } = useStore();
  const { months, audits, lastFinished } = useAudits();
  const [params, setParams] = useSearchParams();
  const accounts = [...audits.values()][0]?.accounts.map((x) => x.account) ?? [];
  // Start on the most recent finished month that still needs something, else the latest finished month.
  const finished = months.filter((m) => m <= lastFinished);
  const nextUp = [...finished].reverse().find((m) => audits.get(m)!.state !== 'done') ?? finished.at(-1) ?? months.at(-1)!;
  const month = params.get('month') && audits.has(params.get('month')!) ? params.get('month')! : nextUp;
  const a = audits.get(month);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { if (grid.current) grid.current.scrollLeft = grid.current.scrollWidth; }, [months.length]);
  const doneCount = finished.filter((m) => audits.get(m)!.state === 'done').length;

  if (!a) return <p className="muted">Add your first statements to start the checklist.</p>;
  return (
    <div>
      <p className="lead statements-lead">{doneCount} of {finished.length} finished month{finished.length === 1 ? '' : 's'} fully in and checked.</p>

      <section className="panel">
        <div className="panel-head"><h2>Month by month</h2><span className="muted small">Tap a month to see its checklist</span></div>
        <div className="audit-grid-wrap" ref={grid}>
          <table className="audit-grid">
            <thead>
              <tr>
                <th scope="col" className="ag-acct">Account</th>
                {months.map((m) => {
                  const st = audits.get(m)!.state;
                  return (
                    <th key={m} scope="col" className={m === month ? 'is-on' : ''}>
                      <button onClick={() => setParams({ tab: 'checks', month: m }, { replace: true })} aria-pressed={m === month} title={`${monthName(m)}: ${STATE_WORDS[st]}`}>
                        <span>{monthName(m, 'short').replace(/ 20(\d\d)$/, ' ’$1')}</span><MonthIcon state={st} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.key}>
                  <th scope="row" className="ag-acct"><OwnerBadge owner={acc.owner} s={data.settings} /><span>{acc.name}</span></th>
                  {months.map((m) => {
                    const ma = audits.get(m)!;
                    const c = ma.accounts.find((x) => x.account.key === acc.key)!;
                    return <td key={m} className={m === month ? 'is-on' : ''} onClick={() => setParams({ tab: 'checks', month: m }, { replace: true })}><Cell c={c} finished={ma.state !== 'in-progress'} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="audit-legend" aria-label="What the marks mean">
          <li><span className="cell cell-full is-proved"><Check size={13} strokeWidth={3} /></span>Whole month, balances add up</li>
          <li><span className="cell cell-full"><Check size={13} strokeWidth={3} /></span>Whole month</li>
          <li><span className="cell cell-part"><span className="cell-half" /></span>Part of the month</li>
          <li><span className="cell cell-missing"><X size={13} strokeWidth={3} /></span>Missing</li>
          <li><span className="cell cell-waiting"><CircleDashed size={13} /></span>Not in yet (month still going)</li>
        </ul>
      </section>

      <MonthDetail a={a} />
    </div>
  );
}
