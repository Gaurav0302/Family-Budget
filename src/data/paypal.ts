import { splitCsvLine, toIsoDate, toNumber } from './importers';
import type { Transaction } from './types';

/** A purchase made through PayPal, with what it cost in Australian dollars (what the bank paid PayPal). */
export interface PayPalPurchase { date: string; merchant: string; aud: number; currency: string; gross: number; item?: string; id?: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Is this CSV PayPal's "Activity download"? */
export function isPayPalCsv(text: string) {
  const head = splitCsvLine(text.replace(/^﻿/, '').split(/\r?\n/)[0] ?? '').map(norm);
  return head.includes('gross') && head.includes('transactionid') && head.includes('type');
}

/** Read PayPal's activity CSV. Only completed payments to someone are kept; money moving between the bank and PayPal,
 *  and currency conversions, are used to find the Australian-dollar cost, never counted as spending. */
export function parsePayPalCsv(text: string): { purchases: PayPalPurchase[]; problems: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = splitCsvLine(lines[0] ?? '').map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n));
  const c = { date: col('date'), name: col('name'), type: col('type'), status: col('status'), cur: col('currency'), gross: col('gross'),
    id: col('transactionid'), ref: col('referencetxnid'), item: col('itemtitle'), subject: col('subject') };
  if (c.date < 0 || c.gross < 0 || c.type < 0) return { purchases: [], problems: ['This doesn’t look like a PayPal activity download (no Date, Type and Gross columns).'] };
  const rows = lines.slice(1).map(splitCsvLine).map((r) => ({
    date: toIsoDate(r[c.date] ?? ''), name: r[c.name] ?? '', type: (r[c.type] ?? '').trim(), status: (r[c.status] ?? 'Completed').trim(),
    cur: (r[c.cur] ?? 'AUD').trim(), gross: toNumber(r[c.gross] ?? ''), id: r[c.id] ?? '', ref: c.ref >= 0 ? r[c.ref] ?? '' : '',
    item: (c.item >= 0 ? r[c.item] : '') || (c.subject >= 0 ? r[c.subject] : '') || '',
  })).filter((r) => r.date && Number.isFinite(r.gross));
  const isMoney = (t: string) => /currency conversion|bank deposit|transfer|withdraw|hold|authori[sz]ation|card deposit/i.test(t);
  const purchases: PayPalPurchase[] = [];
  for (const r of rows) {
    if (r.gross >= 0 || isMoney(r.type) || !/^completed$/i.test(r.status)) continue;
    let aud = r.cur === 'AUD' ? -r.gross : NaN;
    if (r.cur !== 'AUD') {
      // The Australian-dollar side of the conversion, linked by reference or on the same day.
      const conv = rows.find((x) => /currency conversion/i.test(x.type) && x.cur === 'AUD' && x.gross < 0 && (x.ref === r.id || (!x.ref && x.date === r.date)));
      if (conv) aud = -conv.gross;
    }
    purchases.push({ date: r.date!, merchant: r.name || r.item || 'PayPal payment', aud: Math.round(aud * 100) / 100, currency: r.cur, gross: r.gross, item: r.item || undefined, id: r.id || undefined });
  }
  return { purchases, problems: [] };
}

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
// PayPal payments the bank shows without the shop's name (card payments like "PAYPAL *SHOP" already carry it).
const isPayPalDebit = (t: Transaction) => t.amount < 0 && /paypal/i.test(t.description) && !/^PayPal: /.test(t.description) && !/paypal \*/i.test(t.description);

/** Pair each PayPal purchase with the bank payment that paid for it: same amount, within six days. Each pairs once. */
export function matchPayPal(purchases: PayPalPurchase[], txs: Transaction[]) {
  const open = txs.filter(isPayPalDebit);
  const used = new Set<string>();
  const matches: { tx: Transaction; purchase: PayPalPurchase; description: string }[] = [];
  const unmatched: PayPalPurchase[] = [];
  for (const p of [...purchases].sort((a, b) => a.date.localeCompare(b.date))) {
    const hit = Number.isFinite(p.aud) ? open.filter((t) => !used.has(t.id) && Math.abs(-t.amount - p.aud) < 0.01 && days(t.date, p.date) <= 6)
      .sort((a, b) => days(a.date, p.date) - days(b.date, p.date))[0] : undefined;
    if (!hit) { unmatched.push(p); continue; }
    used.add(hit.id);
    matches.push({ tx: hit, purchase: p, description: `PayPal: ${p.merchant}${p.currency !== 'AUD' ? ` (${p.currency} ${Math.abs(p.gross).toFixed(2)})` : ''}` });
  }
  const stillUnnamed = open.filter((t) => !used.has(t.id));
  return { matches, unmatched, stillUnnamed };
}
