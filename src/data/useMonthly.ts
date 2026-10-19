import { useMemo } from 'react';
import { allMonths, budgetFor, summarise, type MonthSummary } from './analysis';
import { useStore } from './store';
import type { BudgetLine } from './types';

/** Every month with transactions, its totals, and which months are missing an account. */
export function useMonthly() {
  const { data } = useStore();
  return useMemo(() => {
    const months = allMonths(data.transactions);
    const sums = months.map((m) => summarise(m, data));
    const partial = new Set(sums.filter((s) => !s.complete).map((s) => s.month));
    return { months, sums, partial };
  }, [data]);
}

/** Spending in a set of categories, month by month. */
export const spendOf = (sums: MonthSummary[], ids: string[]) => sums.map((s) => ids.reduce((a, c) => a + (s.byCategory[c] ?? 0), 0));
/** Their budget, month by month. */
export const budgetOf = (budgets: BudgetLine[], months: string[], ids: string[]) => months.map((m) => ids.reduce((a, c) => a + budgetFor(budgets, c, m), 0));
