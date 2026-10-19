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
  /** Save settings. With `patch` (the keys this change touched), a newer copy saved meanwhile by someone else is kept and only
   *  `patch` is applied on top of it. Returns what was stored (it differs from `s` when someone else's changes were merged in). */
  saveSettings(s: Settings, patch?: Partial<Settings>): Promise<Settings>;
  upsertReviews(r: Review[]): Promise<void>;
  deleteReview(id: string): Promise<void>;
  /** Save the payee list. With `base` (the list this change started from), payees changed meanwhile by someone else are kept
   *  and only this change's additions, edits and removals are applied. Returns what was stored. */
  savePayees(p: Payee[], base?: Payee[]): Promise<Payee[]>;
}
