import { useMemo, useState } from 'react';
import { Meter, MonthPicker, PageHeader } from '../components/bits';
import { addMonths, allMonths, average, budgetFor, completeMonths, keepBudget, summarise, totalBudget } from '../data/analysis';
import { GROUPS, KEEP_CATEGORIES, SPEND_CATEGORIES } from '../data/categories';
import { useStore } from '../data/store';
import { expectedIncome } from '../data/wealth';
import { allowance, meterLimit, EVERY_ORDER, EVERY_UNIT, EVERY_WORDS, freqOf, lumpy, monthlyOf, nextUnpaid, paidAhead, perTime, suggest, type Suggestion } from '../data/frequency';
import type { Every } from '../data/types';
import { Link } from 'react-router-dom';
import { Info } from '../components/bits';
import { DrillLink, drillCategory } from '../components/Drill';
import { money, monthName, monthOnly, thisMonth } from '../lib/format';

const show = (v: number) => String(Math.round(v * 100) / 100);

function BudgetInput({ value, onSave, label }: { value: number; onSave: (n: number) => void; label: string }) {
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : show(value);
  return (
    <span className="money-input">
      <span aria-hidden>$</span>
      <input inputMode="numeric" aria-label={`Budget for ${label}`} value={shown}
        onFocus={() => { setText(show(value)); setFocused(true); }}
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={() => { setFocused(false); const n = Number(text || 0); if (Math.abs(n - value) > 0.004) onSave(n); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </span>
  );
}

export function Budget() {
  const { data, setBudget, updateSettings } = useStore();
  const months = useMemo(() => {
    const have = allMonths(data.transactions);
    const end = addMonths(thisMonth(), 6);
    const start = have[0] ?? thisMonth();
    const out: string[] = [];
    for (let m = start; m <= end; m = addMonths(m, 1)) out.push(m);
    return out;
  }, [data.transactions]);
  const complete = useMemo(() => completeMonths(data), [data]);
  const [month, setMonth] = useState(() => (complete.at(-1) && complete.at(-1)! >= thisMonth() ? complete.at(-1)! : thisMonth()));
  const s = summarise(month, data);
  const base = complete.filter((m) => m < month).slice(-3).map((m) => summarise(m, data));
  const keep = keepBudget(data.budgets, month);
  const total = totalBudget(data.budgets, month) + keep;
  const fromPay = (data.settings.pay ?? []).length > 0;
  const income = expectedIncome(data.settings, month);
  const left = income - total;
  const suggestions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return new Map(SPEND_CATEGORIES.map((c) => [c.id, suggest(data, c.id, today)] as const).filter((x): x is [string, Suggestion] => !!x[1]));
  }, [data.transactions, data.settings.splits]);
  const setFreq = (cat: string, every: Every, due?: string) => {
    const cur = data.settings.budgetEvery ?? {};
    const prev = cur[cat];
    const next = { ...cur, [cat]: { every, ...(lumpy(every) ? { due: due ?? (prev?.every === every ? prev.due : suggestions.get(cat)?.due) } : {}) } };
    if (every === 'month') delete next[cat];
    return updateSettings({ budgetEvery: next });
  };
  const applySuggestion = async (cat: string, sg: Suggestion) => {
    await setFreq(cat, sg.every, sg.due);
    await setBudget(cat, month, monthlyOf(sg.per, sg.every));
  };

  return (
    <div>
      <PageHeader title="Budget">
        <Info>Give every dollar a job. A change applies from the month shown onwards; earlier months keep their old budget.</Info>
        <MonthPicker months={months} value={month} onChange={setMonth} />
      </PageHeader>

      <section className={`zero ${Math.abs(left) < 1 ? 'is-zero' : left < 0 ? 'is-over' : ''}`} aria-label="Every dollar has a job">
        <div><span>Take-home pay expected</span>{fromPay
          ? <><b>{money(income)}</b><small><Link to="/wealth?tab=income" className="on-dark">Change on Wealth</Link></small></>
          : <BudgetInput label="expected income" value={income} onSave={(n) => updateSettings({ expectedIncome: n })} />}</div>
        <div><span>Given a job</span><b>{money(total)}</b><small>{money(total - keep)} to spend, {money(keep)} to keep</small></div>
        <div className="zero-left"><span>{left >= 0 ? 'Left to give a job' : 'Budgeted beyond income'}</span><b>{money(Math.abs(left))}</b></div>
        <p>{Math.abs(left) < 1 ? 'Every dollar has a job.'
          : left > 0 ? `Give the remaining ${money(left)} a job: the offset, the uni funds, or savings. Money without a job tends to get spent.`
          : `The plan spends ${money(-left)} more than you expect to earn in ${monthOnly(month)}. Trim a few categories until this reaches zero.`}</p>
      </section>

      <nav className="ahead-strip" aria-label="Money without a job, month by month">
        {months.filter((m) => m >= thisMonth()).slice(0, 7).map((m) => {
          const l = expectedIncome(data.settings, m) - totalBudget(data.budgets, m) - keepBudget(data.budgets, m);
          const t = Math.abs(l) < 1 ? 'good' : l > 0 ? 'warn' : 'bad';
          return (
            <button key={m} className={`ahead-chip st-text-${t} ${m === month ? 'on' : ''}`} onClick={() => setMonth(m)} aria-pressed={m === month}>
              <span>{monthName(m, 'short')}</span><b>{Math.abs(l) < 1 ? 'All set' : `${l > 0 ? '' : '−'}${money(Math.abs(l))}`}</b>
            </button>
          );
        })}
        <Info>Each month's pay less everything budgeted. Amber: money still without a job. Red: the plan spends more than comes in. Tap a month to fix it.</Info>
      </nav>

      <section className="budget-group keep-group" aria-labelledby="g-keep">
        <div className="budget-group-head">
          <h2 id="g-keep">Kept on purpose</h2>
          <span>{s.count ? `${money(s.kept)} kept of ${money(keep)} planned` : `${money(keep)} planned`}</span>
        </div>
        <div className="budget-rows">
          {KEEP_CATEGORIES.map((c) => (
            <div key={c.id} className="budget-row">
              <div className="budget-name"><b>{c.label}</b>{c.hint && <small>{c.hint}</small>}</div>
              <BudgetInput label={c.label} value={budgetFor(data.budgets, c.id, month)} onSave={(n) => setBudget(c.id, month, n)} />
              <div className="budget-spent"><small>{c.id === 'keep-savings' ? `Babylon's tenth of ${money(income)} is ${money(income * 0.1)}` : ''}</small></div>
            </div>
          ))}
        </div>
      </section>

      {GROUPS.map((g) => {
        const cats = SPEND_CATEGORIES.filter((c) => c.group === g);
        const groupBudget = cats.reduce((a, c) => a + budgetFor(data.budgets, c.id, month), 0);
        const groupSpent = cats.reduce((a, c) => a + (s.byCategory[c.id] ?? 0), 0);
        return (
          <section key={g} className="budget-group" aria-labelledby={`g-${g}`}>
            <div className="budget-group-head">
              <h2 id={`g-${g}`}>{g}</h2>
              <span>{money(groupSpent)} of {money(groupBudget)}</span>
            </div>
            <div className="budget-rows">
              {cats.map((c) => {
                const b = budgetFor(data.budgets, c.id, month);
                const spent = s.byCategory[c.id] ?? 0;
                const avg = average(base.map((x) => x.byCategoryUsual[c.id] ?? 0));
                const f = freqOf(data.settings, c.id);
                const per = perTime(b, f.every);
                const lump = lumpy(f.every);
                const al = allowance(data, c.id, month);
                const next = nextUnpaid(data, c.id, month);
                const early = lump && al.due && paidAhead(data, c.id, month);
                const sug = suggestions.get(c.id);
                const differs = sug && sug.every !== f.every;
                return (
                  <div key={c.id} className="budget-row">
                    <div className="budget-name"><b>{c.label}</b>{c.hint && <small>{c.hint}</small>}
                      {differs && (
                        <span className="freq-sug">Looks like {money(sug.per, { cents: sug.per % 1 !== 0 })} {EVERY_WORDS[sug.every].toLowerCase()}: {sug.why}.
                          <button className="link" onClick={() => applySuggestion(c.id, sug)}>Use this</button></span>
                      )}
                    </div>
                    <div className="budget-amt">
                      <BudgetInput label={`${c.label}, ${EVERY_WORDS[f.every].toLowerCase()}`} value={per} onSave={(n) => setBudget(c.id, month, monthlyOf(n, f.every))} />
                      <select aria-label={`How often ${c.label} is paid`} value={f.every} onChange={(e) => setFreq(c.id, e.target.value as Every)}>
                        {EVERY_ORDER.map((x) => <option key={x} value={x}>{EVERY_WORDS[x].toLowerCase()}</option>)}
                      </select>
                      {lump && <label className="due-in">next due<input type="month" aria-label={`${c.label} next due`} value={next ?? ''} onChange={(e) => e.target.value && setFreq(c.id, f.every, e.target.value)} /></label>}
                      {f.every !== 'month' && <small className="muted">{money(b)} a month</small>}
                    </div>
                    <div className="budget-spent">
                      {lump && (early || !al.due) && !spent
                        ? <small>{next ? `${money(per)} due ${monthName(next)}` : `${money(per)} a ${EVERY_UNIT[f.every]}: set a month it's due`}. Set aside {money(b)} a month until then.</small>
                        : <Meter actual={spent} budget={meterLimit(data, c.id, month, spent)} />}
                      <small>
                        {s.count ? (spent ? <DrillLink spec={drillCategory(month, c.id)}>{money(spent)} spent</DrillLink> : `${money(spent)} spent`) : 'No spending loaded'}
                        {lump && al.due ? (early ? `, ${monthOnly(month)}'s ${EVERY_UNIT[f.every]} was paid early` : `, ${money(per)} due this month`) : ''}
                        {!lump && avg > 0 && <>, average {money(avg)}{Math.round(avg) !== Math.round(b) && <button className="link" onClick={() => setBudget(c.id, month, Math.ceil(avg / 10) * 10)}>use</button>}</>}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="fine">Averages use your last {base.length || 'few'} complete month{base.length === 1 ? '' : 's'}{base.length ? ` (${base.map((b) => monthName(b.month, 'short')).join(', ')})` : ''}, leaving out one-offs.</p>
    </div>
  );
}
