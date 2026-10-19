import { tidyDescription } from './merchant';
import type { Coverage, DataFile, StatementBalance, Transaction } from './types';

/** Same id whether a transaction came from a PDF, a CSV or a backup: account, date, amount, nth on that day. */
export function assignIds<T extends Omit<Transaction, 'id'>>(rows: T[]): (T & { id: string })[] {
  const n = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.account}:${r.date}:${r.amount.toFixed(2)}`;
    const k = (n.get(base) ?? 0) + 1;
    n.set(base, k);
    return { ...r, id: `${base}:${k}` };
  });
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export const toNumber = (s: string) => {
  const v = parseFloat(s.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(v) ? v : NaN;
};

export function toIsoDate(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);        // 15/09/2026 (Australian order)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2}) (\w{3})\w* (\d{4})$/);                  // 15 Sep 2026
  if (m) {
    const mi = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase().slice(0, 3)) / 3 + 1;
    if (mi > 0) return `${m[3]}-${String(mi).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export interface ParsedImport {
  transactions: Transaction[];
  coverage: Coverage[];
  file?: DataFile;
  problems: string[];
  /** Opening and closing balance, when the file has a running balance column. */
  statements?: StatementBalance[];
}

/** Read a bank CSV. Works with CommBank's export (no header: date, amount, description, balance)
 *  and with any CSV that has Date + Amount (or Debit/Credit) + Description columns. */
export function parseCsv(text: string, account: string, source: string): ParsedImport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const problems: string[] = [];
  if (!lines.length) return { transactions: [], coverage: [], problems: ['The file is empty.'] };
  const first = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = first.some((h) => /date/.test(h)) && !toIsoDate(first[0]);
  let idx = { date: 0, amount: 1, desc: 2, debit: -1, credit: -1, balance: 3 };
  if (hasHeader) {
    const find = (re: RegExp) => first.findIndex((h) => re.test(h));
    idx = {
      date: find(/date/),
      amount: find(/^amount|amount$|^value$/),
      desc: find(/desc|details|narrative|memo|name|payee/),
      debit: find(/debit|withdraw|money out/),
      credit: find(/credit|deposit|money in/),
      balance: find(/balance/),
    };
    if (idx.date < 0 || idx.desc < 0 || (idx.amount < 0 && idx.debit < 0)) {
      return { transactions: [], coverage: [], problems: ["Couldn't find the date, amount and description columns in this file."] };
    }
  }
  const rows: Omit<Transaction, 'id'>[] = [];
  const bals: { amount: number; balance: number; date: string }[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(line);
    const date = toIsoDate(cells[idx.date] ?? '');
    let amount = idx.amount >= 0 ? toNumber(cells[idx.amount] ?? '') : NaN;
    if (Number.isNaN(amount) && idx.debit >= 0) {
      const d = toNumber(cells[idx.debit] ?? '');
      const c = idx.credit >= 0 ? toNumber(cells[idx.credit] ?? '') : NaN;
      amount = (Number.isNaN(c) ? 0 : Math.abs(c)) - (Number.isNaN(d) ? 0 : Math.abs(d));
    }
    if (!date || Number.isNaN(amount) || amount === 0) { if (line.trim()) problems.push(`Skipped: ${line.slice(0, 60)}`); continue; }
    rows.push({ date, account, amount: Math.round(amount * 100) / 100, description: tidyDescription(cells[idx.desc] ?? ''), category: null, kind: null, source });
    const bal = idx.balance >= 0 ? toNumber(cells[idx.balance] ?? '') : NaN;
    if (!Number.isNaN(bal)) bals.push({ amount: Math.round(amount * 100) / 100, balance: bal, date });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const transactions = assignIds(rows);
  const coverage = transactions.length ? [{ account, from: transactions[0].date, to: transactions[transactions.length - 1].date }] : [];
  const statements = coverage.length && bals.length === rows.length ? statementFrom(bals, account, coverage[0].from, coverage[0].to) : undefined;
  return { transactions, coverage, problems, ...(statements ? { statements: [statements] } : {}) };
}

/** Opening and closing balance from a running-balance column, whichever way round the bank lists the rows. */
export function statementFrom(rows: { amount: number; balance: number }[], account: string, from: string, to: string): StatementBalance | undefined {
  if (!rows.length) return undefined;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const oldestFirst = rows.length < 2 || rows.slice(1).every((r, i) => near(r.balance, rows[i].balance + r.amount));
  const newestFirst = rows.length >= 2 && rows.slice(1).every((r, i) => near(rows[i].balance, r.balance + rows[i].amount));
  if (!oldestFirst && !newestFirst) return undefined;   // the column doesn't run cleanly, so don't guess
  const first = oldestFirst ? rows[0] : rows[rows.length - 1], last = oldestFirst ? rows[rows.length - 1] : rows[0];
  return { account, from, to, opening: Math.round((first.balance - first.amount) * 100) / 100, closing: last.balance };
}

export function parseDataFile(text: string): ParsedImport {
  let file: DataFile;
  try { file = JSON.parse(text); } catch { return { transactions: [], coverage: [], problems: ["This isn't a Family Budget data file."] }; }
  if (file.app !== 'family-budget') return { transactions: [], coverage: [], problems: ["This isn't a Family Budget data file."] };
  const txs = (file.transactions ?? []).map((t) => ({ ...t, description: tidyDescription(t.description) }));
  return { transactions: txs, coverage: file.coverage ?? [], file, problems: [] };
}

/** Which incoming transactions are new, and which are already in the app. */
export function splitNew(existing: Transaction[], incoming: Transaction[]) {
  const have = new Set(existing.map((t) => t.id));
  const fresh = incoming.filter((t) => !have.has(t.id));
  return { fresh, duplicates: incoming.length - fresh.length };
}

/** Join overlapping coverage periods per account. */
export function mergeCoverage(list: Coverage[]): Coverage[] {
  const by = new Map<string, Coverage[]>();
  for (const c of list) by.set(c.account, [...(by.get(c.account) ?? []), c]);
  const out: Coverage[] = [];
  for (const [account, cs] of by) {
    cs.sort((a, b) => a.from.localeCompare(b.from));
    let cur = { ...cs[0] };
    for (const c of cs.slice(1)) {
      const next = new Date(cur.to + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 3);
      if (c.from <= next.toISOString().slice(0, 10)) { if (c.to > cur.to) cur.to = c.to; }
      else { out.push(cur); cur = { ...c }; }
    }
    out.push({ ...cur, account });
  }
  return out;
}
