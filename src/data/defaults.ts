import type { BudgetLine, Settings } from './types';

/** Generic starting point. The family's own accounts, budget and rules arrive in their private data file,
 *  so nothing personal lives in this public code. */
export const DEFAULT_SETTINGS: Settings = {
  household: 'Our family',
  people: [],
  accounts: [],
  expectedIncome: 0,
  cardItemisedFrom: '2000-01-01',
  balances: [],
  uniFunds: [],
  home: { name: '', settlement: '', repayment: 0, loan: 0, rate: 0, leaseEnds: '', value: 0, loanPlannerUrl: '' },
  babySteps: {},
  superMonthly: 0,
  grossMonthly: 0,
  theme: 'auto',
};

export const DEFAULT_BUDGETS: BudgetLine[] = [];
