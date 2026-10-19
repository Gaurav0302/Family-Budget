import { assignIds, type ParsedImport } from './importers';
import { tidyDescription } from './merchant';
import type { Account, StatementBalance, Transaction } from './types';
import { today as localToday } from '../lib/format';

/** Bank statement PDFs read in the browser (nothing leaves the device). The PDF's text is laid out in lines the way
 *  `pdftotext -layout` would, then read with the same patterns as tools/parse_statements.py:
 *    CommBank "Transaction Summary" letters (date, details, amount, balance; the credit card without balance),
 *    CommBank formal statements (date, transaction, debit, credit, balance) and Macquarie transaction listings.
 *  Ids match the ones the Claude routine made, so a statement already added is recognised and skipped. */

/** A piece of text on a page. `rotated`: printed sideways (margin codes), left out of the lines. */
export interface PdfItem { str: string; x: number; y: number; width: number; height: number; rotated?: boolean }
export type PdfFormat = 'cba_summary' | 'cba_statement' | 'macquarie';

/** Lines of text from positioned pieces, page by page. Wide gaps become runs of spaces (two or more), so columns stay apart. */
export function layoutLines(pages: PdfItem[][]): string {
  const out: string[] = [];
  for (const items of pages) {
    const rows: { y: number; items: PdfItem[] }[] = [];
    for (const it of items.filter((i) => i.str.length && !i.rotated)) {
      const tol = Math.max(2, it.height * 0.4);
      const row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
      if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);   // PDF y runs upwards
    for (const r of rows) {
      // Blank pieces only mark gaps: the gap is measured between the real pieces either side.
      const real = r.items.filter((i) => i.str.trim()).sort((a, b) => a.x - b.x);
      if (!real.length) continue;
      const chars = real.reduce((n, i) => n + i.str.length, 0);
      const cw = Math.max(1, real.reduce((w, i) => w + i.width, 0) / Math.max(1, chars));
      let line = ' '.repeat(Math.max(0, Math.round(real[0].x / cw / 2))), end = -1;
      for (const it of real) {
        if (end >= 0) {
          const gap = it.x - end;
          line += ' '.repeat(gap > cw * 1.6 ? Math.max(2, Math.round(gap / cw)) : gap > cw * 0.2 ? 1 : 0);
        }
        line += it.str;
        end = it.x + it.width;
      }
      out.push(line.replace(/\s+$/, ''));
    }
    out.push('');
  }
  return out.join('\n');
}

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const SKIP = ['Card xx', 'Value Date', 'Account Number', 'Page ', 'Date ', 'Created', 'While this', 'we’re not', "we're not", 'Statement ', 'Any pending', '##', 'Transaction Summary'];
const MONEY = String.raw`-?\$?[\d,]+\.\d{2}`;
const num = (s: string) => Number(s.replace(/[$,]/g, ''));
const iso = (d: string | number, m: string, y: string | number) => `${String(y).padStart(4, '0')}-${String(MONTHS[m.slice(0, 3)]).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
const clean = (s: string) => s.replace(/\s{2,}/g, ' ').trim().replace(/^[ |]+|[ |]+$/g, '');
const starts = (s: string, list: string[]) => list.some((p) => s.startsWith(p));

interface Row { date: string; desc: string; amount: number; balance: number | null; /** The amount as printed (debit or credit column), to check against the balance change. */ printed?: number }

export function cbaSummary(text: string): Row[] {
  const rows: Row[] = [];
  let cur: Row | null = null;
  const pat = new RegExp(String.raw`^\s*(\d{2}) (\w{3}) (\d{4})\s+(.*?)\s+(${MONEY})(?:\s+(${MONEY}))?\s*$`);
  for (const line of text.split('\n')) {
    const m = pat.exec(line);
    if (m && MONTHS[m[2]]) {
      const desc = m[4].trim();
      if (desc.startsWith('$ ') || desc.includes('FEE SAVED')) { cur = null; continue; }
      cur = { date: iso(m[1], m[2], m[3]), desc, amount: num(m[5]), balance: m[6] ? num(m[6]) : null };
      rows.push(cur); continue;
    }
    const s = line.trim();
    if (starts(s, ['Account Number', 'Any pending'])) { cur = null; continue; }
    if (cur && s && !starts(s, SKIP) && s.length < 70 && !/^[\d.]+ (US|GBR) DOLLAR/.test(s)) cur.desc += ' | ' + s;
  }
  return rows;
}

/** CommBank formal statement. Rows show only day and month, so the year comes from the statement's period. */
export function cbaStatement(text: string, yearOf: (day: string, mon: string) => number): { rows: Row[]; opening: number | null; closing: number | null } {
  const rows: Row[] = [];
  let cur: Row | null = null, prev: number | null = null, opening: number | null = null, closing: number | null = null;
  const start = /^\s*(\d{2}) (\w{3})(?: (\d{4}))? (.*)$/;
  const tail = /^(.*?)\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2}) CR\s*$/;
  for (const line of text.split('\n')) {
    let s = line.trim();
    if (!s) continue;
    const m = start.exec(s);
    if (m && MONTHS[m[2].slice(0, 3)]) {
      const body = m[4];
      if (body.includes('OPENING BALANCE') || body.includes('CLOSING BALANCE')) {
        const b = /([\d,]+\.\d{2}) CR/.exec(body);
        if (b && body.includes('OPENING')) { prev = num(b[1]); opening ??= prev; }
        if (b && body.includes('CLOSING')) closing = num(b[1]);
        cur = null; continue;
      }
      cur = { date: iso(m[1], m[2], m[3] ?? yearOf(m[1], m[2])), desc: '', amount: 0, balance: null };
      s = body;
    }
    if (!cur) continue;
    const t = tail.exec(s);
    if (t) {
      cur.desc = clean(cur.desc + ' | ' + t[1]);
      const bal = num(t[3]);
      cur.balance = bal;
      cur.amount = prev !== null ? Math.round((bal - prev) * 100) / 100 : -num(t[2]);
      cur.printed = num(t[2]);
      prev = bal;
      rows.push(cur); cur = null;
    } else if (!starts(s, SKIP) && !/^[\d.* ]+[A-Z0-9 .]+V\d/.test(s) && s.length < 90) {
      if (!/^(Statement|Account Number|Date Transaction)/.test(s)) cur.desc = clean(cur.desc + ' | ' + s);
    }
  }
  return { rows, opening, closing };
}

export function macquarie(text: string, yearOf: (day: string, mon: string) => number): { rows: Row[]; opening: number | null } {
  const rows: Row[] = [];
  let prev: number | null = null, opening: number | null = null;
  for (const line of text.split('\n')) {
    if (/Opening balance/.test(line)) {
      const b = /([\d,]+\.\d{2}) CR/.exec(line);
      if (b) { prev = num(b[1]); opening ??= prev; }
      continue;
    }
    const m = /^\s*(\w{3}) (\d{1,2})\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}([\d,]+\.\d{2})\s+([\d,]+\.\d{2}) CR\s*$/.exec(line);
    if (m && MONTHS[m[1]] && prev !== null) {
      const bal = num(m[6]);
      rows.push({ date: iso(m[2], m[1], yearOf(m[2], m[1])), desc: clean(m[3] + ' | ' + m[4]), amount: Math.round((bal - prev) * 100) / 100, balance: bal, printed: num(m[5]) });
      prev = bal;
    }
  }
  return { rows, opening };
}

export function detectFormat(text: string): PdfFormat | null {
  if (/OPENING BALANCE/.test(text) && /CLOSING BALANCE/.test(text)) return 'cba_statement';
  if (/Macquarie/.test(text) && /Transaction Listing/i.test(text) && /Opening balance/.test(text)) return 'macquarie';
  if (/list of transactions from \d{2}\/\d{2}\/\d{2}/.test(text) || /Transaction Summary/.test(text)) return 'cba_summary';
  return null;
}

/** The dates a statement covers, as printed on it. */
export function periodOf(text: string): { from: string; to: string } | null {
  let m = /transactions from (\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/.exec(text);
  if (m) return { from: `20${m[3]}-${m[2]}-${m[1]}`, to: `20${m[6]}-${m[5]}-${m[4]}` };
  m = /Period\s+(\d{1,2}) (\w{3})\w* (\d{4})\s*-\s*(\d{1,2}) (\w{3})\w* (\d{4})/.exec(text);
  if (m && MONTHS[m[2]] && MONTHS[m[5]]) return { from: iso(m[1], m[2], m[3]), to: iso(m[4], m[5], m[6]) };
  m = /From (\d{1,2}) ([A-Z][a-z]+) (\d{4}) to (\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(text);
  if (m && MONTHS[m[2].slice(0, 3)] && MONTHS[m[5].slice(0, 3)]) return { from: iso(m[1], m[2], m[3]), to: iso(m[4], m[5], m[6]) };
  return null;
}

/** Which of the family's accounts a statement belongs to, from the last four digits printed near "Account". */
export function accountFor(text: string, accounts: Account[]): string | null {
  const head = text.split('\n').slice(0, 60).join('\n');
  const near = [...head.matchAll(/Account (?:Number|No\.?)[^\n]*?\n?[^\n]*/gi)].map((m) => m[0].replace(/\s/g, ''));
  const digits = near.join(' ') + ' ' + head.replace(/\s/g, '');
  const hits = accounts.filter((a) => a.last4 && /^\d{4}$/.test(a.last4) && near.some((n) => n.includes(a.last4!)));
  if (hits.length === 1) return hits[0].key;
  const loose = accounts.filter((a) => a.last4 && /^\d{4}$/.test(a.last4) && new RegExp(`\\d{2,}${a.last4}(?!\\d)`).test(digits));
  return loose.length === 1 ? loose[0].key : null;
}

/** Read a statement's text into transactions, the dates it covers, and its opening and closing balances. */
export function parseStatementText(text: string, account: string, source: string): ParsedImport & { format: PdfFormat | null } {
  const format = detectFormat(text);
  if (!format) return { format, transactions: [], coverage: [], problems: ["This PDF doesn't look like a CommBank or Macquarie statement the app can read. Use the bank's CSV export, or ask Claude to prepare a data file from it."] };
  const period = periodOf(text);
  // Rows without a year: the year that puts the date inside the statement's period.
  const yearOf = (d: string, mon: string) => {
    // No period printed: the latest year that doesn't put the date in the future.
    if (!period) { const y = new Date().getFullYear(); return iso(d, mon, y) > localToday() ? y - 1 : y; }
    const a = Number(period.from.slice(0, 4)), b = Number(period.to.slice(0, 4));
    for (const y of [a, b]) { const x = iso(d, mon, y); if (x >= period.from && x <= period.to) return y; }
    return b;
  };
  let rows: Row[], opening: number | null = null, closing: number | null = null;
  if (format === 'cba_summary') rows = cbaSummary(text);
  else if (format === 'cba_statement') ({ rows, opening, closing } = cbaStatement(text, yearOf));
  else ({ rows, opening } = macquarie(text, yearOf));
  const problems: string[] = [];
  if (!rows.length) problems.push('No transactions found in this PDF.');
  // Amounts worked out from the balance must match the amount printed: a line the app couldn't read would otherwise
  // be folded silently into the next payment.
  const off = rows.find((r) => r.printed !== undefined && Math.abs(Math.abs(r.amount) - r.printed) > 0.005);
  if (off) problems.push(`A line near ${off.date} (${clean(off.desc).slice(0, 30)}) didn't read cleanly: the amounts may be wrong around there. Check that statement's payments after adding it, or use the bank's CSV.`);
  // Opening and closing from the running balance where the statement doesn't print them.
  const withBal = rows.filter((r) => r.balance !== null);
  if (withBal.length === rows.length && rows.length) {
    opening ??= Math.round((rows[0].balance! - rows[0].amount) * 100) / 100;
    closing ??= rows.at(-1)!.balance;
    // The balance column must run cleanly, or something was misread.
    let run = opening;
    for (const r of rows) { run = Math.round((run + r.amount) * 100) / 100; if (Math.abs(run - r.balance!) > 0.005) { problems.push(`The running balance doesn't add up at ${r.date} (${r.desc.slice(0, 30)}). Check this statement's payments after adding it.`); break; } }
  }
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.date.localeCompare(b.r.date) || a.i - b.i).map((x) => x.r);
  const transactions: Transaction[] = assignIds(sorted.map((r) => ({ date: r.date, account, amount: r.amount, description: tidyDescription(clean(r.desc)), category: null, kind: null, source })));
  const from = period?.from ?? transactions[0]?.date, to = period?.to ?? transactions.at(-1)?.date;
  const coverage = from && to ? [{ account, from, to }] : [];
  const statements: StatementBalance[] = from && to && opening !== null && closing !== null ? [{ account, from, to, opening, closing }] : [];
  return { format, transactions, coverage, problems, ...(statements.length ? { statements } : {}) };
}
