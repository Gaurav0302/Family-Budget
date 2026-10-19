/** Property → Plans, Edit plan and Record: the Loan Planner's way of planning and tracking a loan, on the family's real figures. */
import { Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, Tabs } from '../components/bits';
import { Chart } from '../components/Chart';
import { addMonths, budgetFor, monthOf } from '../data/analysis';
import {
  checkInNet, checkInsOf, describeChange, duplicatePlan, estimateRepayment, expectedAt, FACT_KINDS, formatValue, guessKinds, mon,
  presets, summarize, valueBefore, whatIfs,
} from '../data/plans';
import { activePlanOf, planFrom, plansOf, propertiesOf, runLoan, toIdx, toYM, uniPlanOf, type LoanView } from '../data/property';
import { useStore } from '../data/store';
import type { BudgetLine, LoanPlan, Property, PropertyLoan } from '../data/types';
import { cashAfterSettlement, offsetAtStart, useForecast, useLoan } from '../data/useProperties';
import { monthlyAt } from '../data/uni';
import type { Change, ChangeType } from '../loan';
import { money, thisMonth } from '../lib/format';
import { earners, PER_MONTH } from '../data/wealth';

const yrs = (m: number) => `${(Math.abs(m) / 12).toFixed(1)} yrs`;
const dur = (m: number) => { const a = Math.abs(m); return a >= 24 ? `${(a / 12).toFixed(1)} years` : `${a} ${a === 1 ? 'month' : 'months'}`; };
const k$ = (n: number) => { const a = Math.abs(n); return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}m` : a >= 10000 ? `$${Math.round(a / 1000)}k` : money(a); };
const id = (pfx: string) => `${pfx}${Math.random().toString(36).slice(2, 9)}`;
const ago = (iso: string) => { if (!iso) return ''; const d = (Date.now() - new Date(iso).getTime()) / 864e5; return d < 1 ? 'Edited today' : d < 2 ? 'Edited yesterday' : `Edited ${Math.round(d)} days ago`; };

/** Save a change to one property's loan (and, with it, any budget lines) in one step. */
function useSaveLoan(p: Property) {
  const { data, setBudgetWith } = useStore();
  return (patch: Partial<PropertyLoan>, lines: BudgetLine[] = []) => {
    const list = propertiesOf(data.settings, data.budgets);
    const next = list.map((x) => (x.id === p.id ? { ...x, loan: { ...x.loan!, ...patch } } : x));
    return setBudgetWith(lines, { properties: next });
  };
}

/** Month input that never goes blank. */
function MonthField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return <label className="lp-field"><span>{label}</span><input type="month" value={value} min={min} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} /></label>;
}
function MoneyField({ label, value, onChange, step = 50, prefix = '$', suffix, hint, was }: { label: string; value: number; onChange: (v: number) => void; step?: number; prefix?: string; suffix?: string; hint?: ReactNode; was?: string }) {
  const [t, setT] = useState<string | null>(null);
  return (
    <label className="lp-field">
      <span>{label}{was && <small className="lp-was">{was}</small>}</span>
      <span className="money-input">{prefix && <span aria-hidden>{prefix}</span>}
        <input inputMode="decimal" step={step} value={t ?? String(step < 1 ? Math.round(value * 100) / 100 : Math.round(value))} onChange={(e) => setT(e.target.value.replace(/[^\d.-]/g, ''))}
          onBlur={() => { if (t !== null) { onChange(Number(t || 0)); setT(null); } }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        {suffix && <span aria-hidden className="suffix">{suffix}</span>}</span>
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/* ================= Plans ================= */

export function PlansTab({ p }: { p: Property }) {
  const { data } = useStore();
  const { f, st } = useForecast();
  const [, setParams] = useSearchParams();
  const save = useSaveLoan(p);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const plans = plansOf(p);
  const active = activePlanOf(p);
  const from = planFrom(p);
  const rows = useMemo(() => plans.map((plan) => {
    const v = runLoan(data, p, { plan, offsetStart: offsetAtStart(p, st, f.start.cash, plan, data.settings) })!;
    return { plan, v, sum: summarize(v) };
  }), [data, p, st, f]);
  const activeRow = rows.find((r) => r.plan.id === active.id) ?? rows[0];
  if (!activeRow) return <p className="muted">Add the loan first, in Edit plan.</p>;
  const tests = whatIfs(activeRow.plan, activeRow.v);
  const edit = (planId: string) => setParams({ tab: 'edit', plan: planId }, { replace: false });
  const budgetExtra = budgetFor(data.budgets, 'keep-savings', from);
  const withPlans = (list: LoanPlan[]) => ({ plans: list, activePlan: p.loan?.activePlan ?? active.id });
  const duplicate = async (plan: LoanPlan) => {
    const copy = duplicatePlan({ ...plan, extra: plan.id === active.id ? budgetExtra : plan.extra }, plans);
    await save(withPlans([...plans, copy]));
    edit(copy.id);
  };
  // The active plan's "extra into the offset" is the Budget's Savings & offset line: switching plans swaps the figure there.
  const makeActive = (plan: LoanPlan) => save(
    { plans: plans.map((x) => (x.id === active.id ? { ...x, extra: budgetExtra } : x)), activePlan: plan.id },
    plan.extra !== undefined && plan.extra !== budgetExtra ? [{ category: 'keep-savings', from, amount: plan.extra }] : [],
  );

  return (
    <>
      <div className="lp-intro">
        <p className="muted">One plan is active at a time: the Overview, the forecast and the Budget follow it. What really happened applies to every plan; each plan keeps its own guesses about the future.</p>
        <button className="btn primary" onClick={() => duplicate(active)}>New plan from {active.name}</button>
      </div>
      <div className="lp-cards">
        {rows.map(({ plan, sum }) => {
          const isActive = plan.id === active.id;
          const guesses = plan.changes.length + plan.lumps.length;
          const extra = isActive ? budgetExtra : plan.extra ?? budgetExtra;
          return (
            <article key={plan.id} className={`panel lp-card ${isActive ? 'is-active' : ''}`} aria-label={plan.name}>
              <div className="lp-card-head"><span className="lp-name"><i className="lp-dot" style={{ background: plan.color }} aria-hidden /><h2>{plan.name}</h2></span>{isActive && <span className="lp-badge">Active</span>}</div>
              <dl className="lp-metrics">
                <div><dt>Paid off</dt><dd>{mon(toYM(sum.paidIdx))}</dd></div>
                <div><dt>Interest</dt><dd>{k$(sum.interest)}</dd></div>
                <div><dt>Into the offset</dt><dd>{plan.sweep ? 'All spare' : `${money(extra)}/mo`}</dd></div>
              </dl>
              <p className="lp-saves">Saves {yrs(sum.timeSaved)} and {k$(sum.interestSaved)} of interest against the bank's schedule</p>
              <ul className="lp-tags"><li>{plan.sweep ? 'All spare money into the offset' : `${money(extra)} extra a month`}</li><li>{guesses} {guesses === 1 ? 'guess' : 'guesses'}</li>{(plan.growth ?? 0) > 0 && <li>Pay rises {plan.growth}% a year</li>}</ul>
              {sum.overAsks && <p className="lp-warn">A typical month has only about {money(sum.typicalSpare)} spare, so not all of the {money(extra)} can go in.</p>}
              {sum.unfunded > 0 ? <p className="lp-warn">Some months cost more than pay and the offset can cover.</p> : sum.shortMonths > 0 ? <p className="lp-warn">{sum.shortMonths} {sum.shortMonths === 1 ? 'month costs' : 'months cost'} more than pay; {k$(sum.drawn)} comes out of the offset.</p> : null}
              <p className="muted small">{localStorage.getItem(`fb:draft:${p.id}:${plan.id}`) ? 'Has unsaved edits. ' : ''}{ago(plan.editedAt)}</p>
              <div className="lp-actions">
                <button className="btn" onClick={() => edit(plan.id)}>Edit</button>
                <button className="btn" onClick={() => duplicate(plan)}>Duplicate</button>
                {isActive ? <span className="btn ghost" aria-disabled>Active</span> : <button className="btn primary" onClick={() => makeActive(plan)}>Make active</button>}
              </div>
              {plans.length > 1 && !isActive && (confirmDelete === plan.id ? (
                <div className="lp-confirm" role="alertdialog" aria-label={`Delete ${plan.name}?`}>
                  <span className="small">Delete {plan.name}? This can't be undone.</span>
                  <button className="btn small danger" onClick={() => { save(withPlans(plans.filter((x) => x.id !== plan.id))); setConfirmDelete(null); }}>Delete plan</button>
                  <button className="btn small" onClick={() => setConfirmDelete(null)}>Keep it</button>
                </div>
              ) : <button className="link danger small" onClick={() => setConfirmDelete(plan.id)}>Delete this plan</button>)}
            </article>
          );
        })}
      </div>

      {rows.length > 1 && (
        <section className="panel" aria-labelledby="side">
          <h2 id="side">Side by side</h2>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Plans side by side (table)">
            <table className="score lp-compare">
              <thead><tr><td />{rows.map((r) => <th key={r.plan.id} scope="col"><i className="lp-dot" style={{ background: r.plan.color }} aria-hidden /> {r.plan.name}</th>)}</tr></thead>
              <tbody>
                {([
                  ['Loan paid off', (r) => mon(toYM(r.sum.paidIdx))],
                  ['Time saved against the bank', (r) => yrs(r.sum.timeSaved)],
                  ['Interest paid', (r) => k$(r.sum.interest)],
                  ['Interest saved against the bank', (r) => k$(r.sum.interestSaved)],
                  ['Into the offset', (r) => (r.plan.sweep ? 'all spare money' : `${money(r.plan.id === active.id ? budgetExtra : r.plan.extra ?? budgetExtra)} a month`)],
                  ['Guesses about the future', (r) => String(r.plan.changes.length + r.plan.lumps.length)],
                ] as [string, (r: (typeof rows)[number]) => string][]).map(([label, fn]) => <tr key={label}><th scope="row">{label}</th>{rows.map((r) => <td key={r.plan.id}>{fn(r)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="whatif">
        <div className="panel-head"><h2 id="whatif">What if one thing changed?</h2><span className="muted small">From {activeRow.plan.name}: paid off {mon(toYM(activeRow.sum.paidIdx))}, {k$(activeRow.sum.interest)} interest</span></div>
        <ul className="lp-whatif">
          {tests.map((t) => (
            <li key={t.label}>
              <span>{t.label}{t.note && <small className="muted lp-note">{t.note}</small>}</span>
              <span>{mon(toYM(t.paidIdx))}</span>
              <span className={t.months < 0 ? 'st-text-good tone' : t.months > 0 ? 'st-text-bad tone' : 'muted'}>{t.months === 0 ? 'same date' : `${dur(t.months)} ${t.months < 0 ? 'sooner' : 'later'}`}</span>
              <span className={t.interest < -500 ? 'st-text-good tone' : t.interest > 500 ? 'st-text-bad tone' : 'muted'}>{Math.abs(t.interest) < 500 ? 'same interest' : `${t.interest < 0 ? '−' : '+'}${k$(t.interest)} interest`}</span>
            </li>
          ))}
        </ul>
        <p className="fine">A higher rate can show an earlier date because the bank raises the required repayment. The interest figure is the true cost.</p>
      </section>
    </>
  );
}

/* ================= Edit plan ================= */

type Section = 'loan' | 'household' | 'paying' | 'changes';
type LoanFields = Pick<PropertyLoan, 'amount' | 'rate' | 'term' | 'firstRepayment' | 'repayment' | 'loanAccount' | 'offsetAccount'>;
interface Draft { plan: LoanPlan; loan: LoanFields }
const pickLoan = (l: PropertyLoan): LoanFields => ({ amount: l.amount, rate: l.rate, term: l.term, firstRepayment: l.firstRepayment, repayment: l.repayment, loanAccount: l.loanAccount, offsetAccount: l.offsetAccount });

export function EditPlan({ p, planId }: { p: Property; planId?: string }) {
  const { data } = useStore();
  const { f, st } = useForecast();
  const [, setParams] = useSearchParams();
  const save = useSaveLoan(p);
  const [section, setSection] = useState<Section>('loan');
  const plans = plansOf(p);
  const active = activePlanOf(p);
  const saved = plans.find((x) => x.id === planId) ?? active;
  const isActive = saved.id === active.id;
  const from = planFrom(p);
  const budgetExtra = budgetFor(data.budgets, 'keep-savings', from);
  const savedDraft: Draft = { plan: { ...saved, extra: isActive ? budgetExtra : saved.extra ?? budgetExtra }, loan: pickLoan(p.loan!) };
  const key = `fb:draft:${p.id}:${saved.id}`;
  const read = (): Draft | null => { try { const t = localStorage.getItem(key); return t ? JSON.parse(t) : null; } catch { return null; } };
  const [draft, setDraftState] = useState<Draft>(() => read() ?? savedDraft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const setDraft = (d: Draft) => { setDraftState(d); try { if (JSON.stringify(d) === JSON.stringify(savedDraft)) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(d)); } catch { /* storage off */ } };
  const setPlan = (patch: Partial<LoanPlan>) => setDraft({ ...draft, plan: { ...draft.plan, ...patch } });
  const setLoan = (patch: Partial<LoanFields>) => setDraft({ ...draft, loan: { ...draft.loan, ...patch } });

  const pd: Property = { ...p, loan: { ...p.loan!, ...draft.loan } };
  const extraChange: Change[] = isActive ? [{ id: 'draft-extra', month: from, type: 'extra', value: draft.plan.extra ?? 0 }] : [];
  const now = useLoan(pd, draft.plan, extraChange);
  const before = useLoan(p, saved);
  if (!now || !before) return <p className="muted">Add the loan amount, rate and first repayment to start.</p>;
  const sum = summarize(now), sumBefore = summarize(before);
  const d = sum.paidMonth - sumBefore.paidMonth;
  const chip = d === 0 ? (dirty ? 'Same date as saved' : `${yrs(sum.paidMonth)} of repayments`) : `${dur(d)} ${d < 0 ? 'sooner' : 'later'} than saved`;
  const nowPoint = now.now.points.find((x) => x.idx === toIdx(from)) ?? now.now.points[0];
  const fromPoint = now.now.points.find((x) => x.idx === toIdx(from) - 1) ?? now.now.points[0];
  const was = (a: unknown, b: unknown, fmt: string) => (JSON.stringify(a) !== JSON.stringify(b) ? `was ${fmt}` : undefined);
  const offsetForecast = offsetAtStart({ ...p, loan: { ...p.loan!, offsetStart: undefined } }, st, f.start.cash, { ...draft.plan, offsetStart: undefined }, data.settings);

  const doSave = async () => {
    const plan = { ...draft.plan, name: draft.plan.name.trim() || saved.name, editedAt: new Date().toISOString() };
    const list = plansOf(p).some((x) => x.id === plan.id) ? plansOf(p).map((x) => (x.id === plan.id ? plan : x)) : [...plansOf(p), plan];
    const lines: BudgetLine[] = isActive && (draft.plan.extra ?? 0) !== budgetExtra ? [{ category: 'keep-savings', from, amount: draft.plan.extra ?? 0 }] : [];
    await save({ ...draft.loan, plans: list, activePlan: p.loan?.activePlan ?? active.id }, lines);
    try { localStorage.removeItem(key); } catch { /* storage off */ }
    setDraftState({ ...draft, plan });
  };
  const discard = () => { try { localStorage.removeItem(key); } catch { /* storage off */ } setDraftState(savedDraft); };
  const makeActive = () => save(
    { plans: plans.map((x) => (x.id === active.id ? { ...x, extra: budgetExtra } : x)), activePlan: saved.id },
    saved.extra !== undefined && saved.extra !== budgetExtra ? [{ category: 'keep-savings', from, amount: saved.extra }] : [],
  );

  const months: string[] = [];
  const last = Math.max(now.now.paidIdx, before.now.paidIdx) + 6;
  for (let i = toIdx(now.inputs.setup.start); i <= last; i++) months.push(toYM(i));
  const netAt = (r: LoanView, m: string) => r.now.points.find((x) => x.idx === toIdx(m))?.net ?? 0;
  const s = data.settings;
  const people = earners(s, from);
  const sections: { id: Section; label: string; sum: string }[] = [
    { id: 'loan', label: 'Loan', sum: `${k$(draft.loan.amount)} at ${draft.loan.rate.toFixed(2)}%` },
    { id: 'household', label: 'Household', sum: `${money(nowPoint.takeHome)} a month in` },
    { id: 'paying', label: 'Paying it down', sum: draft.plan.sweep ? 'All spare money' : `${money(draft.plan.extra ?? 0)} extra` },
    { id: 'changes', label: 'Life changes', sum: `${(p.loan?.changes?.length ?? 0) + (p.loan?.lumps?.length ?? 0)} recorded, ${draft.plan.changes.length + draft.plan.lumps.length} guessed` },
  ];

  return (
    <div className="lp-editor-page">
      <div className="lp-editor-head">
        <div className="lp-name-row">
          <button className="link" onClick={() => setParams({ tab: 'plans' })}>‹ All plans</button>
          <i className="lp-dot big" style={{ background: draft.plan.color }} aria-hidden />
          <input className="lp-name-input" aria-label="Plan name" value={draft.plan.name} maxLength={60} onChange={(e) => setPlan({ name: e.target.value })} />
          {isActive ? <span className="lp-badge">Active</span> : <button className="btn small" onClick={makeActive}>Make active</button>}
        </div>
        <div className="lp-save">
          <span className="muted small" role="status">{dirty ? 'Unsaved changes (kept if you leave this page)' : 'All changes saved'}</span>
          <button className="btn" disabled={!dirty} onClick={discard}>Discard</button>
          <button className="btn primary" disabled={!dirty} onClick={doSave}>Save changes</button>
        </div>
      </div>

      <div className="lp-editor">
        <nav className="lp-sections" aria-label="Plan sections">
          {sections.map((x) => (
            <button key={x.id} type="button" aria-current={x.id === section ? 'true' : undefined} className={x.id === section ? 'on' : ''} onClick={() => setSection(x.id)}>
              <b>{x.label}</b><small>{x.sum}</small>
            </button>
          ))}
        </nav>

        <section className="panel lp-form" aria-labelledby="sec-title">
          {section === 'loan' && (
            <>
              <h2 id="sec-title">The loan</h2>
              <p className="muted">How the loan starts. Rate changes that really happen go in Record; guesses about future rates go under Life changes. These apply to every plan.</p>
              <MoneyField label="Loan amount, including LMI" value={draft.loan.amount} onChange={(v) => setLoan({ amount: v })} step={1000} was={was(draft.loan.amount, savedDraft.loan.amount, money(savedDraft.loan.amount))} />
              <MoneyField label="Starting interest rate" prefix="" suffix="%" value={draft.loan.rate} onChange={(v) => setLoan({ rate: v })} step={0.05} was={was(draft.loan.rate, savedDraft.loan.rate, `${savedDraft.loan.rate}%`)} hint="Whenever the rate moves, the repayment is recalculated on the years left, as a lender does." />
              <MoneyField label="Term in years" prefix="" value={draft.loan.term} onChange={(v) => setLoan({ term: Math.max(1, Math.round(v)) })} step={1} was={was(draft.loan.term, savedDraft.loan.term, `${savedDraft.loan.term} years`)} />
              <MonthField label="First repayment" value={draft.loan.firstRepayment} onChange={(v) => setLoan({ firstRepayment: v })} />
              <MoneyField label="The bank's monthly repayment" value={draft.loan.repayment ?? Math.round(nowPoint.repayment || fromPoint.repayment)} onChange={(v) => setLoan({ repayment: v || undefined })} hint="From your loan documents. Leave as is to work it out from the amount, rate and term." />
              <MoneyField label="Cash in the offset at settlement" value={draft.plan.offsetStart ?? offsetForecast} onChange={(v) => setPlan({ offsetStart: v })}
                hint={draft.plan.offsetStart === undefined ? <>{cashAfterSettlement(s, p) !== null ? `From your statements: cash at the end of ${mon(monthOf(p.settlement))}.` : 'From the forecast: what’s left after settlement.'} <button className="link" onClick={() => setPlan({ offsetStart: Math.round(offsetForecast) })}>Set my own</button></> : <button className="link" onClick={() => setPlan({ offsetStart: undefined })}>Use the forecast ({money(offsetForecast)})</button>} />
              <div className="lp-two">
                <label className="lp-field"><span>Loan account</span><select value={draft.loan.loanAccount ?? ''} onChange={(e) => setLoan({ loanAccount: e.target.value || undefined })}><option value="">Not added yet</option>{s.accounts.filter((a) => a.type === 'loan').map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
                <label className="lp-field"><span>Offset account</span><select value={draft.loan.offsetAccount ?? ''} onChange={(e) => setLoan({ offsetAccount: e.target.value || undefined })}><option value="">Not added yet</option>{s.accounts.filter((a) => a.type === 'offset' || a.type === 'savings').map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
              </div>
              <p className="fine">With both accounts added, month-end statement balances become check-ins by themselves. <Link to="/accounts">Accounts</Link></p>
            </>
          )}

          {section === 'household' && (
            <>
              <h2 id="sec-title">Money coming in and going out</h2>
              <p className="muted">Taken from the rest of the app, so it stays true: pay from Wealth (every pay change follows), living costs from your real spending, uni saving from Uni funds. A period on one income or a jump in costs goes under Life changes.</p>
              <dl className="money-rows lp-read">
                {people.map((e) => <div key={e.person}><dt>{e.person}’s take-home</dt><dd>{money(e.takeHome * PER_MONTH[e.every])} a month</dd></div>)}
                <div><dt>Living and property costs</dt><dd>{money(now.inputs.setup.living)} a month</dd></div>
                {now.inputs.rentUntil && <div><dt>Rent until the lease ends</dt><dd>to {mon(now.inputs.rentUntil)}</dd></div>}
                <div><dt>Uni funds</dt><dd>{money((s.uniFunds ?? []).reduce((a, u) => a + monthlyAt(u, from), 0))} a month, {uniPlanOf(s).inOffset ? 'kept in the offset' : 'invested'}</dd></div>
              </dl>
              <p className="fine"><Link to="/wealth?tab=income">Change pay on Wealth</Link> · <Link to="/transactions">See spending</Link> · <Link to="/uni">Uni funds</Link></p>
              <MoneyField label="Pay and costs rise each year" prefix="" suffix="%" value={draft.plan.growth ?? 0} onChange={(v) => setPlan({ growth: v })} step={0.5} was={was(draft.plan.growth ?? 0, savedDraft.plan.growth ?? 0, `${savedDraft.plan.growth ?? 0}%`)} hint="Grows take-home pay, living costs and the extra amount together. 0 keeps today's figures." />
            </>
          )}

          {section === 'paying' && (
            <>
              <h2 id="sec-title">Paying the loan down faster</h2>
              <p className="muted">Everything here goes into the offset, where it cancels interest.</p>
              <MoneyField label="Extra into the offset each month" value={draft.plan.extra ?? 0} onChange={(v) => setPlan({ extra: Math.max(0, v) })} step={50} was={was(draft.plan.extra, savedDraft.plan.extra, money(savedDraft.plan.extra ?? 0))}
                hint={<>{isActive ? `This is the Budget's "Savings & offset" line from ${mon(from)}: saving here changes the budget too.` : 'Used when this plan is active (it then becomes the Budget line).'} A typical month has about {money(sum.typicalSpare)} spare after the repayment, living costs and uni funds{sum.overAsks ? ', so not all of this can go in' : ''}.</>} />
              <label className="check"><input type="checkbox" checked={!!draft.plan.sweep} onChange={(e) => setPlan({ sweep: e.target.checked })} /><span><b>Put all spare money in instead</b><br /><small className="muted">Adjusts itself when pay, costs or the repayment change.</small></span></label>
              <div className="lp-two">
                <MoneyField label="Yearly bonus into the offset" value={draft.plan.bonus ?? 0} onChange={(v) => setPlan({ bonus: Math.max(0, v) })} step={500} />
                <label className="lp-field"><span>Bonus is paid in</span><select value={draft.plan.bonusMonth ?? 7} onChange={(e) => setPlan({ bonusMonth: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2026, i, 1).toLocaleDateString('en-AU', { month: 'long' })}</option>)}</select></label>
              </div>
              <div className="lp-list">
                <h3>Planned lump sums</h3>
                <p className="fine">A tax refund, an inheritance or a sale you expect. Money that has already gone in goes in Record.</p>
                {!draft.plan.lumps.length && <p className="muted small">None yet.</p>}
                {[...draft.plan.lumps].sort((a, b) => a.month.localeCompare(b.month)).map((l) => (
                  <div key={l.id} className="lp-item">
                    <MoneyField label="Amount" value={l.amount} onChange={(v) => setPlan({ lumps: draft.plan.lumps.map((x) => (x.id === l.id ? { ...x, amount: v } : x)) })} step={500} />
                    <MonthField label="Month" value={l.month} onChange={(v) => setPlan({ lumps: draft.plan.lumps.map((x) => (x.id === l.id ? { ...x, month: v } : x)) })} />
                    <button className="icon-btn" aria-label="Remove" onClick={() => setPlan({ lumps: draft.plan.lumps.filter((x) => x.id !== l.id) })}><Trash2 size={15} /></button>
                  </div>
                ))}
                <button className="btn small" onClick={() => setPlan({ lumps: [...draft.plan.lumps, { id: id('l-'), month: addMonths(from, 6), amount: 10000 }] })}>Add a lump sum</button>
              </div>
            </>
          )}

          {section === 'changes' && <LifeChanges p={p} draft={draft.plan} setPlan={setPlan} v={now} from={from} rateThen={fromPoint.rate} />}
        </section>

        <aside className="panel lp-out" aria-label="Results with these settings">
          <p className="lp-kicker">With these settings</p>
          <span className="muted small">Loan paid off</span>
          <strong className="lp-out-big">{mon(toYM(sum.paidIdx))}</strong>
          <span className={`lp-chip ${d < 0 ? 'st-text-good' : d > 0 ? 'st-text-bad' : ''}`}>{chip}</span>
          <Chart label="Owed after the offset, these settings and as saved" kind="lines" months={months} range="all" noRange compact height={110}
            series={[{ id: 'now', label: 'These settings', values: months.map((m) => netAt(now, m)), color: 'var(--data)' },
              ...(dirty ? [{ id: 'saved', label: 'As saved', values: months.map((m) => netAt(before, m)), color: 'var(--ink-2)', dashed: true }] : [])]} />
          <dl className="lp-out-rows">
            <div><dt>Time saved against the bank</dt><dd className="is-good">{yrs(sum.timeSaved)}</dd></div>
            <div><dt>Interest saved against the bank</dt><dd className="is-good">{k$(sum.interestSaved)}</dd></div>
            <div><dt>Interest paid</dt><dd>{k$(sum.interest)}</dd></div>
            <div><dt>Repayment in {mon(toYM(nowPoint.idx))}</dt><dd>{money(nowPoint.paidOut)}</dd></div>
            {nowPoint.spare < 0
              ? <div><dt>Short in {mon(toYM(nowPoint.idx))}, from the offset</dt><dd className="st-text-bad tone">{money(-nowPoint.spare)}</dd></div>
              : <div><dt>Left without a job in {mon(toYM(nowPoint.idx))}</dt><dd>{money(nowPoint.unallocated)}</dd></div>}
          </dl>
          {sum.shortMonths > 0 && <p className="lp-warn">In {sum.shortMonths} {sum.shortMonths === 1 ? 'month' : 'months'} costs are more than pay. {k$(sum.drawn)} comes out of the offset{sum.unfunded > 0 ? `, and ${k$(sum.unfunded)} more isn't covered at all` : ''}.</p>}
        </aside>
      </div>
    </div>
  );
}

function LifeChanges({ p, draft, setPlan, v, from, rateThen }: { p: Property; draft: LoanPlan; setPlan: (x: Partial<LoanPlan>) => void; v: LoanView; from: string; rateThen: number }) {
  const [, setParams] = useSearchParams();
  const names = v.inputs.earners;
  const kinds = guessKinds(names);
  const [kind, setKind] = useState<ChangeType>('rate');
  const setC = (cid: string, patch: Partial<Change>) => setPlan({ changes: draft.changes.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });
  const add = (list: Omit<Change, 'id'>[]) => setPlan({ changes: [...draft.changes, ...list.map((c) => ({ ...c, id: id('c-') }))] });
  const facts = [...(p.loan?.changes ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  return (
    <>
      <h2 id="sec-title">Life changes</h2>
      <p className="muted">What really happened applies to every plan. Guesses belong to this plan only and stay editable.</p>
      <div className="lp-list">
        <div className="panel-head"><h3>Happened</h3><button className="link" onClick={() => setParams({ tab: 'record' })}>Record a change</button></div>
        {!facts.length && !(p.loan?.lumps ?? []).length && <p className="lp-empty">Nothing recorded yet. When the rate or your payments really change, record it so every plan uses it.</p>}
        {facts.map((c) => <p key={c.id} className="lp-fact">{describeChange(c, names)}</p>)}
        {(p.loan?.lumps ?? []).map((l) => <p key={l.id} className="lp-fact">{money(l.amount)} went into the offset in {mon(l.month)}.</p>)}
      </div>
      <div className="lp-list">
        <h3>This plan's guesses</h3>
        {!draft.changes.length && <p className="lp-empty">No guesses yet. Everything stays as set in the other sections for the whole loan.</p>}
        {[...draft.changes].sort((a, b) => a.month.localeCompare(b.month)).map((c) => (
          <div key={c.id} className="lp-change">
            <p>{describeChange(c, names)}</p>
            <div className="lp-change-controls">
              <MonthField label="From" value={c.month} onChange={(m) => setC(c.id, { month: m, until: c.until ? addMonths(c.until, toIdx(m) - toIdx(c.month)) : undefined })} />
              {c.type === 'sweep'
                ? <label className="lp-field"><span>All spare money</span><select value={c.value ? 'on' : 'off'} onChange={(e) => setC(c.id, { value: e.target.value === 'on' ? 1 : 0 })}><option value="on">On</option><option value="off">Off</option></select></label>
                : <MoneyField label={c.type === 'rate' ? 'New rate' : c.type === 'bonus' ? 'New bonus a year' : 'New amount a month'} prefix={c.type === 'rate' ? '' : '$'} suffix={c.type === 'rate' ? '%' : undefined} value={c.value} step={c.type === 'rate' ? 0.05 : 50} onChange={(val) => setC(c.id, { value: val })} />}
              {c.type !== 'rate' && <label className="lp-field"><span>How long</span><select value={c.until ? 'temp' : 'perm'} onChange={(e) => setC(c.id, { until: e.target.value === 'temp' ? addMonths(c.month, 11) : undefined })}><option value="perm">From then on</option><option value="temp">For a while</option></select></label>}
              {c.until && <MonthField label="Until" value={c.until} min={c.month} onChange={(m) => setC(c.id, { until: m })} />}
              <button className="icon-btn" aria-label="Remove" onClick={() => setPlan({ changes: draft.changes.filter((x) => x.id !== c.id) })}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        <div className="lp-add">
          <label className="lp-field"><span>Add a guess</span><select value={kind} onChange={(e) => setKind(e.target.value as ChangeType)}>{kinds.map((k) => <option key={k.type} value={k.type}>{k.label}</option>)}</select></label>
          <button className="btn" onClick={() => add([{ month: from, type: kind, value: kind === 'rate' ? rateThen : valueBefore(v.now, v.inputs, kind, from) }])}>Add</button>
        </div>
        <p className="fine">Or start from a common one, dated from {mon(from)}:</p>
        <div className="lp-chips">{presets(from, rateThen, v.inputs).map((x) => <button key={x.label} className="chip-btn" onClick={() => add(x.changes)}>{x.label}</button>)}</div>
      </div>
    </>
  );
}

/* ================= Record ================= */

export function RecordTab({ p }: { p: Property }) {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'balances' ? 'balances' : 'change';
  return (
    <>
      {thisMonth() < p.loan!.firstRepayment && <p className="lp-notice">The loan starts in {mon(p.loan!.firstRepayment)}. Until then there's nothing to record; try ideas as guesses in a plan instead. A rate change the bank has already told you about can go here.</p>}
      <div className="lp-intro">
        <p className="muted">Tell the app what really happened. Months before a change stay exactly as they were; everything after is worked out again, for every plan.</p>
        <Tabs value={mode} onChange={(m) => setParams({ tab: 'record', mode: m }, { replace: true })} items={[{ id: 'change', label: 'A change' }, { id: 'balances', label: 'Balances' }]} />
      </div>
      {mode === 'change' ? <RecordChange p={p} /> : <CheckIns p={p} />}
    </>
  );
}

function RecordChange({ p }: { p: Property }) {
  const { data } = useStore();
  const save = useSaveLoan(p);
  const plan = activePlanOf(p);
  const base = useLoan(p, plan);
  const start = p.loan!.firstRepayment;
  const today = thisMonth();
  const [kind, setKind] = useState<ChangeType | 'lump'>('rate');
  const [month, setMonth] = useState(today > start ? today : start);
  const [value, setValue] = useState<number | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [bank, setBank] = useState<'bank' | 'keep'>('bank');
  const [bankPay, setBankPay] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const names = base?.inputs.earners ?? [];
  const before = base ? (kind === 'lump' ? 0 : valueBefore(base.now, base.inputs, kind, month)) : 0;
  const v = value ?? (kind === 'sweep' ? (before ? 0 : 1) : kind === 'lump' ? 10000 : before);
  const prev = base?.now.points.find((x) => x.idx === toIdx(month) - 1);
  const oldPay = prev?.paidOut ?? base?.now.points[0]?.repayment ?? 0;
  const estimate = base ? estimateRepayment(base.now, month, v) : 0;
  // With the rate unchanged the bank's repayment stays as it was.
  const pay = bankPay ?? (kind === 'rate' && Math.abs(v - before) < 1e-9 ? Math.round(oldPay) : Math.round(estimate));
  // "Extra into the offset" is the Budget's Savings & offset line: recording it changes the budget from that month (and back after "until").
  const keepLines = (): BudgetLine[] => {
    const lines: BudgetLine[] = [{ category: 'keep-savings', from: month, amount: v }];
    if (until) lines.push({ category: 'keep-savings', from: addMonths(until, 1), amount: budgetFor(data.budgets, 'keep-savings', addMonths(until, 1)) });
    return lines;
  };
  const change: Change | null = kind === 'lump' ? null : {
    id: id('f-'), month, type: kind, value: v, ...(until && kind !== 'rate' ? { until } : {}),
    ...(kind === 'rate' ? (bank === 'keep' ? { keepPaying: Math.round(oldPay) } : { repayment: pay }) : {}),
  };
  const preview = useLoan(p, plan, kind === 'lump' ? [] : change ? [change] : []);
  const previewLump = useMemo(() => (kind === 'lump' && base ? runLoan(data, p, { plan, offsetStart: base.inputs.setup.offset0, lumps: [{ id: 'x', month, amount: v }] }) : null), [kind, base, month, v]);
  const pv = previewLump ?? preview;
  if (!base || !pv) return <p className="muted">Add the loan first, in Edit plan.</p>;
  const dm = pv.now.paidMonth - base.now.paidMonth, di = pv.now.totalInterest - base.now.totalInterest;
  const reset = () => { setValue(null); setUntil(null); setBankPay(null); setBank('bank'); };
  const record = async () => {
    if (kind === 'lump') await save({ lumps: [...(p.loan!.lumps ?? []), { id: id('fl-'), month, amount: v }] });
    else if (kind === 'extra') await save({}, keepLines());
    else await save({ changes: [...(p.loan!.changes ?? []), change!] });
    setDone(`Recorded. Every plan now uses this from ${mon(month)}.`);
    reset();
  };
  const valueLabel = kind === 'rate' ? 'New rate' : kind === 'lump' ? 'Amount' : kind === 'bonus' ? 'New bonus a year' : 'New amount a month';
  // What's been recorded: facts, lump sums, and changes to the Budget's Savings & offset line from the first repayment.
  const keepFrom = data.budgets.filter((b) => b.category === 'keep-savings' && b.from > start).sort((a, b) => b.from.localeCompare(a.from));
  const recorded = [
    ...(p.loan!.changes ?? []).map((c) => ({ id: c.id, month: c.month, text: describeChange(c, names), undo: () => save({ changes: (p.loan!.changes ?? []).filter((x) => x.id !== c.id) }) })),
    ...(p.loan!.lumps ?? []).map((l) => ({ id: l.id, month: l.month, text: `In ${mon(l.month)}, ${money(l.amount)} went into the offset.`, undo: () => save({ lumps: (p.loan!.lumps ?? []).filter((x) => x.id !== l.id) }) })),
    ...keepFrom.map((b) => ({ id: `keep-${b.from}`, month: b.from, text: `From ${mon(b.from)}, extra into the offset is ${money(b.amount)} a month (the Budget's Savings & offset line).`,
      undo: () => save({}, [{ category: 'keep-savings', from: b.from, amount: budgetFor(data.budgets, 'keep-savings', addMonths(b.from, -1)) }]) })),
  ].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="lp-record">
      <section className="panel" aria-labelledby="rc-title">
        <h2 id="rc-title">Record a change</h2>
        <fieldset className="lp-step">
          <legend>1 · What changed</legend>
          <div className="lp-kinds">{FACT_KINDS.map((k) => <button key={k.type} type="button" aria-pressed={k.type === kind} className={k.type === kind ? 'on' : ''} onClick={() => { setKind(k.type); reset(); setDone(null); }}>{k.label}</button>)}</div>
          <p className="fine">Pay changes go on <Link to="/wealth?tab=income">Wealth</Link>, uni saving on <Link to="/uni">Uni funds</Link>; living costs come from your spending.</p>
        </fieldset>
        <div className="lp-step">
          <span className="lp-step-label">2 · From which month</span>
          <MonthField label={kind === 'lump' ? 'Month it went in' : 'Applies from'} value={month} min={start} onChange={(m) => { setMonth(m); setBankPay(null); if (until && until < m) setUntil(m); }} />
          {today >= start && month > addMonths(today, 1) && <p className="fine st-text-warn tone">That month hasn't happened yet. If this is a guess, add it to a plan's life changes instead.</p>}
          {kind !== 'rate' && kind !== 'lump' && (
            <>
              <label className="lp-field"><span>How long</span><select value={until ? 'temp' : 'perm'} onChange={(e) => setUntil(e.target.value === 'temp' ? addMonths(month, 11) : null)}><option value="perm">From then on</option><option value="temp">For a while</option></select></label>
              {until && <MonthField label="Until" value={until} min={month} onChange={setUntil} />}
            </>
          )}
        </div>
        <div className="lp-step">
          <span className="lp-step-label">3 · {kind === 'sweep' ? 'All spare money' : valueLabel}</span>
          {kind === 'sweep'
            ? <label className="lp-field"><span>Put all spare money in</span><select value={v ? 'on' : 'off'} onChange={(e) => setValue(e.target.value === 'on' ? 1 : 0)}><option value="on">On</option><option value="off">Off</option></select></label>
            : <MoneyField label={valueLabel} prefix={kind === 'rate' ? '' : '$'} suffix={kind === 'rate' ? '%' : undefined} value={v} step={kind === 'rate' ? 0.05 : 50} onChange={setValue} />}
          {kind !== 'lump' && <p className="fine">Up to {mon(addMonths(month, -1))} this was {formatValue(kind, before)}{kind === 'rate' ? ` and the repayment was ${money(oldPay)}` : ''}. Those months stay as they were.</p>}
        </div>
        {kind === 'rate' && (
          <fieldset className="lp-step">
            <legend>4 · What happened to your repayment?</legend>
            <label className={`lp-choice ${bank === 'bank' ? 'on' : ''}`}><input type="radio" name="rp" checked={bank === 'bank'} onChange={() => setBank('bank')} /><span><b>The bank changed it</b><small className="muted">Use the figure on their letter. Estimated from your balance: {money(estimate)}.</small></span></label>
            {bank === 'bank' && <MoneyField label="New repayment" value={pay} step={1} onChange={setBankPay} />}
            <label className={`lp-choice ${bank === 'keep' ? 'on' : ''}`}><input type="radio" name="rp" checked={bank === 'keep'} onChange={() => setBank('keep')} /><span><b>We kept paying {money(oldPay)}</b><small className="muted">Anything above the bank's new repayment goes into the offset.</small></span></label>
          </fieldset>
        )}
        <div className={`lp-preview ${dm < 0 ? 'st-text-good' : dm > 0 ? 'st-text-bad' : ''}`} role="status" aria-live="polite">
          <span className="lp-kicker">If you record this</span>
          <b>Paid off {mon(toYM(pv.now.paidIdx))}{dm === 0 ? ', no change to the date' : `, ${dur(dm)} ${dm < 0 ? 'sooner' : 'later'}`}</b>
          <span>Interest over the loan {Math.abs(di) < 500 ? 'stays about the same' : di < 0 ? `falls by ${k$(-di)}` : `rises by ${k$(di)}`}. Applies to every plan; shown for {plan.name}.</span>
        </div>
        <button className="btn primary" onClick={record}>Record this change</button>
        {done && <p className="st-text-good tone" role="status">{done}</p>}
      </section>
      <section className="panel" aria-labelledby="rec-list">
        <h2 id="rec-list">Recorded so far</h2>
        <p className="fine">These apply to every plan. Undo one, or record a new change instead of editing.</p>
        {!recorded.length && <p className="lp-empty">Nothing recorded yet.</p>}
        <ul className="lp-recorded">{recorded.map((r) => <li key={r.id}><span>{r.text}</span><button className="link danger" onClick={r.undo}>Undo</button></li>)}</ul>
      </section>
    </div>
  );
}

function CheckIns({ p }: { p: Property }) {
  const { data } = useStore();
  const { f, st } = useForecast();
  const save = useSaveLoan(p);
  const plan = activePlanOf(p);
  const start = p.loan!.firstRepayment;
  const today = thisMonth();
  const latestAllowed = today > start ? today : start;
  const all = checkInsOf(data, p).filter((c) => c.month >= start);
  const [month, setMonth] = useState(addMonths(latestAllowed, -1) >= start ? addMonths(latestAllowed, -1) : start);
  const [draft, setDraft] = useState<{ month: string; loan: number; offset: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const offsetStart = offsetAtStart(p, st, f.start.cash, plan, data.settings);
  const kidsIn = uniPlanOf(data.settings).inOffset;
  const exp = useMemo(() => expectedAt(data, p, plan, month, offsetStart), [data, p, plan, month, offsetStart]);
  const existing = all.find((c) => c.month === month);
  const entry = draft && draft.month === month ? draft : existing ? { month, loan: existing.loan, offset: existing.offset } : { month, loan: Math.round(exp.loan), offset: Math.round(exp.offset) };
  const kids = existing?.kids ?? (data.settings.uniFunds ?? []).map(() => NaN);
  const ahead = exp.net - checkInNet({ ...entry, kids }, kidsIn);
  const withIt = useMemo(() => runLoan(data, { ...p, loan: { ...p.loan!, checkIns: [...(p.loan!.checkIns ?? []).filter((c) => c.month !== month), entry] } }, { plan, offsetStart }), [data, p, plan, month, entry.loan, entry.offset, offsetStart]);
  const without = useMemo(() => runLoan(data, p, { plan, offsetStart, anchorBefore: month }), [data, p, plan, month, offsetStart]);
  if (today < start) return <p className="lp-notice">Your loan starts in {mon(start)}. Check-ins open once the first repayment has gone through; until then everything follows {plan.name}.</p>;
  const dm = withIt && without ? withIt.now.paidMonth - without.now.paidMonth : 0;
  const history = [...all].reverse().map((c) => ({ c, net: checkInNet(c, kidsIn), diff: expectedAt(data, p, plan, c.month, offsetStart).net - checkInNet(c, kidsIn) }));
  const typed = (m: string) => (p.loan!.checkIns ?? []).some((c) => c.month === m);
  return (
    <div className="lp-record">
      <section className="panel" aria-labelledby="ci-title">
        <h2 id="ci-title">Check in your balances</h2>
        <p className="fine">Copy the closing balances from your statements. From the latest check-in, every plan works forward from these real figures.{existing?.fromStatements ? ' This month already comes from your statements.' : ''}</p>
        <MonthField label="Balances at the end of" value={month} min={start} max={latestAllowed} onChange={(m) => { setMonth(m); setDraft(null); setDone(null); }} />
        <MoneyField label="Loan balance" value={entry.loan} step={100} onChange={(val) => { setDraft({ ...entry, loan: val }); setDone(null); }} hint={`${plan.name} expects ${money(exp.loan)}`} />
        <MoneyField label="Offset balance" value={entry.offset} step={100} onChange={(val) => { setDraft({ ...entry, offset: val }); setDone(null); }} hint={`Expected ${money(exp.offset)}${kidsIn && (data.settings.uniFunds ?? []).length ? ', including uni money held there' : ''}`} />
        <div className={`lp-preview ${Math.abs(ahead) < 50 ? '' : ahead > 0 ? 'st-text-good' : 'st-text-bad'}`} role="status" aria-live="polite">
          <b>{Math.abs(ahead) < 50 ? 'Right on plan' : ahead > 0 ? `${money(ahead)} ahead of plan` : `${money(-ahead)} behind plan`}</b>
          <span>From here every plan works forward from these balances: {plan.name} is paid off {withIt ? mon(toYM(withIt.now.paidIdx)) : ''}{dm === 0 ? '' : `, ${dur(dm)} ${dm < 0 ? 'sooner' : 'later'} than expected`}.</span>
        </div>
        <button className="btn primary" onClick={async () => { await save({ checkIns: [...(p.loan!.checkIns ?? []).filter((c) => c.month !== month), entry].sort((a, b) => a.month.localeCompare(b.month)) }); setDraft(null); setDone(`Saved balances for ${mon(month)}.`); }}>
          {existing ? `Update ${mon(month)}` : `Save ${mon(month)}`}
        </button>
        {done && <p className="st-text-good tone" role="status">{done}</p>}
        <p className="fine">Uni fund balances are checked in on <Link to="/uni">Uni funds</Link>.</p>
      </section>
      <section className="panel" aria-labelledby="ci-hist">
        <h2 id="ci-hist">Check-in history</h2>
        {!history.length ? <p className="lp-empty">No check-ins yet.</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Check-in history (table)">
            <table className="score">
              <thead><tr><th>Month</th><th>Owed after the offset</th><th>Against plan</th><th /></tr></thead>
              <tbody>{history.map(({ c, net, diff }) => (
                <tr key={c.month}><th scope="row">{mon(c.month)}</th><td>{money(net)}</td>
                  <td className={Math.abs(diff) < 50 ? '' : diff > 0 ? 'st-text-good' : 'st-text-bad'}>{Math.abs(diff) < 50 ? 'on plan' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}</td>
                  <td>{c.fromStatements ? <small className="muted">from statements</small> : typed(c.month) && <button className="link danger" onClick={() => save({ checkIns: (p.loan!.checkIns ?? []).filter((x) => x.month !== c.month) })}>Remove</button>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Info>"Against plan" compares with what {plan.name} expected for that month, working forward from the check-in before it.</Info>
      </section>
    </div>
  );
}
