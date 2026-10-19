import { describe, expect, it } from 'vitest';
import { accountFor, detectFormat, layoutLines, parseStatementText, periodOf } from './pdfStatements';
import type { Account } from './types';

// Made-up statements in the banks' layouts (no real data).
const summary = [
  '                                                   Account Number        06 2000 12345678',
  "Here's your account information and a list of transactions from 01/12/26-31/01/27.",
  ' Date                     Transaction details                                        Amount                  Balance',
  ' 30 Dec 2026              EXAMPLE GROCER MELBOURNE AUS                               -$61.20              $1,938.80',
  '                          Card xx1111',
  '                          Value Date: 28/12/2026',
  ' 02 Jan 2027              SALARY EXAMPLE PTY LTD                                   $5,000.00              $6,938.80',
  ' 02 Jan 2027              EXAMPLE GROCER MELBOURNE AUS                               -$61.20              $6,877.60',
].join('\n');

const statement = [
  '                     Period             1 Dec 2026 - 31 Jan 2027',
  '                     Date Transaction                         Debit        Credit                 Balance',
  '                     01 Dec 2026 OPENING BALANCE                                                2,000.00 CR',
  '                     30 Dec Direct Debit 123456 EXAMPLE GYM',
  '                            REF 991                           38.75                             1,961.25 CR',
  '                     03 Jan Transfer from savings',
  '                            self                                         500.00                 2,461.25 CR',
  '                     31 Jan 2027 CLOSING BALANCE                                                2,461.25 CR',
].join('\n');

const accounts: Account[] = [
  { key: 'every', name: 'Everyday', owner: 'A', type: 'everyday', last4: '5678' },
  { key: 'save', name: 'Savings', owner: 'A', type: 'savings', last4: '9999' },
];

describe('PDF statements', () => {
  it('lays out positioned text as columns, leaving out sideways margin text', () => {
    const text = layoutLines([[
      { str: '01 Jan 2027', x: 30, y: 700, width: 44, height: 8 },
      { str: ' ', x: 74, y: 700, width: 60, height: 8 },
      { str: 'SHOP', x: 134, y: 700, width: 16, height: 8 },
      { str: '-$5.00', x: 300, y: 700.5, width: 24, height: 8 },
      { str: 'MARGIN 12.34.56', x: 5, y: 700, width: 60, height: 6, rotated: true },
    ]]);
    const line = text.split('\n')[0];
    expect(line).toMatch(/01 Jan 2027 {2,}SHOP {2,}-\$5\.00$/);
    expect(line).not.toContain('MARGIN');
  });
  it('reads a CommBank transaction summary, across the new year', () => {
    expect(detectFormat(summary)).toBe('cba_summary');
    expect(periodOf(summary)).toEqual({ from: '2026-12-01', to: '2027-01-31' });
    const r = parseStatementText(summary, 'every', 'test.pdf');
    expect(r.transactions.map((t) => [t.id, t.description])).toEqual([
      ['every:2026-12-30:-61.20:1', 'EXAMPLE GROCER MELBOURNE AUS'],
      ['every:2027-01-02:5000.00:1', 'SALARY EXAMPLE PTY LTD'],
      ['every:2027-01-02:-61.20:1', 'EXAMPLE GROCER MELBOURNE AUS'],
    ]);
    expect(r.coverage).toEqual([{ account: 'every', from: '2026-12-01', to: '2027-01-31' }]);
    expect(r.statements?.[0]).toMatchObject({ opening: 2000, closing: 6877.6 });
    expect(r.problems).toEqual([]);
  });
  it('reads a CommBank statement, giving rows without a year the one inside the period', () => {
    expect(detectFormat(statement)).toBe('cba_statement');
    const r = parseStatementText(statement, 'every', 'test.pdf');
    expect(r.transactions.map((t) => `${t.date} ${t.amount}`)).toEqual(['2026-12-30 -38.75', '2027-01-03 500']);
    expect(r.statements?.[0]).toMatchObject({ from: '2026-12-01', to: '2027-01-31', opening: 2000, closing: 2461.25 });
  });
  it('warns when a line was misread instead of folding it into the next payment', () => {
    const lost = statement.replace('                     30 Dec Direct Debit 123456 EXAMPLE GYM\n                            REF 991                           38.75                             1,961.25 CR\n', '');
    const r = parseStatementText(lost, 'every', 'test.pdf');
    expect(r.transactions.map((t) => t.amount)).toEqual([461.25]);
    expect(r.problems[0]).toMatch(/didn't read cleanly/);
  });
  it('finds the account from the last four digits near "Account Number"', () => {
    expect(accountFor(summary, accounts)).toBe('every');
    expect(accountFor('nothing here', accounts)).toBeNull();
  });
  it("says so when the PDF isn't a statement it knows", () => {
    expect(parseStatementText('PAY ADVICE\nGross 1,000.00', 'every', 'x.pdf').problems[0]).toMatch(/doesn't look like/);
  });
});
