import { addMonths, completeMonths } from './analysis';
import type { MonthAudit } from './audit';
import { checkInsOf, propertiesOf } from './property';
import type { Data } from './types';
import { monthOnly, thisMonth } from '../lib/format';

export interface Todo { id: string; text: string; to: string; action: string; tone: 'bad' | 'warn' | 'info' }

/** The few things the family should do next, in order: get last month's statements in, sort what the app couldn't, hold
 *  the money meeting and check in the loan's balances. Home shows these as one short list. */
export function todosFor(data: Data, audits: Map<string, MonthAudit>): Todo[] {
  const out: Todo[] = [];
  const now = thisMonth(), last = addMonths(now, -1);
  const a = audits.get(last);
  if (a && a.state === 'missing') {
    const n = a.missing.length;
    out.push({ id: 'statements', tone: 'bad', to: '/statements?tab=add', action: 'Add statements',
      text: `Add ${monthOnly(last)}'s statements: ${n} account${n === 1 ? '' : 's'} still to come (${a.missing.slice(0, 3).map((m) => m.account.name.replace(/ \(.*\)$/, '')).join(', ')}${n > 3 ? '…' : ''}).` });
  }
  const toSort = data.transactions.filter((t) => t.needsReview).length;
  if (toSort) out.push({ id: 'sort', tone: 'warn', to: '/transactions?review=1', action: 'Sort them', text: `${toSort} payment${toSort === 1 ? '' : 's'} need${toSort === 1 ? 's' : ''} a category.` });
  const done = completeMonths(data).at(-1);
  if (done && !data.settings.meetings?.[done]) out.push({ id: 'meeting', tone: 'info', to: '/check-in', action: 'Start the meeting', text: `Hold the money meeting for ${monthOnly(done)}.` });
  // A loan that has started: its balances for last month, from the statements or typed in on Property.
  for (const p of propertiesOf(data.settings, data.budgets)) {
    const l = p.loan;
    if (!l?.firstRepayment || l.firstRepayment > last || p.soldOn) continue;
    if (!checkInsOf(data, p).some((c) => c.month === last)) out.push({ id: `checkin:${p.id}`, tone: 'info', to: `/property/${p.id}?tab=record&mode=balances`, action: 'Check in',
      text: `Check in ${p.name}'s loan and offset balances for the end of ${monthOnly(last)}.` });
  }
  return out;
}
