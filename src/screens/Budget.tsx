import { useMemo, useState } from 'react';
import { Meter, MonthPicker, PageHeader, Tabs } from '../components/bits';
import { SetAsidePanel } from '../components/SetAside';
import { ChevronRight } from 'lucide-react';
import { addMonths, allMonths, average, budgetFor, completeMonths, keepBudget, summarise, totalBudget } from '../data/analysis';
import { GROUPS, KEEP_CATEGORIES, SPEND_CATEGORIES } from '../data/categories';
import { useStore } from '../data/store';
import { expectedIncome } from '../data/wealth';
import { allowance, meterLimit, EVERY_ORDER, EVERY_WORDS, freqOf, lumpy, monthlyOf, switchEvery, nextUnpaid, paidAhead, perTime, suggest, type Suggestion } from '../data/frequency';
import type { Every } from '../data/types';
import { Link } from 'react-router-dom';
import { Info } from '../components/bits';
import { DrillLink, drillCategory } from '../components/Drill';
import { money, monthName, monthOnly, thisMonth } from '../lib/format';
import { today as todayLocal } from '../lib/format';

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
  const { data, setBudget, setBudgetWith, updateSettings } = useStore();
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
  // How this person likes the page: areas folded, and only lines in use. Kept in this browser only.
  const readPref = <T,>(key: string, fallback: T, parse: (v: string) => T): T => { try { const v = localStorage.getItem(key); return v === null ? fallback : parse(v); } catch { return fallback; } };
  const [folded, setFolded] = useState<Set<string>>(() => readPref('fb:budget-folded', new Set<string>(), (v) => new Set(JSON.parse(v) as string[])));
  const [onlyUsed, setOnlyUsed] = useState<boolean>(() => readPref('fb:budget-used', true, (v) => v === '1'));
  const keepPref = <T,>(set: (v: T) => void, key: string, v: T) => { set(v); try { localStorage.setItem(key, v instanceof Set ? JSON.stringify([...v]) : v ? '1' : '0'); } catch { /* storage off */ } };
  const s = summarise(month, data);
  const base = complete.filter((m) => m < month).slice(-3).map((m) => summarise(m, data));
  const keep = keepBudget(data.budgets, month);
  const total = totalBudget(data.budgets, month) + keep;
  const fromPay = (data.settings.pay ?? []).length > 0;
  const income = expectedIncome(data.settings, month);
  const left = income - total;
  const suggestions = useMemo(() => {
    const today = todayLocal();
    return new Map(SPEND_CATEGORIES.map((c) => [c.id, suggest(data, c.id, today)] as const).filter((x): x is [string, Suggestion] => !!x[1]));
  }, [data.transactions, data.settings.splits]);
  /** The frequency settings with one line changed (monthly lines are the default, so they're removed). */
  const freqPatch = (cat: string, every: Every, due?: string) => {
    const cur = data.settings.budgetEvery ?? {};
    const prev = cur[cat];
    const next = { ...cur, [cat]: { every, ...(lumpy(every) ? { due: due ?? (prev?.every === every ? prev.due : suggestions.get(cat)?.due) } : {}) } };
    if (every === 'month') delete next[cat];
    return { budgetEvery: next };
  };
  const setFreq = (cat: string, every: Every, due?: string) => updateSettings(freqPatch(cat, every, due));
  /** A new frequency keeps the amount shown ($410 each month → $410 each term). Amount and frequency are saved together. */
  const changeEvery = (cat: string, every: Every) => {
    const from = freqOf(data.settings, cat).every;
    if (from === every) return;
    const monthly = budgetFor(data.budgets, cat, month);
    return setBudgetWith(monthly ? [{ category: cat, from: month, amount: switchEvery(monthly, from, every) }] : [], freqPatch(cat, every));
  };
  const applySuggestion = (cat: string, sg: Suggestion) =>
    setBudgetWith([{ category: cat, from: month, amount: monthlyOf(sg.per, sg.every) }], freqPatch(cat, sg.every, sg.due));

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

      <SetAsidePanel month={month} />

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

      <div className="budget-tools no-print">
        <Tabs value={onlyUsed ? 'used' : 'all'} onChange={(v) => keepPref(setOnlyUsed, 'fb:budget-used', v === 'used')} items={[{ id: 'used', label: 'Lines in use' }, { id: 'all', label: 'Every line' }]} />
        <button className="link" onClick={() => keepPref(setFolded, 'fb:budget-folded', folded.size ? new Set<string>() : new Set(GROUPS))}>{folded.size ? 'Open every area' : 'Fold every area'}</button>
      </div>

      {GROUPS.map((g) => {
        const all = SPEND_CATEGORIES.filter((c) => c.group === g);
        // "Lines in use": a budget, spending this month or on average, or a change planned later.
        const used = (id: string) => budgetFor(data.budgets, id, month) || (s.byCategory[id] ?? 0) || average(base.map((x) => x.byCategoryUsual[id] ?? 0)) >= 1 || data.budgets.some((x) => x.category === id && x.from > month && x.amount);
        const cats = onlyUsed ? all.filter((c) => used(c.id)) : all;
        if (!cats.length) return null;
        const groupBudget = cats.reduce((a, c) => a + budgetFor(data.budgets, c.id, month), 0);
        const groupSpent = cats.reduce((a, c) => a + (s.byCategory[c.id] ?? 0), 0);
        const isFolded = folded.has(g);
        const over = groupBudget > 0 && groupSpent > groupBudget * 1.05;
        return (
          <section key={g} className={`budget-group ${isFolded ? 'is-folded' : ''}`} aria-labelledby={`g-${g}`}>
            <div className="budget-group-head">
              <h2 id={`g-${g}`}><button className="grp-toggle" aria-expanded={!isFolded} onClick={() => keepPref(setFolded, 'fb:budget-folded', (() => { const n = new Set(folded); if (n.has(g)) n.delete(g); else n.add(g); return n; })())}>
                <ChevronRight size={16} aria-hidden className={isFolded ? '' : 'rot'} />{g}</button></h2>
              <span className={over ? 'st-text-bad' : ''}>{money(groupSpent)} of {money(groupBudget)}{isFolded ? ` · ${cats.length} line${cats.length === 1 ? '' : 's'}` : ''}</span>
            </div>
            {!isFolded && <div className="budget-rows">
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
                  <div key={c.id} className="budget-row freq-row">
                    <div className="budget-name"><b>{c.label}</b>{c.hint && <small>{c.hint}</small>}
                      {differs && (
                        <span className="freq-sug" title={`From your statements: ${sug.why}`}>Looks like {money(sug.per, { cents: sug.per % 1 !== 0 })} {EVERY_WORDS[sug.every].toLowerCase()}
                          <button className="link" onClick={() => applySuggestion(c.id, sug)}>Use this</button></span>
                      )}
                    </div>
                    <div className="fr-amt">
                      <BudgetInput label={`${c.label}, ${EVERY_WORDS[f.every].toLowerCase()}`} value={per} onSave={(n) => setBudget(c.id, month, monthlyOf(n, f.every))} />
                      {f.every !== 'month' && <small>{money(b)} a month</small>}
                      {(() => { const later = data.budgets.filter((x) => x.category === c.id && x.from > month).sort((x, y) => x.from.localeCompare(y.from))[0];
                        return later && <small className="fr-later">{money(perTime(later.amount, f.every))} from {monthName(later.from, 'short')}</small>; })()}
                    </div>
                    <div className="fr-every">
                      <select aria-label={`How often ${c.label} is paid`} value={f.every} onChange={(e) => changeEvery(c.id, e.target.value as Every)}>
                        {EVERY_ORDER.map((x) => <option key={x} value={x}>{EVERY_WORDS[x].toLowerCase()}</option>)}
                      </select>
                    </div>
                    <div className="fr-due">
                      {lump && <input type="month" aria-label={`${c.label} next due`} title="Next due" value={next ?? ''} onChange={(e) => e.target.value && setFreq(c.id, f.every, e.target.value)} />}
                    </div>
                    <div className="budget-spent">
                      <Meter actual={spent} budget={meterLimit(data, c.id, month, spent)} />
                      <small>
                        {s.count ? (spent ? <DrillLink spec={drillCategory(month, c.id)}>{money(spent)} spent</DrillLink> : `${money(spent)} spent`) : 'No spending loaded'}
                        {lump && (al.due && !early ? `, ${money(per)} due this month` : next ? `, next ${money(per)} due ${monthName(next, 'short')}` : `, pick the month it's due`)}
                        {!lump && avg > 0 && <>, average {money(avg)} a month{f.every === 'month' && Math.round(avg) !== Math.round(b) && <button className="link" onClick={() => setBudget(c.id, month, Math.ceil(avg / 10) * 10)}>use</button>}</>}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>}
          </section>
        );
      })}
      <p className="fine">Averages use your last {base.length || 'few'} complete month{base.length === 1 ? '' : 's'}{base.length ? ` (${base.map((b) => monthName(b.month, 'short')).join(', ')})` : ''}, leaving out one-offs.</p>
    </div>
  );
}
