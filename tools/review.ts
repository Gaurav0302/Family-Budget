/**
 * Print the app's monthly review as text, from a Family Budget data file or backup.
 *   npx tsx tools/review.ts 2026-11 backup.json new-month.json
 * Give it the latest backup plus the new data file: transactions are merged by id, as the app does.
 * Agents use this to write the monthly note so it matches what the app shows.
 */
import { readFileSync } from 'node:fs';
import { completeMonths } from '../src/data/analysis';
import { mergeCoverage } from '../src/data/importers';
import { DEFAULT_BUDGETS, DEFAULT_SETTINGS } from '../src/data/defaults';
import { reviewMonth, reviewText } from '../src/data/review';
import { indexPayees, sortTransaction } from '../src/data/payees';
import type { Data, DataFile } from '../src/data/types';

const args = process.argv.slice(2);
const month = /^\d{4}-\d{2}$/.test(args[0] ?? '') ? args.shift() : undefined;
if (!args.length) { console.error('Usage: tsx tools/review.ts [YYYY-MM] file.json [more.json ...]'); process.exit(1); }
const files: DataFile[] = args.map((a) => JSON.parse(readFileSync(a, 'utf8')));
const byId = new Map<string, any>();
for (const x of files) for (const t of x.transactions ?? []) if (!byId.has(t.id) || t.manual) byId.set(t.id, t);
const ruleIds = new Set<string>();
const f: DataFile = {
  app: 'family-budget', version: 1,
  transactions: [...byId.values()],
  coverage: mergeCoverage(files.flatMap((x) => x.coverage ?? [])),
  budgets: files.flatMap((x) => x.budgets ?? []),
  rules: files.flatMap((x) => x.rules ?? []).filter((r) => (ruleIds.has(r.id) ? false : (ruleIds.add(r.id), true))),
  reviews: files.flatMap((x) => x.reviews ?? []),
  payees: files.flatMap((x) => x.payees ?? []).filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i),
  settings: Object.assign({}, ...files.map((x) => x.settings ?? {}), { balances: files.flatMap((x) => x.settings?.balances ?? []) }),
};
const settings = { ...DEFAULT_SETTINGS, ...(f.settings ?? {}), home: { ...DEFAULT_SETTINGS.home, ...(f.settings?.home ?? {}) } };
const rules = (f.rules ?? []).map((r) => ({ ...r, user: true }));
const data: Data = {
  // Sort with the family's payee list (from the backup), as the app does.
  transactions: (f.transactions ?? []).map((t) => { const { payee: _p, ...x } = sortTransaction(t, indexPayees(f.payees ?? []), rules, settings); return { ...t, ...x }; }),
  rules, budgets: f.budgets?.length ? f.budgets : DEFAULT_BUDGETS, coverage: f.coverage ?? [], settings, reviews: f.reviews ?? [], payees: f.payees ?? [],
};
const m = month ?? completeMonths(data).at(-1);
if (!m) { console.error('No complete month in this file.'); process.exit(1); }
console.log(reviewText(reviewMonth(data, m)));
