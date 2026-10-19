import { FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/bits';
import { applyRules } from '../data/rules';
import { parseCsv, parseDataFile, splitNew, type ParsedImport } from '../data/importers';
import { accountFor, detectFormat, parseStatementText } from '../data/pdfStatements';
import { useStore } from '../data/store';
import { isPayPalCsv, matchPayPal, parsePayPalCsv } from '../data/paypal';
import { download, longDate, money } from '../lib/format';
import { today as todayLocal } from '../lib/format';

/** Adding statements. `embedded`: shown as a tab of the Statements page. */
export function Import({ embedded = false }: { embedded?: boolean } = {}) {
  const { data, importParsed, backup, namePayPal } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');
  const [account, setAccount] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const isPayPal = !!file && /\.csv$/i.test(file.name) && isPayPalCsv(text);
  const isPdf = !!file && /\.pdf$/i.test(file.name);
  const isCsv = !!file && /\.csv$/i.test(file.name) && !isPayPal;
  const [reading, setReading] = useState(false);
  const pp = isPayPal ? (() => { const r = parsePayPalCsv(text); return { ...r, ...matchPayPal(r.purchases, data.transactions) }; })() : null;

  // The file being read: a slow PDF finishing after another file was chosen mustn't replace it on screen.
  const picked = useRef<File | null>(null);
  async function choose(f: File) {
    picked.current = f;
    setResult(null); setParsed(null); setFile(f); setAccount(''); setReading(false);
    if (/\.pdf$/i.test(f.name)) {
      // A PDF statement: read here on this device, then matched to an account by its last four digits.
      setReading(true); setText('');
      try {
        const { pdfText } = await import('../data/readPdf');
        const t = await pdfText(f);
        if (picked.current !== f) return;
        setText(t);
        const acc = accountFor(t, data.settings.accounts);
        if (acc) { setAccount(acc); setParsed(parseStatementText(t, acc, f.name)); }
        else if (!detectFormat(t)) setParsed(parseStatementText(t, '', f.name));
      } catch (e: any) {
        if (picked.current !== f) return;
        setParsed({ transactions: [], coverage: [], problems: [`Couldn't read this PDF (${e?.message ?? e}). If it has a password, save a copy without one.`] });
      }
      setReading(false);
      return;
    }
    const t = await f.text();
    if (picked.current !== f) return;
    setText(t);
    if (!/\.csv$/i.test(f.name)) setParsed(parseDataFile(t));
  }
  function readCsv(acc: string) {
    setAccount(acc);
    if (acc && file) setParsed(isPdf ? parseStatementText(text, acc, file.name) : parseCsv(text, acc, file.name));
  }

  const preview = parsed && parsed.transactions.length ? (() => {
    const rules = [...data.rules, ...(parsed.file?.rules ?? []).map((r) => ({ ...r, user: true }))];
    const settings = { ...data.settings, ...(parsed.file?.settings ?? {}) };
    const sorted = applyRules(parsed.transactions.map((t) => (t.manual ? t : { ...t, category: null, kind: null })), rules, settings);
    const { fresh, duplicates } = splitNew(data.transactions, sorted);
    const dates = parsed.transactions.map((t) => t.date).sort();
    return { fresh: fresh.length, duplicates, unsure: fresh.filter((t) => t.needsReview).length, from: dates[0], to: dates.at(-1)! };
  })() : null;

  // Every file added so far, newest first: which accounts and dates it covered.
  const history = useMemo(() => {
    const by = new Map<string, { source: string; count: number; from: string; to: string; accounts: Set<string> }>();
    for (const t of data.transactions) {
      const k = t.source || 'Added by hand';
      const h = by.get(k) ?? { source: k, count: 0, from: t.date, to: t.date, accounts: new Set<string>() };
      h.count++; if (t.date < h.from) h.from = t.date; if (t.date > h.to) h.to = t.date;
      h.accounts.add(data.settings.accounts.find((a) => a.key === t.account)?.name.replace(/ \(.*\)$/, '') ?? t.account);
      by.set(k, h);
    }
    return [...by.values()].map((h) => ({ ...h, accounts: [...h.accounts] })).sort((a, b) => b.to.localeCompare(a.to));
  }, [data.transactions, data.settings.accounts]);
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="import">
      {!embedded && <PageHeader title="Add statements" />}

      <label className={`drop ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) choose(f); }}>
        <FileUp size={28} aria-hidden />
        <b>{file ? file.name : 'Choose a file, or drop it here'}</b>
        <span>PDF statement (CommBank, Macquarie), CSV from your bank or PayPal, or a Family Budget data file (.json)</span>
        <input type="file" accept=".pdf,.csv,.json,application/pdf,application/json,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ''; }} />
      </label>

      {pp && !result && (
        <div className="step-box preview">
          <p><b>PayPal activity file.</b> {pp.purchases.length} PayPal purchase{pp.purchases.length === 1 ? '' : 's'} found. PayPal itself isn't added as spending: it's only used to name the shop behind each PayPal payment from your bank.</p>
          {pp.problems.map((x) => <p key={x} className="form-error">{x}</p>)}
          {pp.matches.length > 0 && (
            <details className="add" open={pp.matches.length <= 12}>
              <summary>{pp.matches.length} bank payment{pp.matches.length === 1 ? '' : 's'} will be named</summary>
              <ul className="value-list">{pp.matches.map((m) => <li key={m.tx.id}><span>{longDate(m.tx.date)}<small>{m.description.replace(/^PayPal: /, '')}{m.purchase.item ? `, ${m.purchase.item}` : ''}</small></span><span>{money(-m.tx.amount, { cents: true })}</span></li>)}</ul>
            </details>
          )}
          {pp.unmatched.length > 0 && <p className="muted">{pp.unmatched.length} PayPal purchase{pp.unmatched.length === 1 ? ' has' : 's have'} no matching bank payment in the app (paid from a PayPal balance, or the bank statement isn't added yet).</p>}
          {pp.stillUnnamed.length > 0 && <p className="muted">{pp.stillUnnamed.length} PayPal bank payment{pp.stillUnnamed.length === 1 ? '' : 's'} in the app still have no match in this file.</p>}
          <button className="btn primary" disabled={busy || !pp.matches.length} onClick={async () => {
            setBusy(true);
            try {
              const n = await namePayPal(pp.matches.map((m) => ({ id: m.tx.id, description: m.description, note: m.purchase.item })));
              setResult(`Named ${n} PayPal payment${n === 1 ? '' : 's'}. Each is now sorted by its shop; check them under “Needs your input” if any weren't recognised.`);
              setFile(null);
            } catch (e: any) { setResult(`Not everything was saved (${e?.message ?? e}). Doing it again is safe: what's already in is skipped.`); }
            setBusy(false);
          }}>{busy ? 'Naming…' : `Name ${pp.matches.length} PayPal payment${pp.matches.length === 1 ? '' : 's'}`}</button>
        </div>
      )}

      {reading && <div className="step-box" role="status"><p>Reading the PDF on this device…</p></div>}
      {(isCsv || (isPdf && !reading && text && detectFormat(text))) && (
        <div className="step-box">
          <label htmlFor="acct"><b>Which account is this statement for?</b></label>
          <select id="acct" value={account} onChange={(e) => readCsv(e.target.value)}>
            <option value="">Choose the account…</option>
            {data.settings.accounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
        </div>
      )}

      {parsed?.problems.length ? <div className="form-error" role="alert">{parsed.problems.slice(0, 4).map((p, i) => <p key={i}>{p}</p>)}</div> : null}

      {preview && !result && (
        <div className="step-box preview">
          <p>{preview.fresh ? <><b>{preview.fresh}</b> new transactions</> : 'Nothing new: every payment is already in the app. Dates covered'} from {longDate(preview.from)} to {longDate(preview.to)}{isPdf && account ? <> in <b>{data.settings.accounts.find((a) => a.key === account)?.name}</b></> : null}.</p>
          {parsed?.statements?.[0] && <p className="muted">Statement {longDate(parsed.statements[0].from)} to {longDate(parsed.statements[0].to)}: opening {money(parsed.statements[0].opening, { cents: true })}, closing {money(parsed.statements[0].closing, { cents: true })}. These go to the statement checks.</p>}
          {preview.duplicates > 0 && <p>{preview.duplicates} are already in the app and will be skipped.</p>}
          {preview.unsure > 0 && <p>{preview.unsure} couldn't be sorted automatically. They'll wait for you under “Needs your input”.</p>}
          {parsed?.file?.reviews?.length ? <p>Includes {parsed.file.reviews.length} monthly review note{parsed.file.reviews.length > 1 ? 's' : ''}.</p> : null}
          <button className="btn primary" disabled={busy || (!preview.fresh && !parsed?.file?.reviews?.length && !parsed?.coverage.length)} onClick={async () => {
            setBusy(true);
            try {
              const r = await importParsed(parsed!);
              setResult(`Added ${r.added} transaction${r.added === 1 ? '' : 's'}${r.duplicates ? `, skipped ${r.duplicates} already here` : ''}.`);
              setFile(null); setParsed(null);
            } catch (e: any) { setResult(`Not everything was saved (${e?.message ?? e}). Adding the same file again is safe: what's already in is skipped.`); }
            setBusy(false);
          }}>{busy ? 'Adding…' : preview.fresh ? `Add ${preview.fresh} transactions` : 'Save the dates and balances'}</button>
        </div>
      )}
      {parsed?.file && !parsed.transactions.length && !result && (
        <div className="step-box preview">
          <p>This file updates {[parsed.file.settings && 'income, super, net worth and bills', parsed.file.budgets?.length && 'the budget', parsed.file.rules?.length && 'sorting rules', parsed.file.reviews?.length && 'monthly notes'].filter(Boolean).join(', ')}. Nothing you've already changed in the app is overwritten.</p>
          <button className="btn primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await importParsed(parsed!); setResult('Updated.'); setFile(null); setParsed(null); }
            catch (e: any) { setResult(`Not everything was saved (${e?.message ?? e}). Doing it again is safe: what's already in is skipped.`); }
            setBusy(false);
          }}>{busy ? 'Updating…' : 'Apply update'}</button>
        </div>
      )}
      {result && <div className="step-box ok" role="status"><p>{result}</p><p><Link to="/transactions?review=1">Sort anything that needs your input</Link> or <Link to="/check-in?step=m-talk">read the review</Link>.</p></div>}

      <div className="import-help">
        <section className="panel">
          <h2>PDF statements</h2>
          <p>Add CommBank and Macquarie PDF statements straight here: the app reads them on this device, finds the account from its last four digits and skips anything already added. Statements with a running balance also fill in the statement checks.</p>
          <p className="fine">Other banks: use their CSV export, or ask Claude to prepare a data file.</p>
        </section>
        <section className="panel">
          <h2>Getting a CSV from CommBank</h2>
          <ol className="howto">
            <li>Sign in to NetBank on a computer (the CommBank app doesn't export CSV).</li>
            <li>Open the account, then choose <b>Export</b> above the transaction list.</li>
            <li>Pick the dates (for example 1 to 31 October) and the format <b>CSV</b>.</li>
            <li>Save the file, then add it here and choose the matching account.</li>
          </ol>
          <p className="fine">Macquarie: Transactions → Export → CSV. Credit card: same as CommBank above.</p>
        </section>
        <section className="panel">
          <h2>Naming PayPal payments</h2>
          <ol className="howto">
            <li>Add your bank statements first: the app needs the PayPal payments from the bank to name them.</li>
            <li>On paypal.com, open <b>Activity</b>, then <b>Statements</b> → <b>Activity download</b>.</li>
            <li>Choose <b>CSV</b>, the same dates as your bank statements, then <b>Create report</b> and download it when it's ready.</li>
            <li>Add it here. The app pairs each purchase with the bank payment of the same amount within a few days.</li>
          </ol>
        </section>
        <section className="panel">
          <h2>The monthly routine with Claude</h2>
          <ol className="howto">
            <li>At the start of each month, download last month's PDF statements for every account.</li>
            <li>Open a Claude session in your Personal Finance project, attach them and say: “Add these to Family Budget and review the month.”</li>
            <li>Claude prepares a data file and a written review. Add the file here (or Claude adds it directly if the Supabase connector is on).</li>
            <li>Sort anything under “Needs your input”, then read the review.</li>
          </ol>
        </section>
        {history.length > 0 && (
          <section className="panel">
            <h2>Added so far</h2>
            <ul className="value-list import-history">
              {history.slice(0, showAll ? undefined : 8).map((h) => (
                <li key={h.source}><span><b>{h.source}</b><small>{h.accounts.join(', ')}: {longDate(h.from)} to {longDate(h.to)}</small></span><span>{h.count}<small>payments</small></span></li>
              ))}
            </ul>
            {history.length > 8 && <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${history.length}`}</button>}
          </section>
        )}
        <section className="panel">
          <h2>Backup</h2>
          <p>The free database has no automatic backups. Download one each month and keep it somewhere safe. Adding the file here restores everything.</p>
          <button className="btn" onClick={() => download(`family-budget-backup-${todayLocal()}.json`, JSON.stringify(backup()))}>Download a backup</button>
        </section>
      </div>
    </div>
  );
}
