import { lastDay, monthOf, shiftDays, statementAccounts } from './analysis';
import type { Account, Data, StatementBalance, Transaction } from './types';
import { payFor } from './wealth';

/** Is every dollar of a month in the app? Statements by account, then six checks that prove nothing was missed. */

export type CellState = 'full' | 'part' | 'missing' | 'closed';
export type CheckState = 'ok' | 'warn' | 'fail' | 'unknown';
export type MonthState = 'done' | 'checks' | 'missing' | 'in-progress' | 'empty';

export interface AccountMonth {
  account: Account;
  state: CellState;
  /** Covered dates within the month, when only part of it is in. */
  from?: string; to?: string;
  /** Did a statement's opening + transactions = closing for this month? */
  ties?: 'yes' | 'no' | 'unknown';
  diff?: number;
}
export interface Check { id: string; title: string; state: CheckState; detail: string; items?: string[]; fix?: { label: string; to: string }; /** A short to-do, for one-line summaries. */ todo?: string }
export interface MonthAudit { month: string; state: MonthState; accounts: AccountMonth[]; checks: Check[]; missing: AccountMonth[]; summary: string }

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
import { today } from '../lib/format';
const name = (a: Account) => a.name;

/** Accounts that hold money and send statements (loans and PayPal don't). */
export { statementAccounts };

function covered(data: Pick<Data, 'coverage'>, account: string, start: string, end: string) {
  const spans = data.coverage.filter((c) => c.account === account && c.to >= start && c.from <= end);
  if (!spans.length) return { state: 'missing' as const };
  const full = spans.some((c) => c.from <= shiftDays(start, 2) && c.to >= shiftDays(end, -2));
  const from = spans.map((c) => (c.from > start ? c.from : start)).sort()[0];
  const to = spans.map((c) => (c.to < end ? c.to : end)).sort().at(-1)!;
  return { state: full ? 'full' as const : 'part' as const, from, to };
}

/** Opening + every transaction between = closing? Checked for each statement that overlaps the month. */
function tieFor(txs: Transaction[], stmts: StatementBalance[], account: string, start: string, end: string): Pick<AccountMonth, 'ties' | 'diff'> {
  const mine = stmts.filter((s) => s.account === account && s.to >= start && s.from <= end);
  if (!mine.length) return { ties: 'unknown' };
  let worst = 0;
  for (const s of mine) {
    const sum = txs.filter((t) => t.account === account && t.date >= s.from && t.date <= s.to).reduce((a, t) => a + t.amount, 0);
    const diff = Math.round((s.closing - s.opening - sum) * 100) / 100;
    if (Math.abs(diff) > Math.abs(worst)) worst = diff;
  }
  return Math.abs(worst) < 0.01 ? { ties: 'yes' } : { ties: 'no', diff: worst };
}

export function auditMonth(data: Pick<Data, 'transactions' | 'coverage' | 'settings'>, month: string): MonthAudit {
  const s = data.settings;
  const start = `${month}-01`, end = lastDay(month);
  const now = today();
  const inProgress = end >= now;
  const txs = data.transactions.filter((t) => monthOf(t.date) === month);
  const stmts = s.statements ?? [];

  const accounts: AccountMonth[] = statementAccounts(s.accounts).map((a) => {
    if ((a.openedOn && a.openedOn > end) || (a.closedOn && a.closedOn < start)) return { account: a, state: 'closed' as const };
    const c = covered(data, a.key, start, end);
    const t = c.state === 'missing' ? {} : tieFor(data.transactions, stmts, a.key, start, end);
    return { account: a, ...c, ...t };
  });
  const open = accounts.filter((a) => a.state !== 'closed');
  const missing = open.filter((a) => a.state !== 'full');
  const coveredOn = (key: string, date: string) => data.coverage.some((c) => c.account === key && c.from <= date && c.to >= date);
  const checks: Check[] = [];

  // 1. Every account is in.
  checks.push({
    id: 'statements', title: 'Every account is in',
    state: missing.length ? (inProgress ? 'unknown' : 'fail') : 'ok',
    detail: missing.length
      ? `${open.length - missing.length} of ${open.length} accounts cover the whole month.${inProgress ? ' The month isn’t over yet.' : ''}`
      : `All ${open.length} accounts cover the whole month.`,
    items: missing.map((m) => m.state === 'part' ? `${name(m.account)}: only ${short(m.from!)} to ${short(m.to!)}` : `${name(m.account)}: no statement yet`),
    fix: missing.length ? { label: 'Add statements', to: '/import' } : undefined,
  });

  // 2. Balances add up.
  const withTx = open.filter((a) => a.state !== 'missing');
  const off = withTx.filter((a) => a.ties === 'no');
  const unknown = withTx.filter((a) => a.ties === 'unknown' && a.account.type !== 'card');
  checks.push({
    id: 'balances', title: 'Balances add up', todo: off.length ? 'find what’s missing from a statement' : 'add statement balances',
    state: off.length ? 'fail' : unknown.length ? 'unknown' : withTx.length ? 'ok' : 'unknown',
    detail: off.length ? 'Opening balance plus the transactions doesn’t reach the closing balance, so something is missing or doubled.'
      : unknown.length ? 'Some statements were added without their opening and closing balance, so they can’t be proved complete.'
      : 'For every statement, opening balance plus every transaction equals the closing balance.',
    items: [...off.map((a) => `${name(a.account)}: out by ${money(a.diff!)}`), ...unknown.map((a) => `${name(a.account)}: balances not recorded`)],
  });

  // 3. Transfers match both ends.
  const transfers = txs.filter((t) => t.category === 'own-transfer');
  const used = new Set<string>();
  const unmatched: Transaction[] = [];
  for (const t of transfers) {
    if (used.has(t.id)) continue;
    const other = data.transactions.find((x) => x.id !== t.id && !used.has(x.id) && x.category === 'own-transfer' && x.account !== t.account
      && Math.abs(x.amount + t.amount) < 0.01 && days(x.date, t.date) <= 4);
    if (other) { used.add(t.id); used.add(other.id); } else unmatched.push(t);
  }
  const acctName = (k: string) => name(s.accounts.find((a) => a.key === k) ?? ({ name: k } as Account));
  checks.push({
    id: 'transfers', title: 'Transfers match at both ends', todo: `match ${unmatched.length} transfer${unmatched.length === 1 ? '' : 's'}`,
    state: unmatched.length ? (missing.length ? 'unknown' : 'warn') : transfers.length ? 'ok' : 'ok',
    detail: unmatched.length
      ? `${unmatched.length} transfer${unmatched.length === 1 ? '' : 's'} between your accounts ${unmatched.length === 1 ? 'has' : 'have'} no other end in the app.${missing.length ? ' Usually that’s a statement still to add.' : ' The other account may be missing from the app, or the payment isn’t really a transfer.'}`
      : `${transfers.length} transfer${transfers.length === 1 ? '' : 's'} between your accounts, all matched.`,
    items: unmatched.slice(0, 8).map((t) => `${short(t.date)}: ${money(t.amount)} ${t.amount < 0 ? 'out of' : 'into'} ${acctName(t.account)}`),
  });

  // 4. Pay arrived.
  const earners = [...new Set((s.pay ?? []).map((p) => p.person))];
  const pays = earners.map((person) => {
    const p = payFor(s, person, month);
    const theirs = s.accounts.filter((a) => a.owner === person).map((a) => a.key);
    const seen = txs.filter((t) => t.category === 'salary' && theirs.includes(t.account)).length;
    const expected = !p ? 0 : p.every === 'week' ? 4 : p.every === 'fortnight' ? 2 : 1;
    const canTell = theirs.some((k) => open.find((a) => a.account.key === k)?.state === 'full');
    return { person, seen, expected, canTell };
  }).filter((x) => x.expected);
  const noPay = pays.filter((x) => x.seen === 0);
  const fewPay = pays.filter((x) => x.seen > 0 && x.seen < x.expected);
  checks.push({
    id: 'pay', title: 'Pay arrived', todo: 'check pay',
    state: !pays.length ? 'unknown' : noPay.some((x) => x.canTell) && !inProgress ? 'fail' : noPay.length || fewPay.length ? 'unknown' : 'ok',
    detail: !pays.length ? 'Add each person’s pay on Wealth → Income & super so the app knows what to expect.'
      : noPay.length || fewPay.length ? 'Some pay expected this month isn’t in the app. Usually that’s a missing statement, or a pay date that moved.'
      : 'Everyone’s pay is in.',
    items: [...noPay.map((x) => `${x.person}: no pay seen${x.canTell ? '' : ' (their statement isn’t in yet)'}`), ...fewPay.map((x) => `${x.person}: ${x.seen} of about ${x.expected} pays`)],
  });

  // 5. Card repayments match the card statement.
  const cards = s.accounts.filter((a) => a.type === 'card').map((a) => a.key);
  const repayments = txs.filter((t) => t.category === 'card-payment' && t.amount < 0 && !cards.includes(t.account) && t.date >= s.cardItemisedFrom);
  const loose = repayments.filter((t) => !data.transactions.some((x) => cards.includes(x.account) && Math.abs(x.amount + t.amount) < 0.01 && days(x.date, t.date) <= 5));
  const cardIn = cards.some((k) => coveredOn(k, end) || coveredOn(k, start));
  // A repayment counted as card spending (card items not loaded) while the card statement does cover the weeks it pays for
  // would count that spending twice. A repayment pays the statement before it: roughly 25 to 55 days earlier.
  const twice = txs.filter((t) => t.category === 'card-unitemised' && t.amount < 0 && cards.some((k) => coveredOn(k, shiftDays(t.date, -50)) && coveredOn(k, shiftDays(t.date, -25))));
  checks.push({
    id: 'card', title: 'Card repayments match', todo: 'match card repayments',
    state: twice.length ? 'warn' : !repayments.length ? 'ok' : !cardIn ? 'unknown' : loose.length ? 'warn' : 'ok',
    detail: twice.length ? 'A card repayment is counted as spending although the card statement for those weeks is in, so that spending counts twice. Move the card cut-over date (Accounts) or sort the repayment as a card repayment.'
      : !repayments.length ? 'No card repayments this month.'
      : !cardIn ? 'The card statement for this month isn’t in, so its spending can’t be counted item by item.'
      : loose.length ? 'A repayment left the bank but doesn’t appear on the card statement.' : 'Every repayment shows on the card statement.',
    items: [...twice.map((t) => `${short(t.date)}: ${money(t.amount)} counted as card spending`), ...loose.map((t) => `${short(t.date)}: ${money(t.amount)} from ${acctName(t.account)}`)],
  });

  // 6. No unknown accounts: money moving to an account number the app doesn't know.
  const known = new Set(s.accounts.map((a) => a.last4).filter(Boolean));
  const strangers = new Map<string, Transaction[]>();
  for (const t of txs) {
    for (const m of t.description.matchAll(/\bxx\s?(\d{4})\b/gi)) if (!known.has(m[1])) strangers.set(m[1], [...(strangers.get(m[1]) ?? []), t]);
  }
  checks.push({
    id: 'unknown', title: 'No accounts the app doesn’t know', todo: strangers.size ? 'check an unknown account' : 'add account numbers',
    state: strangers.size ? 'warn' : known.size ? 'ok' : 'unknown',
    detail: strangers.size ? 'Money moved to or from an account ending in these digits. If it’s yours, add it on Accounts so its statements are expected too.'
      : known.size ? 'Every account number mentioned belongs to an account in the app.' : 'Add the last 4 digits of each account on Accounts so this can be checked.',
    items: [...strangers].map(([d, ts]) => `Account ending ${d}: ${ts.length} payment${ts.length === 1 ? '' : 's'}, ${money(ts.reduce((a, t) => a + t.amount, 0))}`),
    fix: strangers.size || !known.size ? { label: 'Open Accounts', to: '/accounts' } : undefined,
  });

  // Not about completeness, but worth finishing: things waiting for a person.
  const waiting = txs.filter((t) => t.needsReview).length;
  checks.push({
    id: 'sorted', title: 'Everything sorted',
    state: waiting ? 'warn' : 'ok',
    detail: waiting ? `${waiting} payment${waiting === 1 ? ' still needs' : 's still need'} a category.` : 'Every payment has a category.',
    todo: `sort ${waiting} payment${waiting === 1 ? '' : 's'}`,
    fix: waiting ? { label: 'Sort them', to: `/transactions?month=${month}&review=1` } : undefined,
  });

  const anyData = txs.length > 0 || open.some((a) => a.state !== 'missing');
  const failing = checks.filter((c) => c.state === 'fail' || c.state === 'warn' || c.state === 'unknown');
  const state: MonthState = !anyData ? 'empty' : inProgress ? 'in-progress' : missing.length ? 'missing' : failing.length ? 'checks' : 'done';
  const summary = state === 'done' ? 'All statements in and checked'
    : state === 'in-progress' ? `In progress: ${open.length - missing.length} of ${open.length} accounts in so far`
    : state === 'missing' ? `${missing.length} statement${missing.length === 1 ? '' : 's'} missing`
    : state === 'checks' ? `All statements in, ${failing.length} check${failing.length === 1 ? '' : 's'} to look at`
    : 'Nothing added yet';
  return { month, state, accounts, checks, missing, summary };
}
