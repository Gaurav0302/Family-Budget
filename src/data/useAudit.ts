import { useMemo } from 'react';
import { addMonths, allMonths } from './analysis';
import { auditMonth, type MonthAudit } from './audit';
import { useStore } from './store';

const thisMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);

/** Every month from the first transaction to this one, each with its statements checklist. */
export function useAudits(): { months: string[]; audits: Map<string, MonthAudit>; lastFinished: string } {
  const { data } = useStore();
  return useMemo(() => {
    const have = allMonths(data.transactions);
    const now = thisMonth();
    const months: string[] = [];
    for (let m = have[0] ?? now; m <= now; m = addMonths(m, 1)) months.push(m);
    const audits = new Map(months.map((m) => [m, auditMonth(data, m)]));
    return { months, audits, lastFinished: addMonths(now, -1) };
  }, [data]);
}
