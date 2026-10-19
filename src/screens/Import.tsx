import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, PageHeader } from '../components/bits';
import { applyRules } from '../data/rules';
import { parseCsv, parseDataFile, splitNew, type ParsedImport } from '../data/importers';
import { useStore } from '../data/store';
import { isPayPalCsv, matchPayPal, parsePayPalCsv } from '../data/paypal';
import { download, longDate, money } from '../lib/format';

export function Import() {
  const { data, importParsed, backup, namePayPal } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');
  const [account, setAccount] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const isPayPal = !!file && /\.csv$/i.test(file.name) && isPayPalCsv(text);
  const isCsv = !!file && /\.csv$/i.test(file.name) && !isPayPal;
  const pp = isPayPal ? (() => { const r = parsePayPalCsv(text); return { ...r, ...matchPayPal(r.purchases, data.transactions) }; })() : null;

  async function choose(f: File) {
    setResult(null); setParsed(null); setFile(f);
    const t = await f.text();
    setText(t);
    if (!/\.csv$/i.test(f.name)) setParsed(parseDataFile(t));
  }
  function readCsv(acc: string) {
    setAccount(acc);
    if (acc && file) setParsed(parseCsv(text, acc, file.name));
  }

  const preview = parsed && parsed.transactions.length ? (() => {
    const rules = [...data.rules, ...(parsed.file?.rules ?? []).map((r) => ({ ...r, user: true }))];
    const settings = { ...data.settings, ...(parsed.file?.settings ?? {}) };
    const sorted = applyRules(parsed.transactions.map((t) => (t.manual ? t : { ...t, category: null, kind: null })), rules, settings);
    const { fresh, duplicates } = splitNew(data.transactions, sorted);
    const dates = parsed.transactions.map((t) => t.date).sort();
    return { fresh: fresh.length, duplicates, unsure: fresh.filter((t) => t.needsReview).length, from: dates[0], to: dates.at(-1)! };
  })() : null;

  return (
    <div className="import">
      <PageHeader title="Add statements"><Info>A bank CSV, or a data file Claude prepared from your PDF statements. Anything already in the app is skipped, so adding a file twice is safe.</Info></PageHeader>

      <label className={`drop ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) choose(f); }}>
        <FileUp size={28} aria-hidden />
        <b>{file ? file.name : 'Choose a file, or drop it here'}</b>
        <span>CSV from your bank or PayPal, or a Family Budget data file (.json)</span>
        <input type="file" accept=".csv,.json,application/json,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ''; }} />
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
            } catch (e: any) { setResult(`Nothing was changed: ${e?.message ?? e}`); }
            setBusy(false);
          }}>{busy ? 'Naming…' : `Name ${pp.matches.length} PayPal payment${pp.matches.length === 1 ? '' : 's'}`}</button>
        </div>
      )}

      {isCsv && (
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
          <p><b>{preview.fresh}</b> new transactions from {longDate(preview.from)} to {longDate(preview.to)}.</p>
          {preview.duplicates > 0 && <p>{preview.duplicates} are already in the app and will be skipped.</p>}
          {preview.unsure > 0 && <p>{preview.unsure} couldn't be sorted automatically. They'll wait for you under “Needs your input”.</p>}
          {parsed?.file?.reviews?.length ? <p>Includes {parsed.file.reviews.length} monthly review note{parsed.file.reviews.length > 1 ? 's' : ''}.</p> : null}
          <button className="btn primary" disabled={busy || (!preview.fresh && !parsed?.file?.reviews?.length && !parsed?.coverage.length)} onClick={async () => {
            setBusy(true);
            try {
              const r = await importParsed(parsed!);
              setResult(`Added ${r.added} transaction${r.added === 1 ? '' : 's'}${r.duplicates ? `, skipped ${r.duplicates} already here` : ''}.`);
              setFile(null); setParsed(null);
            } catch (e: any) { setResult(`Nothing was added: ${e?.message ?? e}`); }
            setBusy(false);
          }}>{busy ? 'Adding…' : `Add ${preview.fresh} transactions`}</button>
        </div>
      )}
      {parsed?.file && !parsed.transactions.length && !result && (
        <div className="step-box preview">
          <p>This file updates {[parsed.file.settings && 'income, super, net worth and bills', parsed.file.budgets?.length && 'the budget', parsed.file.rules?.length && 'sorting rules', parsed.file.reviews?.length && 'monthly notes'].filter(Boolean).join(', ')}. Nothing you've already changed in the app is overwritten.</p>
          <button className="btn primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await importParsed(parsed!); setResult('Updated.'); setFile(null); setParsed(null); }
            catch (e: any) { setResult(`Nothing was changed: ${e?.message ?? e}`); }
            setBusy(false);
          }}>{busy ? 'Updating…' : 'Apply update'}</button>
        </div>
      )}
      {result && <div className="step-box ok" role="status"><p>{result}</p><p><Link to="/transactions?review=1">Sort anything that needs your input</Link> or <Link to="/review">read the review</Link>.</p></div>}

      <div className="import-help">
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
        <section className="panel">
          <h2>Backup</h2>
          <p>The free database has no automatic backups. Download one each month and keep it somewhere safe. Adding the file here restores everything.</p>
          <button className="btn" onClick={() => download(`family-budget-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup()))}>Download a backup</button>
        </section>
      </div>
    </div>
  );
}
