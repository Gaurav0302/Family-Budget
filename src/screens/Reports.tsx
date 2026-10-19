import { Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, Printer, Trash2, X } from 'lucide-react';
import { Chart, inRange, RangePicker, seriesColor, type Range } from '../components/Chart';
import { budgetOf, spendOf, useMonthly } from '../data/useMonthly';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Info, MonthPicker, NumberField, PageHeader, PurseBar, Spark, Tabs } from '../components/bits';
import { tone, type Tone } from '../data/guide';
import { DrillLink, drillCategory, drillGroup, drillType, useDrill } from '../components/Drill';
import { addMonths, allMonths, budgetFor, completeMonths, monthOf, summarise } from '../data/analysis';
import { CATEGORIES, CATEGORY, GROUPS } from '../data/categories';
import { reviewMonth, type Finding } from '../data/review';
import { useStore } from '../data/store';
import type { Data } from '../data/types';
import { expectedIncome, financialYear, netWorth, payFor, people } from '../data/wealth';
import { money, monthName, monthOnly, pct } from '../lib/format';

const endOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };

/** One small chart per area, sharing one time span; tap an area's name to see its categories stacked. */
function AreaCharts({ month }: { month: string }) {
  const { data } = useStore();
  const drill = useDrill();
  const m = useMonthly();
  const upTo = m.months.findIndex((x) => x === month) + 1;
  const months = m.months.slice(0, upTo), sums = m.sums.slice(0, upTo);
  const [range, setRange] = useState<Range>('6m');
  const [big, setBig] = useState<string | null>(null);
  const shown = new Set(inRange(months, range));
  const areas = GROUPS.map((g) => {
    const cats = CATEGORIES.filter((c) => !c.system && c.group === g);
    const ids = cats.map((c) => c.id);
    const values = spendOf(sums, ids);
    const inSpan = values.filter((_, i) => shown.has(months[i])).reduce((a, b) => a + b, 0);
    return { g, cats, ids, values, inSpan, now: values[values.length - 1] ?? 0, budget: budgetOf(data.budgets, months, ids) };
  }).filter((a) => a.inSpan > 0).sort((a, b) => b.inSpan - a.inSpan);
  return (
    <div>
      <div className="sec-head">
        <p className="meet-sub">What each area cost, month by month, against its budget. <Info>Bars are what each area cost each month; the dashed line is its budget. Hover or tap a month for the numbers, click it for the payments. Tap ⤢ to split an area into its categories.</Info></p>
        <RangePicker months={months} value={range} onChange={setRange} />
      </div>
      <div className="area-grid">
        {areas.map((a) => {
          const isBig = big === a.g;
          const bud = a.budget[a.budget.length - 1];
          return (
            <div key={a.g} className={`area-card ${isBig ? 'is-big' : ''}`}>
              <div className="area-head">
                <span><b>{a.g}</b><small>{money(a.now)} in {monthOnly(month)}{bud ? ` · budget ${money(bud)}` : ''}</small></span>
                <button className="icon-btn no-print" aria-label={isBig ? `Shrink ${a.g}` : `Split ${a.g} into categories`} aria-expanded={isBig} onClick={() => setBig(isBig ? null : a.g)}>{isBig ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              </div>
              {isBig ? (
                <Chart noRange range={range} kind="stacked" height={240} label={`${a.g} by category`} months={months} highlight={month} partial={m.partial}
                  series={a.cats.map((c, i) => ({ id: c.id, label: c.label, values: spendOf(sums, [c.id]), color: seriesColor(i) })).filter((x) => x.values.some((v) => v > 0)).slice(0, 8)}
                  budget={a.budget} onPick={(mm) => drill(drillGroup(mm, a.g))} />
              ) : (
                <Chart compact noRange range={range} height={110} label={`${a.g} by month`} months={months} highlight={month} partial={m.partial}
                  series={[{ id: a.g, label: a.g, values: a.values, color: 'var(--data)' }]} budget={a.budget} onPick={(mm) => drill(drillGroup(mm, a.g))} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Money in against money out, month by month, with the share kept. */
function InOutChart({ month }: { month: string }) {
  const m = useMonthly();
  const upTo = m.months.findIndex((x) => x === month) + 1;
  const months = m.months.slice(0, upTo), sums = m.sums.slice(0, upTo);
  return (
    <Chart title={<h3>Came in and spent</h3>} label="Came in and spent by month" months={months} highlight={month} partial={m.partial} height={190}
      series={[{ id: 'in', label: 'Came in', values: sums.map((x) => x.income), color: 'var(--s1)' }, { id: 'out', label: 'Spent', values: sums.map((x) => x.spend), color: 'var(--s2)' }]}
      tipExtra={(mm) => { const x = sums[months.indexOf(mm)]; return [{ label: 'Kept', value: `${money(x.kept)} (${pct(x.keptRate)})` }]; }} />
  );
}

/** A ring that fills as last month's plan gets done. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 26, c = 2 * Math.PI * r, f = total ? done / total : 0;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="ring" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="34" cy="34" r={r} className="ring-track" />
      <circle cx="34" cy="34" r={r} className={`ring-fill ${f === 1 ? 'is-done' : ''}`} strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 34 34)" />
      <text x="34" y="39" textAnchor="middle" className="ring-text">{done}/{total}</text>
    </svg>
  );
}

/** A suggested action for a talking point: concrete where the app knows enough, otherwise a prompt to agree one. */
function suggestAction(f: Finding, data: Data, nextMonth: string): string {
  const [kind, id] = f.id.split(':');
  const name = id && CATEGORY[id] ? CATEGORY[id].label : '';
  const budget = id ? budgetFor(data.budgets, id, nextMonth) : 0;
  if (kind === 'over' && name) return budget ? `Keep ${name} to ${money(budget)} in ${monthOnly(nextMonth)}` : `Set a budget for ${name}`;
  if (kind === 'creep' && name) return `Find out why ${name} keeps going up`;
  if (kind === 'split') return `Bring wants back under 30% of pay`;
  if (kind === 'overlap') return `Cancel one of the ${id}`;
  if (kind === 'rise') return `Shop around: ${f.title.replace(/ went up.*$/i, '')}`;
  if (kind === 'home') return 'Ask the rental agent about ending the lease early';
  if (kind === 'unused' && name) return `Stop paying for ${name}`;
  return `Agree what to do: ${f.title}`;
}

interface Step { id: string; title: string; body: ReactNode }

function MoneyMeeting() {
  const { data, updateSettings, setBudget } = useStore();
  const months = useMemo(() => allMonths(data.transactions), [data.transactions]);
  const complete = useMemo(() => completeMonths(data), [data]);
  const [month, setMonth] = useState(complete.at(-1) ?? months.at(-1) ?? '');
  const [text, setText] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [present, setPresent] = useState<number | null>(null);
  const [active, setActive] = useState('m-month');
  const drill = useDrill();

  // Highlight the agenda step that's on screen.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.meet-step')];
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: '-20% 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [month]);

  // On a phone the agenda is a strip: keep the current step in view.
  useEffect(() => { document.querySelector(`.agenda a[href="#${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active]);

  if (!month) return <p className="muted">Add statements first.</p>;
  const r = reviewMonth(data, month);
  const s = r.summary;
  const actions = data.settings.actions ?? [];
  const prev = addMonths(month, -1);
  const lastActions = actions.filter((a) => a.month === prev);
  const nextActions = actions.filter((a) => a.month === month);
  const top = r.findings.filter((f) => f.severity === 'act' || f.severity === 'watch').slice(0, 5);
  const nextMonth = addMonths(month, 1);
  const nwNow = netWorth(data.settings, endOf(month)).total;
  const before = netWorth(data.settings, endOf(prev));
  const nwBefore = before.cash > 0 ? before.total : 0;   // only compare when last month's bank balances are known
  const setActions = (list: typeof actions) => updateSettings({ actions: list });
  const addAction = (t: string) => setActions([...actions, { id: `a${Date.now().toString(36)}`, month, text: t, done: false }]);

  // The trend shows up to six complete months ending with this one.
  const trendMonths = [...complete.filter((m) => m < month).slice(-5), month];
  const trendSums = trendMonths.map((m) => (m === month ? s : summarise(m, data)));
  const trend = (ids: string[]) => trendMonths.map((m, i) => ({ month: m, value: ids.reduce((a, c) => a + (trendSums[i].byCategory[c] ?? 0), 0) }));
  const groups = GROUPS.map((g) => {
    const cats = CATEGORIES.filter((c) => !c.system && c.group === g)
      .map((c) => ({ id: c.id, label: c.label, spent: s.byCategory[c.id] ?? 0, budget: budgetFor(data.budgets, c.id, month), next: budgetFor(data.budgets, c.id, nextMonth) }))
      .filter((c) => c.spent || c.budget || c.next || trend([c.id]).some((x) => x.value));
    const sum = (k: 'spent' | 'budget' | 'next') => cats.reduce((a, c) => a + c[k], 0);
    return { g, cats, spent: sum('spent'), budget: sum('budget'), next: sum('next') };
  }).filter((x) => x.cats.length).sort((a, b) => b.spent - a.spent);
  const tot = (k: 'spent' | 'budget' | 'next') => groups.reduce((a, g) => a + g[k], 0);
  const toggle = (g: string) => setOpenGroups((o) => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const diff = (spent: number, budget: number) => budget ? <span className={spent > budget * 1.05 ? 'bad' : 'good'}>{money(budget - spent, { sign: true })}</span> : '–';

  // The headline: three short facts, each with its own status chip.
  const base = complete.filter((m) => m < month).slice(-3).map((m) => summarise(m, data));
  const usualAll = base.length ? base.reduce((a, b) => a + b.spend, 0) / base.length : 0;
  const change = usualAll ? (s.spend - usualAll) / usualAll : 0;
  const k = s.income ? s.kept / s.income : 0, w = s.income ? s.wants / s.income : 0;
  const spendTone: Tone = !usualAll ? 'partial' : change <= 0.03 ? 'good' : change <= 0.1 ? 'warn' : 'bad';
  const facts = [
    { tone: spendTone, short: !usualAll ? `Spent ${money(s.spend)}.` : Math.abs(change) <= 0.03 ? 'Spent about usual.' : `Spent ${money(Math.abs(s.spend - usualAll))} ${change > 0 ? 'more' : 'less'} than usual.`, chip: `Spending ${!usualAll ? money(s.spend) : Math.abs(change) <= 0.03 ? 'as usual' : `${change > 0 ? '+' : '−'}${pct(Math.abs(change))}`}` },
    { tone: tone('wants', w, s.complete), short: w > 0.3 ? 'Wants ran high.' : 'Wants under control.', chip: `Wants ${pct(w)}` },
    { tone: tone('kept', k, s.complete), short: `Kept ${pct(k)}.`, chip: `Kept ${pct(k)}` },
  ];
  const doneCount = lastActions.filter((a) => a.done).length;
  const leftToKeep = expectedIncome(data.settings, nextMonth) - tot('next');

  const steps: Step[] = [
    { id: 'm-month', title: 'The month', body: (
      <>
        <p className="meet-kicker">{monthName(month)}</p>
        <h2 className="meet-headline">{facts.map((f) => f.short).join(' ')}</h2>
        <ul className="meet-chips">{facts.map((f) => <li key={f.chip} className={`chip-st st-text-${f.tone}`}><i aria-hidden />{f.chip}</li>)}</ul>
        <PurseBar income={s.income} needs={s.needs} wants={s.wants} kept={s.kept} complete={s.complete} onOpen={(t) => drill(drillType(month, t))} />
        <div className="stat-row meet-stats">
          <div><span>Came in</span><b>{money(s.income)}</b></div>
          <div><span>Spent</span><b>{money(s.spend)}</b></div>
          <div><span>Kept</span><b>{money(s.kept)}</b></div>
          {nwNow !== 0 && <div><span>Net worth</span><b>{money(nwNow)}</b><small>{nwBefore ? `${money(nwNow - nwBefore, { sign: true })} on ${monthOnly(prev)}` : ''}</small></div>}
        </div>
        <p className="meet-verdict">{r.verdict.text}</p>
        <div className="meet-chart"><InOutChart month={month} /></div>
      </>
    ) },
    { id: 'm-last', title: 'Last month’s plan', body: lastActions.length ? (
      <div className="meet-plan">
        <Ring done={doneCount} total={lastActions.length} />
        <div>
          <p className="meet-sub">{doneCount === lastActions.length ? 'Everything you planned for ' : `${doneCount} of ${lastActions.length} things planned for `}{monthOnly(month)}{doneCount === lastActions.length ? ' got done.' : ' got done. Tick off the rest if they did.'}</p>
          <ul className="checklist">
            {lastActions.map((a) => (
              <li key={a.id}><label className="check"><input type="checkbox" checked={a.done} onChange={(e) => setActions(actions.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)))} /><span>{a.text}</span></label></li>
            ))}
          </ul>
        </div>
      </div>
    ) : <p className="muted">No plan was set for {monthOnly(month)}. The plan you make in step 6 shows up here next month.</p> },
    { id: 'm-talk', title: 'What to talk about', body: (
      <ul className="talk">
        {top.map((f) => {
          const suggestion = suggestAction(f, data, nextMonth);
          const added = nextActions.some((a) => a.text === suggestion);
          return (
            <li key={f.id} className={`talk-card sev-edge-${f.severity}`}>
              <div className="talk-text"><Badge severity={f.severity} short /><div><strong>{f.title}</strong><p>{f.detail}</p></div></div>
              <button className={`btn small ${added ? 'ghost' : ''} no-print`} disabled={added} onClick={() => addAction(suggestion)} title={suggestion}>
                {added ? <><Check size={15} aria-hidden /> In {monthOnly(nextMonth)}’s plan</> : 'Make this an action'}
              </button>
            </li>
          );
        })}
        {!top.length && <li className="muted">Nothing needs talking about this month.</li>}
      </ul>
    ) },
    { id: 'm-areas', title: 'Each area', body: <AreaCharts month={month} /> },
    { id: 'm-targets', title: 'Targets', body: (
      <>
        <p className="meet-sub">Set what each category should cost in {monthOnly(nextMonth)}. It becomes the budget from then on. <Info>Tap an area to open its categories, and a category or amount to check what's in it. The trend shows the last {trendMonths.length} complete months, this one darker, with the budget as a dashed line.</Info></p>
        <div className="table-wrap">
          <table className="score meeting">
            <thead><tr><th>Area</th><th className="hide-sm">Budget</th><th>Spent</th><th>Left</th><th>Trend</th><th>{monthOnly(nextMonth)} target</th></tr></thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = openGroups.has(g.g);
                return [
                  <tr key={g.g} className="grp-row">
                    <th scope="row"><button className="grp-toggle" aria-expanded={isOpen} onClick={() => toggle(g.g)}><ChevronRight size={15} aria-hidden className={isOpen ? 'rot' : ''} />{g.g}</button></th>
                    <td className="hide-sm">{g.budget ? money(g.budget) : '–'}</td>
                    <td><DrillLink spec={drillGroup(month, g.g)}>{money(g.spent)}</DrillLink></td>
                    <td>{diff(g.spent, g.budget)}</td>
                    <td><Spark label={`${g.g} by month`} values={trend(g.cats.map((c) => c.id))} highlight={month} budget={g.budget} /></td>
                    <td>{g.next ? money(g.next) : '–'}</td>
                  </tr>,
                  ...g.cats.map((c) => (
                    <tr key={c.id} className={`cat-sub ${isOpen ? '' : 'is-folded'}`}>
                      <th scope="row"><DrillLink spec={drillCategory(month, c.id)}>{c.label}</DrillLink></th>
                      <td className="hide-sm">{c.budget ? money(c.budget) : '–'}</td>
                      <td><DrillLink spec={drillCategory(month, c.id)}>{money(c.spent)}</DrillLink></td>
                      <td>{diff(c.spent, c.budget)}</td>
                      <td><Spark label={`${c.label} by month`} values={trend([c.id])} highlight={month} budget={c.budget} /></td>
                      <td><NumberField label={`${c.label} target for ${monthOnly(nextMonth)}`} width="5.5em" value={c.next} onSave={(n) => setBudget(c.id, nextMonth, n)} /></td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
            <tfoot><tr><th scope="row">Total</th><td className="hide-sm">{money(tot('budget'))}</td><td>{money(tot('spent'))}</td><td>{diff(tot('spent'), tot('budget'))}</td><td><Spark label="All spending by month" values={trend(groups.flatMap((g) => g.cats.map((c) => c.id)))} highlight={month} budget={tot('budget')} /></td><td>{money(tot('next'))}</td></tr></tfoot>
          </table>
        </div>
      </>
    ) },
    { id: 'm-next', title: `Plan for ${monthOnly(nextMonth)}`, body: (
      <>
        {tot('next') > 0 && s.income > 0 && (
          <div className={`meet-keep st-text-${tone('kept', leftToKeep / Math.max(1, expectedIncome(data.settings, nextMonth)))}`}>
            <span>The targets add up to <b>{money(tot('next'))}</b>, leaving about</span>
            <b className="meet-keep-num">{money(leftToKeep)}</b>
            <span>of expected pay to keep in {monthOnly(nextMonth)} ({pct(leftToKeep / Math.max(1, expectedIncome(data.settings, nextMonth)))}).</span>
          </div>
        )}
        <ul className="checklist">
          {nextActions.map((a) => (
            <li key={a.id}><span>{a.text}</span><button className="icon-btn no-print" aria-label={`Remove ${a.text}`} onClick={() => setActions(actions.filter((x) => x.id !== a.id))}><Trash2 size={15} /></button></li>
          ))}
          {!nextActions.length && <li className="muted">Nothing planned yet. Add something below, or use “Make this an action” in step 3.</li>}
        </ul>
        <form className="inline-form no-print" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; addAction(text.trim()); setText(''); }}>
          <input placeholder="e.g. Cap takeaway at $300" value={text} onChange={(e) => setText(e.target.value)} aria-label="New action" />
          <button className="btn small">Add</button>
        </form>
        <p className="fine no-print">Next month's meeting starts by asking whether these got done.</p>
      </>
    ) },
  ];

  return (
    <div className="meeting-wrap">
      <nav className="agenda no-print" aria-label="Meeting agenda">
        <ol>
          {steps.map((st, i) => (
            <li key={st.id}><a href={`#${st.id}`} className={active === st.id ? 'on' : ''} onClick={(e) => { e.preventDefault(); document.getElementById(st.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <span className="agenda-n">{i + 1}</span><span>{st.title}</span></a></li>
          ))}
        </ol>
        <button className="btn primary present-btn" onClick={() => setPresent(0)} aria-label="Present the meeting, one step at a time"><Play size={16} aria-hidden /><span className="pb-text">Present</span></button>
      </nav>
      <div className="report meeting-body">
        <div className="report-tools no-print">
          <MonthPicker months={months} value={month} onChange={setMonth} />
          <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print or save as PDF</button>
        </div>
        {steps.map((st, i) => (
          <section key={st.id} id={st.id} className="meet-step" aria-labelledby={`${st.id}-h`}>
            <h3 id={`${st.id}-h`} className="meet-step-h"><span className="agenda-n">{i + 1}</span>{st.title}</h3>
            {st.body}
          </section>
        ))}
      </div>
      {present !== null && <Present steps={steps} index={present} onIndex={setPresent} month={month} />}
    </div>
  );
}

/** One step at a time, full screen, for going through the meeting together. Arrow keys or swipe to move; Escape to leave. */
function Present({ steps, index, onIndex, month }: { steps: Step[]; index: number; onIndex: (i: number | null) => void; month: string }) {
  const go = (d: number) => onIndex(Math.max(0, Math.min(steps.length - 1, index + d)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      if (e.key === 'Escape') onIndex(null);
    };
    window.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; };
  });
  const start = useRef<number | null>(null);
  const st = steps[index];
  return (
    <div className="present" role="dialog" aria-modal="true" aria-label={`Money meeting, ${monthName(month)}`}
      onPointerDown={(e) => { if (e.pointerType !== 'mouse') start.current = e.clientX; }}
      onPointerUp={(e) => { if (start.current !== null) { const dx = e.clientX - start.current; if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1); start.current = null; } }}>
      <header className="present-top">
        <span className="present-title">Money meeting · {monthName(month)}</span>
        <ol className="present-dots" aria-label="Steps">{steps.map((x, i) => <li key={x.id}><button className={i === index ? 'on' : ''} aria-label={`${i + 1}. ${x.title}`} aria-current={i === index ? 'step' : undefined} onClick={() => onIndex(i)} /></li>)}</ol>
        <button className="icon-btn" onClick={() => onIndex(null)} aria-label="Leave present mode"><X size={22} /></button>
      </header>
      <main className="present-body" key={st.id}>
        <h2 className="present-h"><span className="agenda-n">{index + 1}</span>{st.title}</h2>
        {st.body}
      </main>
      <footer className="present-nav">
        <button className="btn" disabled={index === 0} onClick={() => go(-1)}><ChevronLeft size={18} aria-hidden /> {index > 0 ? steps[index - 1].title : 'Back'}</button>
        {index < steps.length - 1
          ? <button className="btn primary" onClick={() => go(1)}>{steps[index + 1].title} <ChevronRight size={18} aria-hidden /></button>
          : <button className="btn primary" onClick={() => onIndex(null)}>Finish</button>}
      </footer>
    </div>
  );
}

function FinancialYear() {
  const { data } = useStore();
  const s = data.settings;
  const months = allMonths(data.transactions);
  const fys = [...new Set(months.map(financialYear))].reverse();
  const [fy, setFy] = useState(fys[0] ?? '');
  if (!fy) return <p className="muted">Add statements first.</p>;
  const start = Number(fy.slice(0, 4));
  const fyMonths = Array.from({ length: 12 }, (_, i) => addMonths(`${start}-07`, i));
  const have = fyMonths.filter((m) => months.includes(m));
  const complete = new Set(completeMonths(data));
  const sums = have.map((m) => summarise(m, data));
  const total = (f: (x: ReturnType<typeof summarise>) => number) => sums.reduce((a, x) => a + f(x), 0);
  const owner = new Map(s.accounts.map((a) => [a.key, a.owner]));
  const inFy = data.transactions.filter((t) => have.includes(monthOf(t.date)));
  const pay = new Map<string, number>(), interest = new Map<string, number>();
  for (const t of inFy) {
    const who = owner.get(t.account) ?? 'Joint';
    if (t.category === 'salary') pay.set(who, (pay.get(who) ?? 0) + t.amount);
    if (t.category === 'interest') interest.set(who, (interest.get(who) ?? 0) + t.amount);
  }
  const superIn = people(s).map((p) => ({ p, amount: have.reduce((a, m) => { const e = payFor(s, p, m); return a + (e ? (e.grossYearly / 12) * (e.superPct / 100) + e.salarySacrifice : 0); }, 0) }));
  const groups = GROUPS.map((g) => ({ g, amount: Object.entries(sums.reduce((acc, x) => { for (const [c, v] of Object.entries(x.byCategory)) acc[c] = (acc[c] ?? 0) + v; return acc; }, {} as Record<string, number>))
    .filter(([c]) => CATEGORY[c]?.group === g).reduce((a, [, v]) => a + v, 0) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const cat = (id: string) => inFy.filter((t) => t.category === id && t.kind === 'spend').reduce((a, t) => a - t.amount, 0);
  const inc = total((x) => x.income), spend = total((x) => x.spend);

  return (
    <div className="report">
      <div className="report-tools no-print">
        <select value={fy} onChange={(e) => setFy(e.target.value)} aria-label="Financial year">{fys.map((f) => <option key={f} value={f}>Financial year {f}</option>)}</select>
        <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print or save as PDF</button>
      </div>
      <header className="report-head">
        <h2>Financial year {fy}</h2>
        <p>1 July {start} to 30 June {start + 1}. {have.length < 12 ? `Covers ${have.length} of 12 months so far` : 'All 12 months'}{have.some((m) => !complete.has(m)) ? '; some months are missing accounts, so totals are low' : ''}.</p>
      </header>
      <div className="stat-row">
        <div><span>Came in</span><b>{money(inc)}</b></div>
        <div><span>Spent</span><b>{money(spend)}</b></div>
        <div><span>Kept</span><b>{money(inc - spend)} ({pct(inc ? (inc - spend) / inc : 0)})</b></div>
      </div>
      <div className="wealth-grid">
        <section className="report-sec">
          <h3>Income</h3>
          <ul className="value-list">
            {[...pay].map(([p, v]) => <li key={p}><span>{p}'s take-home pay</span><span>{money(v)}</span></li>)}
            {[...interest].map(([p, v]) => <li key={`i${p}`}><span>{p}'s bank interest</span><span>{money(v)}</span></li>)}
            {superIn.filter((x) => x.amount).map((x) => <li key={`s${x.p}`}><span>Into {x.p}'s super</span><span>{money(x.amount)}</span></li>)}
          </ul>
        </section>
        <section className="report-sec">
          <h3>For tax time <Info>Things your accountant usually asks about. Bank interest is taxable income. Donations to registered charities ($2 or more) are deductible with a receipt.</Info></h3>
          <ul className="value-list">
            <li><span>Donations</span><span>{money(cat('donations'))}</span></li>
            <li><span>Accountant & tax fees</span><span>{money(cat('accountant'))}</span></li>
            <li><span>Income protection paid personally</span><span>{money(cat('life-insurance'))}</span></li>
            <li><span>Bank interest earned</span><span>{money([...interest.values()].reduce((a, b) => a + b, 0))}</span></li>
          </ul>
        </section>
      </div>
      <section className="report-sec">
        <h3>Spending by area</h3>
        <table className="score compact">
          <thead><tr><th>Area</th><th>Spent</th><th>Share</th></tr></thead>
          <tbody>{groups.map((x) => <tr key={x.g}><th scope="row">{x.g}</th><td>{money(x.amount)}</td><td>{pct(x.amount / (spend || 1))}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

export function Reports() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'meeting' | 'year') ?? 'meeting';
  return (
    <div>
      <PageHeader title="Reports">
        <div className="no-print"><Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[{ id: 'meeting', label: 'Money meeting' }, { id: 'year', label: 'Financial year' }]} /></div>
      </PageHeader>
      {tab === 'meeting' ? <MoneyMeeting /> : <FinancialYear />}
    </div>
  );
}
