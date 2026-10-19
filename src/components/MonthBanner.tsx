import { AlertTriangle, CircleCheck, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAudits } from '../data/useAudit';
import { monthOnly } from '../lib/format';

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more`);

/** One line saying whether a month has everything in. Quiet when it does; clear about what's missing when it doesn't.
 *  `nudge` words it as a to-do ("Time to add October's statements"). */
export function MonthBanner({ month, nudge = false, showDone = false }: { month: string; nudge?: boolean; showDone?: boolean }) {
  const { audits } = useAudits();
  const a = audits.get(month);
  if (!a || a.state === 'empty' || (a.state === 'done' && !showDone)) return null;
  const name = monthOnly(month);
  const need = a.missing.map((m) => m.account.name.replace(/ \(.*\)$/, ''));
  const todo = a.checks.filter((c) => c.state !== 'ok' && c.id !== 'statements');
  let tone = 'warn', Icon = AlertTriangle, text = '';
  if (a.state === 'done') { tone = 'good'; Icon = CircleCheck; text = `${name}: every statement is in and the numbers check out.`; }
  else if (a.state === 'in-progress') { tone = 'info'; Icon = Clock; text = `${name} is still going: ${a.accounts.filter((x) => x.state === 'full').length} of ${a.accounts.filter((x) => x.state !== 'closed').length} accounts in so far.`; }
  else if (a.state === 'missing') { tone = 'bad'; text = nudge ? `Time to add ${name}'s statements. Still need: ${list(need)}.` : `${name} isn't complete: ${list(need)} ${need.length === 1 ? 'is' : 'are'} missing, so these numbers are a draft.`; }
  else { const t = todo.map((c) => c.todo ?? c.title.toLowerCase()); text = `${name}: all statements are in. To finish: ${t.join(', ')}.`; }
  return (
    <div className={`month-banner tone-${tone} no-print`} role="status">
      <Icon size={18} aria-hidden />
      <span>{text}</span>
      <Link to={`/statements?month=${month}`}>{a.state === 'done' ? 'See the checks' : 'See what’s needed'}</Link>
    </div>
  );
}
