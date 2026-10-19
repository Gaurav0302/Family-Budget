import { useMemo, useState } from 'react';
import { Badge, Empty, Info, MonthPicker, PageHeader } from '../components/bits';
import { MonthBanner } from '../components/MonthBanner';
import { tone, type Part } from '../data/guide';
import { DrillLink, drillCategory, drillType, type DrillSpec } from '../components/Drill';
import { allMonths, completeMonths } from '../data/analysis';
import { merchantOf } from '../data/merchant';
import { reviewText, type Finding, type Severity } from '../data/review';
import { reviewFor } from '../data/reviewCache';
import { useStore } from '../data/store';
import { Markdown } from '../lib/markdown';
import { EVERY_UNIT } from '../data/frequency';
import { dayName, money, monthName, monthOnly, pct } from '../lib/format';

const SECTIONS: { sev: Severity; title: string }[] = [
  { sev: 'act', title: 'Needs attention' },
  { sev: 'watch', title: 'Keep an eye on' },
  { sev: 'info', title: 'Good to know' },
  { sev: 'good', title: 'Going well' },
];

function FindingList({ items }: { items: Finding[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <>
      <ul className="findings">
        {shown.map((f) => (
          <li key={f.id}><Badge severity={f.severity} short /><div><strong>{f.title}</strong><p>{f.detail}</p><small className="src">{f.source}</small></div></li>
        ))}
      </ul>
      {items.length > 4 && <button className="btn small ghost" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show ${items.length - 4} more`}</button>}
    </>
  );
}

function Split({ label, actual, guide, spec }: { label: string; actual: number; guide: number; spec?: DrillSpec }) {
  const w = (v: number) => `${Math.min(Math.max(v, 0), 1) * 100}%`;
  // Same meaning as the bar on Home: green within the guide, amber a little past it, red well past it.
  const part = label.toLowerCase() as Part;
  const state = tone(part, actual);
  const word = part === 'kept' ? (actual >= 0.2 ? 'on track' : actual >= 0.1 ? 'under guide' : "under Babylon's 10%") : actual > guide ? 'over guide' : 'within guide';
  return (
    <div className="split-row">
      <span className="split-label">{spec ? <DrillLink spec={spec}>{label}</DrillLink> : label}</span>
      <div className="split-track" role="img" aria-label={`${label}: ${pct(actual)} of income, guide ${pct(guide)}, ${word}`}>
        <div className={`split-fill st-${state}`} style={{ width: w(actual) }} />
        <div className="split-guide" style={{ left: w(guide) }} />
      </div>
      <span className="split-num">{pct(actual)} <small>{word}, guide {pct(guide)}</small></span>
    </div>
  );
}

export function Review() {
  const { data, updateTransaction, addReview, deleteReview, email } = useStore();
  const months = useMemo(() => allMonths(data.transactions), [data.transactions]);
  const complete = useMemo(() => completeMonths(data), [data]);
  const completeSet = useMemo(() => new Set(complete), [complete]);
  const [month, setMonth] = useState(() => complete.at(-1) ?? months.at(-1) ?? '');
  const [noteText, setNoteText] = useState('');
  const [copied, setCopied] = useState(false);
  if (!months.length) return <Empty title="Nothing to review yet"><p>Add statements first.</p></Empty>;

  const r = reviewFor(data, month);
  const notes = data.reviews.filter((x) => x.month === month);
  const byGroup = (sev: Severity): Finding[] => r.findings.filter((f) => f.severity === sev);

  return (
    <div className="review">
      <PageHeader title={`${monthName(month)} review`}>
        <MonthPicker months={months} value={month} onChange={setMonth} completeSet={completeSet} />
      </PageHeader>
      <MonthBanner month={month} />

      <section className={`verdict-card tone-${r.verdict.tone}`}>
        <h2>{r.verdict.tone === 'better' ? 'Heading the right way' : r.verdict.tone === 'worse' ? 'Drifting the wrong way' : r.verdict.tone === 'steady' ? 'Holding steady' : 'A first look'}</h2>
        <p>{r.verdict.text}</p>
        <div className="stat-row">
          <div><span>Came in</span><b>{money(r.summary.income)}</b></div>
          <div><span>Spent</span><b>{money(r.summary.spend)}</b></div>
          <div><span>Kept</span><b>{money(r.summary.kept)}</b></div>
          <div><span>Kept share</span><b>{pct(r.summary.keptRate)}</b></div>
        </div>
      </section>

      <div className="review-grid">
        <div className="review-main">
          {SECTIONS.map(({ sev, title }) => byGroup(sev).length > 0 && (
            <section key={sev} className="panel" aria-labelledby={`s-${sev}`}>
              <h2 id={`s-${sev}`}>{title}</h2>
              <FindingList items={byGroup(sev)} />
            </section>
          ))}

          <section className="panel" aria-labelledby="score">
            <div className="panel-head"><h2 id="score">Category by category</h2><Info>Tap a category to see its payments and move any that belong somewhere else.</Info></div>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Category by category (table)">
              <table className="score">
                <thead><tr><th>Category</th><th>Budget</th><th>Spent</th><th>Recent average</th><th>Difference</th></tr></thead>
                <tbody>
                  {r.scorecard.map((row) => (
                    <tr key={row.category} className={`st-${row.status}`}>
                      <th scope="row"><DrillLink spec={drillCategory(month, row.category)}>{row.label}</DrillLink></th>
                      <td>{row.budget ? (row.every === 'month' ? money(row.budget) : <>{money(row.per)}<small className="muted">/{EVERY_UNIT[row.every]}</small></>) : <span className="muted">none</span>}</td>
                      <td>{money(row.usual)}{row.actual !== row.usual && <small className="muted"> +{money(row.actual - row.usual)} one-off</small>}</td>
                      <td>{row.average ? money(row.average) : <span className="muted">–</span>}</td>
                      <td className="diff">{row.status === 'over' ? <Badge severity="act" short /> : row.status === 'near' ? null : row.status === 'under' ? <Badge severity="good" short /> : null}
                        {row.budget ? money(row.diff, { sign: true }) : ''}{row.period && <small className="muted"> over the {EVERY_UNIT[row.every]}</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" aria-labelledby="subs">
            <h2 id="subs">Subscriptions and memberships</h2>

            <ul className="subs">
              {r.subscriptions.map((x) => (
                <li key={x.merchant}>
                  <span><b>{x.merchant}</b>{x.overlap && <small className="warn"> You have {x.overlap}</small>}</span>
                  <span>{money(x.monthly)}/month<small>{money(x.yearly)} a year{x.every === 'year' ? ', paid yearly' : ''}</small></span>
                </li>
              ))}
            </ul>
            <p className="total-line">Together about <b>{money(r.subscriptions.reduce((a, x) => a + x.monthly, 0))}</b> a month, or <b>{money(r.subscriptions.reduce((a, x) => a + x.yearly, 0))}</b> a year.</p>
          </section>

          {r.unusual.length > 0 && (
            <section className="panel" aria-labelledby="unusual">
              <h2 id="unusual">Out of the ordinary</h2>
              <ul className="unusual">
                {r.unusual.map(({ tx, reason }) => (
                  <li key={tx.id}>
                    <div><b>{merchantOf(tx.description)}</b><small>{dayName(tx.date)}. {reason}</small></div>
                    <span className="num">{money(tx.amount, { cents: true })}</span>
                    <button className="btn small" onClick={() => updateTransaction(tx.splitOf ?? tx.id, { oneOff: true })}>Mark as one-off</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="review-side" aria-label="Checks against the money rules">
          <section className="panel" aria-labelledby="split">
            <h2 id="split">Needs, wants and kept</h2>
            <Info>The 50/30/20 guide: about half of take-home pay on needs, no more than 30% on wants, and at least 20% kept. Tap needs or wants to see what's in them.</Info>
            <Split label="Needs" actual={r.split.needs} guide={0.5} spec={drillType(month, 'need')} />
            <Split label="Wants" actual={r.split.wants} guide={0.3} spec={drillType(month, 'want')} />
            <Split label="Kept" actual={r.split.kept} guide={0.2} />
          </section>

          <section className="panel" aria-labelledby="babylon">
            <h2 id="babylon">Babylon's seven cures</h2>

            <ol className="rules">
              {r.babylon.map((c) => (
                <li key={c.title} className={`rule sev-line-${c.status}`}>
                  <div className="rule-head"><b>{c.title}</b><Badge severity={c.status} short /></div>
                  <small className="rule-quote">{c.rule}</small>
                  <p>{c.detail}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel" aria-labelledby="ramsey">
            <h2 id="ramsey">Ramsey's baby steps</h2>
            <ol className="steps">
              {r.ramsey.steps.map((st) => (
                <li key={st.n} className={`step ${st.status === 'good' ? 'done' : ''} ${st.current ? 'current' : ''}`}>
                  <span className="step-n">{st.n}</span>
                  <div><b>{st.title}</b>{st.current && <em> You are here</em>}<p>{st.detail}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel" aria-labelledby="notes">
            <h2 id="notes">Monthly notes</h2>
            {notes.length ? notes.map((n) => (
              <article key={n.id} className="note">
                <Markdown text={n.body} />
                <footer>{n.author}, {new Date(n.created).toLocaleDateString('en-AU')} <button className="link" onClick={() => deleteReview(n.id)}>Delete</button></footer>
              </article>
            )) : <p className="muted">No notes for {monthOnly(month)} yet. When a Claude session reviews your statements, its note appears here.</p>}
            <details>
              <summary>Add a note</summary>
              <textarea rows={5} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Paste a review or write your own note" />
              <button className="btn small" disabled={!noteText.trim()} onClick={async () => {
                await addReview({ id: `${month}:${Date.now()}`, month, title: `${monthName(month)} note`, body: noteText.trim(), author: email ?? 'You', created: new Date().toISOString() });
                setNoteText('');
              }}>Save note</button>
            </details>
            <button className="btn small ghost" onClick={async () => {
              try { await navigator.clipboard.writeText(reviewText(r)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
            }}>{copied ? 'Copied' : 'Copy this review as text'}</button>
          </section>
        </aside>
      </div>
    </div>
  );
}
