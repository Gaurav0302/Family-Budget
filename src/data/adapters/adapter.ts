import type { BudgetLine, Coverage, Payee, Review, Rule, Settings, Transaction } from '../types';

export interface Loaded {
  transactions: Transaction[];
  rules: Rule[];
  budgets: BudgetLine[];
  coverage: Coverage[];
  settings: Settings | null;
  reviews: Review[];
  payees: Payee[];
}

/** Where the family's data is kept: Supabase (shared, every device) or this browser only (demo). */
export interface Adapter {
  kind: 'supabase' | 'local';
  load(): Promise<Loaded>;
  upsertTransactions(txs: Transaction[]): Promise<void>;
  deleteTransactions(ids: string[]): Promise<void>;
  upsertRules(rules: Rule[]): Promise<void>;
  deleteRule(id: string): Promise<void>;
  upsertBudgets(lines: BudgetLine[]): Promise<void>;
  replaceCoverage(list: Coverage[]): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  upsertReviews(r: Review[]): Promise<void>;
  deleteReview(id: string): Promise<void>;
  savePayees(p: Payee[]): Promise<void>;
}
