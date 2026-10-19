import { useMemo, useState } from 'react';
import { Info, NumberField, PageHeader } from '../components/bits';
import { average, completeMonths, findRecurring, summarise } from '../data/analysis';
import { CATEGORY, SPEND_CATEGORIES } from '../data/categories';
import { useStore } from '../data/store';
import { expectedIncome } from '../data/wealth';
import { yearsMonths } from '../data/whatif';
import { homeProperty, runLoan } from '../data/property';
import { offsetAtStart, useForecast, useLoan } from '../data/useProperties';
import { money, monthName, pct } from '../lib/format';

export function WhatIf() {
  const { data } = useStore();
  const s = data.settings;
  const complete = useMemo(() => completeMonths(data), [data]);
  const recent = complete.slice(-3);
  const sums = useMemo(() => recent.map((m) => summarise(m, data)), [recent.join(), data]);
  const avg = (c: string) => average(sums.map((x) => x.byCategoryUsual[c] ?? 0));
  const wants = SPEND_CATEGORIES.filter((c) => c.type === 'want' && !['other', 'card-unitemised'].includes(c.id) && avg(c.id) >= 40).sort((a, b) => avg(b.id) - avg(a.id));
  const subs = recent.length ? findRecurring(data.transactions, recent.at(-1)).filter((x) => x.every === 'month') : [];
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [cancel, setCancel] = useState<Record<string, boolean>>({});
  const { f, st } = useForecast();
  const home = homeProperty(s, data.budgets);
  const base = useLoan(home);

  if (!recent.length) return <div><PageHeader title="What if" /><p className="muted">Needs at least one complete month of statements.</p></div>;

  const cutSaving = wants.reduce((a, c) => a + Math.max(0, avg(c.id) - (targets[c.id] ?? avg(c.id))), 0);
  const subSaving = subs.filter((x) => cancel[x.merchant]).reduce((a, x) => a + x.monthly, 0);
  const extra = cutSaving + subSaving;

  // Life after settlement and the loan come from the same forecast and loan calculator as Property and the money meeting.
  const after = st.after;
  const income = after?.pay ?? expectedIncome(s, recent.at(-1)!);
  const keptNow = after?.kept ?? 0, keptNew = keptNow + extra;
  const better = home && base ? runLoan(data, home, { offsetStart: offsetAtStart(home, st, f.start.cash, undefined, data.settings), changes: extra > 0 ? [{ id: 'cut', month: base.inputs.setup.start, type: 'living', value: base.inputs.setup.living - extra }] : [] }) : null;
  const hasHome = !!(home && base && after);
  const gone = (v: NonNullable<typeof base>) => yearsMonths(v.now.paidMonth);

  return (
    <div className="whatif">
      <PageHeader title="What if">
        <Info>Starts from your average over {recent.length} complete month{recent.length > 1 ? 's' : ''}. Change a number or tick a subscription to see what it frees up. Nothing here changes your budget.</Info>
      </PageHeader>
      <div className="whatif-grid">
        <div>
          <section className="panel">
            <h2>Spend less on</h2>
            <ul className="whatif-list">
              {wants.map((c) => {
                const a = avg(c.id), t = targets[c.id] ?? a;
                return (
                  <li key={c.id}>
                    <span><b>{c.label}</b><small>Now about {money(a)} a month</small></span>
                    <input type="range" min={0} max={Math.ceil(a)} step={10} value={Math.min(t, a)} aria-label={`${c.label} new monthly amount`}
                      onChange={(e) => setTargets({ ...targets, [c.id]: Number(e.target.value) })} />
                    <NumberField label={`${c.label} target`} value={Math.round(t)} width="5em" onSave={(n) => setTargets({ ...targets, [c.id]: Math.min(n, a) })} />
                  </li>
                );
              })}
            </ul>
          </section>
          {subs.length > 0 && (
            <section className="panel">
              <h2>Cancel subscriptions</h2>
              <ul className="whatif-subs">
                {subs.map((x) => (
                  <li key={x.merchant}><label className="check"><input type="checkbox" checked={!!cancel[x.merchant]} onChange={(e) => setCancel({ ...cancel, [x.merchant]: e.target.checked })} />
                    <span>{x.merchant} <small>{money(x.monthly)} a month, {CATEGORY[x.category]?.label.toLowerCase()}</small></span></label></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="whatif-sticky" aria-hidden="true">
          <span><b>{money(extra)}</b> a month freed</span>
          {hasHome && base && better && <span>{extra > 0 ? <>loan <b>{yearsMonths(base.now.paidMonth - better.now.paidMonth)}</b> sooner</> : <>keep <b>{pct(keptNew / income)}</b> after settlement</>}</span>}
        </div>
        <aside className="panel whatif-result" aria-live="polite">
          <p className="kicker">This frees up</p>
          <p className="big-num">{money(extra)}<small> a month</small></p>
          <p className="muted">{money(extra * 12)} a year.</p>
          {hasHome && (
            <>
              <hr />
              <p>From {monthName(after!.month)} you'd keep <b>{money(keptNew)}</b> a month ({pct(keptNew / income)}), {keptNew >= income * 0.1 ? 'above' : 'below'} Babylon's tenth of {money(income * 0.1)}.{extra > 0 && <> Without the changes: {money(keptNow)} ({pct(keptNow / income)}).</>}</p>
              {base && better && (
                <p>With everything left over going into the offset, {home!.name} is paid off in <b>{gone(better)}</b>
                  {extra > 0 && <> instead of {gone(base)}: <b>{yearsMonths(base.now.paidMonth - better.now.paidMonth)} sooner</b> and about <b>{money(base.now.totalInterest - better.now.totalInterest)}</b> less interest</>}.
                  <Info>The same loan calculator as the Property page, with your real pay and spending. Rates will change, so treat it as a guide.</Info></p>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
