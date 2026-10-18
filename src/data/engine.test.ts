import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetFor, completeMonths, findRecurring, summarise } from './analysis';
import { DEFAULT_SETTINGS } from './defaults';
import { assignIds, mergeCoverage, parseCsv, splitNew } from './importers';
import { merchantOf, tidyDescription } from './merchant';
import { reviewMonth } from './review';
import { applyRules, categorise } from './rules';
import type { BudgetLine, Data, Settings, Transaction } from './types';

/** A made-up household, so no real details live in the tests. */
const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS, cardItemisedFrom: '2026-07-22', expectedIncome: 18000,
  accounts: [
    { key: 'a-everyday', name: 'A everyday', owner: 'A', type: 'everyday', core: true },
    { key: 'a-card', name: 'A card', owner: 'A', type: 'card', core: true },
    { key: 'b-everyday', name: 'B everyday', owner: 'B', type: 'everyday', core: true },
  ],
  home: { name: '1 Example St', settlement: '2026-12-09', repayment: 6000, loan: 900000, rate: 6, leaseEnds: '2027-04-09', value: 1000000, loanPlannerUrl: '' },
};
const BUDGETS: BudgetLine[] = [
  { category: 'rent', amount: 2500, from: '2026-01' }, { category: 'groceries', amount: 800, from: '2026-01' },
  { category: 'takeaway', amount: 150, from: '2026-01' }, { category: 'subscriptions', amount: 100, from: '2026-01' },
  { category: 'mortgage', amount: 6000, from: '2026-12' }, { category: 'rent', amount: 0, from: '2027-04' },
];

const tx = (date: string, amount: number, description: string, account = 'b-everyday'): Transaction =>
  ({ id: `${account}:${date}:${amount}:${description}`, date, amount, description, account, category: null, kind: null });
const sort = (t: Transaction) => categorise(t, [], SETTINGS);

describe('sorting rules', () => {
  it('treats own-account moves as transfers, never spending', () => {
    expect(sort(tx('2026-09-07', -250, 'Transfer to xx1111 NetBank | self save', 'a-everyday'))).toMatchObject({ kind: 'transfer', category: 'own-transfer' });
    expect(sort(tx('2026-09-05', -250, 'Transfer to other Bank NetBank | self mq save', 'a-everyday'))).toMatchObject({ kind: 'transfer' });
    expect(sort(tx('2026-07-14', -6000, 'Transfer to xx2222 CommBank app'))).toMatchObject({ kind: 'transfer' });
  });
  it('counts card repayments as spending only before card details exist', () => {
    expect(sort(tx('2026-06-20', -2288.99, 'CBA CR CARD AUTOPAY PMNT', 'a-everyday'))).toMatchObject({ kind: 'spend', category: 'card-unitemised' });
    expect(sort(tx('2026-09-19', -2294.26, 'CBA CR CARD AUTOPAY PMNT', 'a-everyday'))).toMatchObject({ kind: 'transfer', category: 'card-payment' });
  });
  it('separates memberships from takeaway', () => {
    expect(sort(tx('2026-07-09', -9.99, 'UBER *ONE MEMBERSHIP U Sydney AU AUS')).category).toBe('subscriptions');
    expect(sort(tx('2026-07-04', -38.18, 'UBER *EATS HELP.UBER.C Sydney AU AUS')).category).toBe('takeaway');
    expect(sort(tx('2026-07-14', -9.99, 'DD *DOORDASHDASHPASS MELBOURNE VI AUS')).category).toBe('subscriptions');
  });
  it('sorts common household payments', () => {
    expect(sort(tx('2026-09-07', -2500, 'Transfer To Example Real Estate | rent Oct', 'a-everyday')).category).toBe('rent');
    expect(sort(tx('2026-09-15', 10142.38, 'Salary EXAMPLE PTY LTD', 'a-everyday'))).toMatchObject({ kind: 'income', category: 'salary' });
    expect(sort(tx('2026-08-21', 45.05, 'Direct Credit 002221 MCARE BENEFITS'))).toMatchObject({ kind: 'spend', category: 'medical' });
    expect(sort(tx('2026-09-03', -50, 'Direct Debit 616851 Spaceship', 'a-everyday'))).toMatchObject({ kind: 'invest' });
    expect(sort(tx('2026-08-21', -273.1, 'IMT 999999 Example Person')).category).toBe('family-overseas');
    expect(sort(tx('2026-07-01', -800, 'Wdl Agency AUST POST EXAMPLE LPO')).category).toBe('cash');
  });
  it('asks a person when it is not sure', () => {
    expect(sort(tx('2026-09-05', -1790, 'Transfer To Someone Unknown', 'a-everyday'))).toMatchObject({ category: 'other', needsReview: true });
  });
  it("lets people's own rules win and never overwrites manual choices", () => {
    const t = tx('2026-09-05', -1790, 'Transfer To Someone Unknown', 'a-everyday');
    expect(categorise(t, [{ id: 'u', pattern: 'Someone', category: 'home-maintenance', kind: 'spend' }], SETTINGS).category).toBe('home-maintenance');
    const manual = { ...t, category: 'gifts', kind: 'spend' as const, manual: true };
    expect(applyRules([manual], [], SETTINGS)[0].category).toBe('gifts');
  });
});

describe('importing', () => {
  it('reads a CommBank CSV with no header and gives stable ids', () => {
    const csv = '15/09/2026,"+10142.38","Salary EXAMPLE PTY LTD 650","+10247.57"\n15/09/2026,"-250.00","Transfer to xx1111 NetBank self save","+9997.57"\n15/09/2026,"-250.00","Transfer to xx1111 NetBank self save","+9747.57"';
    const p = parseCsv(csv, 'a-everyday', 'test.csv');
    expect(p.transactions.map((t) => t.id)).toEqual(['a-everyday:2026-09-15:10142.38:1', 'a-everyday:2026-09-15:-250.00:1', 'a-everyday:2026-09-15:-250.00:2']);
    expect(p.coverage).toEqual([{ account: 'a-everyday', from: '2026-09-15', to: '2026-09-15' }]);
  });
  it('reads a CSV with debit and credit columns', () => {
    const csv = 'Transaction Date,Details,Debit,Credit,Balance\n05 Oct 2026,From A PERSON - self mq save,,250.00,1250.00\n06 Oct 2026,Card purchase,12.50,,1237.50';
    const p = parseCsv(csv, 'a-savings', 'savings.csv');
    expect(p.transactions.map((t) => t.amount)).toEqual([250, -12.5]);
    expect(p.transactions[0].date).toBe('2026-10-05');
  });
  it('skips duplicates already in the app', () => {
    const a = assignIds([{ date: '2026-09-01', account: 'x', amount: -5, description: 'a', category: null, kind: null }]);
    expect(splitNew(a, a).fresh).toHaveLength(0);
  });
  it('joins touching coverage periods', () => {
    expect(mergeCoverage([{ account: 'a', from: '2026-07-01', to: '2026-07-31' }, { account: 'a', from: '2026-08-01', to: '2026-08-31' }]))
      .toEqual([{ account: 'a', from: '2026-07-01', to: '2026-08-31' }]);
  });
  it('removes reference numbers from descriptions and names merchants', () => {
    expect(tidyDescription('Direct Debit 010758 AHM | 37964017 | Value Date: 17/09/2026')).toBe('Direct Debit 010758 AHM');
    expect(merchantOf('UBER *EATS HELP.UBER.C Sydney AU AUS')).toBe('Uber Eats');
    expect(merchantOf('PayPal: Suburb Data Pty Limited')).toBe('Suburb Data');
  });
});

function sample(): Data {
  const rows: Omit<Transaction, 'id'>[] = [];
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    rows.push(
      tx(`${m}-14`, 8000, 'Salary EXAMPLE ONE'), tx(`${m}-15`, 10000, 'Salary EXAMPLE TWO', 'a-everyday'),
      tx(`${m}-07`, -2500, 'Example Real Estate rent', 'a-everyday'), tx(`${m}-10`, -900, 'Coles Online'),
      tx(`${m}-12`, -155, 'OPENAI *CHATGPT SUBSCR', 'a-card'), tx(`${m}-03`, -352, 'ANTHROPIC* CLAUDE SUB', 'a-card'),
      tx(`${m}-20`, m === '2026-09' ? -900 : -400, 'UBER *EATS HELP.UBER.C'), tx(`${m}-21`, -250, 'Transfer to xx2222 CommBank app'),
    );
  }
  const transactions = applyRules(assignIds(rows), [], SETTINGS);
  const coverage = ['a-everyday', 'a-card', 'b-everyday'].map((account) => ({ account, from: '2026-07-01', to: '2026-09-30' }));
  return { transactions, coverage, rules: [], budgets: BUDGETS, reviews: [],
    settings: { ...SETTINGS, balances: [{ account: 'b-savings', date: '2026-09-30', amount: 100000 }] } };
}

describe('monthly numbers', () => {
  const data = sample();
  it('adds up income, spending and what was kept, ignoring transfers', () => {
    const s = summarise('2026-09', data);
    expect(s.income).toBe(18000);
    expect(s.spend).toBeCloseTo(2500 + 900 + 155 + 352 + 900);
    expect(s.kept).toBeCloseTo(18000 - s.spend);
    expect(s.complete).toBe(true);
  });
  it('knows which months are complete', () => {
    expect(completeMonths(data)).toEqual(['2026-07', '2026-08', '2026-09']);
  });
  it('switches budgets from rent to mortgage at settlement', () => {
    expect(budgetFor(BUDGETS, 'rent', '2026-11')).toBe(2500);
    expect(budgetFor(BUDGETS, 'mortgage', '2026-11')).toBe(0);
    expect(budgetFor(BUDGETS, 'mortgage', '2026-12')).toBe(6000);
    expect(budgetFor(BUDGETS, 'rent', '2027-04')).toBe(0);
  });
  it('finds subscriptions and flags overlapping AI tools', () => {
    expect(findRecurring(data.transactions, '2026-09').map((s) => s.merchant)).toEqual(['Claude', 'ChatGPT']);
    expect(reviewMonth(data, '2026-09').findings.some((f) => f.id === 'overlap:two AI assistants')).toBe(true);
  });
  it('spots takeaway over budget, the rent overlap, and says the month got worse', () => {
    const r = reviewMonth(data, '2026-09');
    expect(r.findings.find((f) => f.id === 'over:takeaway')?.severity).toBe('act');
    expect(r.findings.some((f) => f.id === 'home:overlap')).toBe(true);
    expect(r.verdict.tone).toBe('worse');
    expect(r.babylon).toHaveLength(7);
    expect(r.ramsey.steps).toHaveLength(7);
  });
});

describe('privacy', () => {
  // The words to look for are themselves private, so they live in private/privacy-words.txt (git-ignored, one per line).
  // Claude sessions get that file from the Project; without it this check is skipped.
  const list = existsSync('private/privacy-words.txt') ? readFileSync('private/privacy-words.txt', 'utf8').split('\n').map((w) => w.trim()).filter(Boolean) : [];
  it.skipIf(!list.length)('keeps personal details out of the public code', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]));
    const files = [...walk('src'), ...walk('tools'), ...walk('supabase'), ...walk('.github'), 'README.md', 'CLAUDE.md', 'AGENT-RUNBOOK.md', 'PROJECT.md', 'DECISIONS.md', 'BACKLOG.md', 'SESSION-HANDOFF.md', 'index.html']
      .filter((f) => existsSync(f));
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n').toLowerCase();
    for (const word of list) expect(text.includes(word.toLowerCase()), `found a private word in the public code`).toBe(false);
  });
});
