import { useMemo, useState } from 'react';
import { Info, NumberField, PageHeader } from '../components/bits';
import { average, completeMonths, findRecurring, summarise, withSplits } from '../data/analysis';
import { CATEGORY, SPEND_CATEGORIES } from '../data/categories';
import { useStore } from '../data/store';
import { expectedIncome } from '../data/wealth';
import { yearsMonths } from '../data/whatif';
import { homeProperty } from '../data/property';
import { simulate } from '../loan';
import { useForecast, useLoan } from '../data/useProperties';
import { money, monthName, pct } from '../lib/format';

/** Try spending less and see what it frees up and what it does to the loan. `embedded`: a tab of the home's Property page. */
export function WhatIf({ embedded = false }: { embedded?: boolean } = {}) {
  const { data } = useStore();
  const s = data.settings;
  const complete = useMemo(() => completeMonths(data), [data]);
  const recent = complete.slice(-3);
  const sums = useMemo(() => recent.map((m) => summarise(m, data)), [recent.join(), data]);
  const avg = (c: string) => average(sums.map((x) => x.byCategoryUsual[c] ?? 0));
  const wants = SPEND_CATEGORIES.filter((c) => c.type === 'want' && !['other', 'card-unitemised'].includes(c.id) && avg(c.id) >= 40).sort((a, b) => avg(b.id) - avg(a.id));
  const subs = recent.length ? findRecurring(withSplits(data.transactions, s.splits), recent.at(-1)).filter((x) => x.every === 'month') : [];
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [cancel, setCancel] = useState<Record<string, boolean>>({});
  const { st } = useForecast();
  const home = homeProperty(s, data.budgets);
  const base = useLoan(home);

  const cutSaving = wants.reduce((a, c) => a + Math.max(0, avg(c.id) - (targets[c.id] ?? avg(c.id))), 0);
  const subSaving = subs.filter((x) => cancel[x.merchant]).reduce((a, x) => a + x.monthly, 0);
  const extra = cutSaving + subSaving;

  // Life after settlement and the loan come from the same forecast and loan calculator as Property and the money meeting.
  const after = st.after;
  const income = after?.pay ?? (recent.length ? expectedIncome(s, recent.at(-1)!) : 0);
  const keptNow = after?.kept ?? 0, keptNew = keptNow + extra;
  // The money freed goes into the offset for the whole loan: living costs fall by it and every amount the plan puts into the
  // offset (at the start and at each later change) rises by it, unless the plan already sweeps all spare money in.
  const better = useMemo(() => {
    if (!home || !base) return null;
    if (extra <= 0) return base;
    const i = base.inputs;
    const setup = { ...i.setup, living: i.setup.living - extra, extra: i.setup.sweep ? i.setup.extra : i.setup.extra + extra };
    const changes = i.changes.map((c) => (c.type === 'living' ? { ...c, value: c.value - extra } : c.type === 'extra' ? { ...c, value: c.value + extra } : c));
    const now = simulate(setup, changes, i.lumps, i.anchor ? { anchor: i.anchor } : {});
    return { ...base, now };
  }, [home, base, extra]);
  if (!recent.length) return <div>{!embedded && <PageHeader title="What if" />}<p className="muted">Needs at least one complete month of statements.</p></div>;
  const hasHome = !!(home && base && after);
  const gone = (v: NonNullable<typeof base>) => yearsMonths(v.now.paidMonth);

  return (
    <div className="whatif">
      {(() => {
        const help = <Info>Starts from your average over {recent.length} complete month{recent.length > 1 ? 's' : ''}. Change a number or tick a subscription to see what it frees up. Nothing here changes your budget.</Info>;
        return embedded
          ? <p className="muted whatif-intro">Spend less on something and see what it frees up, what you'd keep, and what it does to the loan. {help}</p>
          : <PageHeader title="What if">{help}</PageHeader>;
      })()}
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
        <aside className="panel whatif-result" aria-live="polite" aria-label="What this frees up">
          <p className="kicker">This frees up</p>
          <p className="big-num">{money(extra)}<small> a month</small></p>
          <p className="muted">{money(extra * 12)} a year.</p>
          {hasHome && (
            <>
              <hr />
              <p>From {monthName(after!.month)} you'd keep <b>{money(keptNew)}</b> a month ({pct(keptNew / income)}), {keptNew >= income * 0.1 ? 'above' : 'below'} Babylon's tenth of {money(income * 0.1)}.{extra > 0 && <> Without the changes: {money(keptNow)} ({pct(keptNow / income)}).</>}</p>
              {base && better && (
                <p>{base.inputs.setup.sweep ? <>With all spare money going into the offset</> : <>With {money(base.inputs.setup.extra)} a month extra into the offset{extra > 0 ? `, plus the ${money(extra)} freed` : ''}</>}, {home!.name} is paid off in <b>{gone(better)}</b>
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
