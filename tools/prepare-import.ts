/**
 * Turn the output of parse_statements.py into a Family Budget data file the app can import,
 * already sorted into categories with the app's own rules.
 *
 *   npx tsx tools/prepare-import.ts parsed.json out.json \
 *     --coverage g-salary=2026-09-01..2026-10-16 \
 *     --balance r-saver=2026-09-30:116002.43 \
 *     --household private/household.json   (accounts, budget and the family's own sorting rules — never commit it)
 *     --review 2026-10:review.md            (the monthly note, shown on the Review page)
 *
 * Prints a short month-by-month summary so you can sanity-check the numbers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Review } from '../src/data/types';
import { DEFAULT_SETTINGS } from '../src/data/defaults';
import { applyRules } from '../src/data/rules';
import { tidyDescription } from '../src/data/merchant';
import { allMonths, summarise } from '../src/data/analysis';
import type { Balance, BudgetLine, Coverage, DataFile, Rule, Settings, Transaction } from '../src/data/types';

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: tsx tools/prepare-import.ts parsed.json out.json [--coverage acct=from..to] [--balance acct=date:amount] [--card-itemised-from YYYY-MM-DD]');
  process.exit(1);
}
const coverage: Coverage[] = [];
const balances: Balance[] = [];
let cardItemisedFrom = DEFAULT_SETTINGS.cardItemisedFrom;
const reviews: Review[] = [];
let household: { settings?: Partial<Settings>; budgets?: BudgetLine[]; rules?: Rule[] } = {};
for (let i = 0; i < rest.length; i += 2) {
  const [flag, value] = [rest[i], rest[i + 1]];
  if (flag === '--coverage') {
    const [account, range] = value.split('=');
    const [from, to] = range.split('..');
    coverage.push({ account, from, to });
  } else if (flag === '--balance') {
    const [account, rhs] = value.split('=');
    const [date, amount] = rhs.split(':');
    balances.push({ account, date, amount: Number(amount) });
  } else if (flag === '--card-itemised-from') cardItemisedFrom = value;
  else if (flag === '--household') household = JSON.parse(readFileSync(value, 'utf8'));
  else if (flag === '--review') {
    const [month, path] = value.split(/:(.*)/s);
    const body = readFileSync(path, 'utf8').trim();
    reviews.push({ id: `${month}:claude`, month, title: `${month} review`, body, author: 'Claude', created: new Date().toISOString() });
  }
}

const raw: { id: string; date: string; account: string; desc: string; amount: number }[] = JSON.parse(readFileSync(input, 'utf8'));
const txs: Transaction[] = raw.map((r) => ({
  id: r.id, date: r.date, account: r.account, amount: r.amount,
  description: tidyDescription(r.desc), category: null, kind: null, source: 'statement',
}));
const rules = (household.rules ?? []).map((r) => ({ ...r, user: true }));
const sorted = applyRules(txs, rules, { cardItemisedFrom });

const file: DataFile = {
  app: 'family-budget', version: 1, exported: new Date().toISOString(),
  transactions: sorted, coverage, ...(reviews.length ? { reviews } : {}),
  settings: { ...(household.settings ?? {}), cardItemisedFrom, ...(balances.length ? { balances } : {}) },
  ...(household.budgets ? { budgets: household.budgets } : {}),
  ...(household.rules ? { rules: household.rules } : {}),
};
writeFileSync(output, JSON.stringify(file, null, 1));

const settings = { ...DEFAULT_SETTINGS, ...(household.settings ?? {}), cardItemisedFrom } as Settings;
console.log(`${sorted.length} transactions, ${sorted.filter((t) => t.needsReview).length} need a person to sort them.`);
for (const m of allMonths(sorted)) {
  const s = summarise(m, { transactions: sorted, coverage, settings });
  console.log(`${m}  ${s.complete ? 'complete' : 'partial '}  in ${s.income.toFixed(0).padStart(7)}  spent ${s.spend.toFixed(0).padStart(7)}  kept ${s.kept.toFixed(0).padStart(7)} (${(s.keptRate * 100).toFixed(0)}%)`);
}
