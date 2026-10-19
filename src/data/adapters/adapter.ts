import type { Activity, BudgetLine, Coverage, Payee, Review, Rule, Settings, Transaction } from '../types';

export interface Loaded {
  transactions: Transaction[];
  rules: Rule[];
  budgets: BudgetLine[];
  coverage: Coverage[];
  settings: Settings | null;
  reviews: Review[];
  payees: Payee[];
  /** Who changed what, newest first. */
  activity?: Activity[];
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
  saveSettings(s: Settings, patch?: Partial<Settings>, rebuild?: (latest: Settings) => Partial<Settings>): Promise<Settings>;
  // `rebuild`: for maps two people edit at once (tax marks, meeting questions), works the change out again on the latest copy.
  upsertReviews(r: Review[]): Promise<void>;
  deleteReview(id: string): Promise<void>;
  /** Save the payee list. With `base` (the list this change started from), payees changed meanwhile by someone else are kept
   *  and only this change's additions, edits and removals are applied. Returns what was stored. */
  savePayees(p: Payee[], base?: Payee[]): Promise<Payee[]>;
  /** Add to the record of who changed what (newest first). The same change by the same person within 10 minutes is one line. */
  logActivity(a: Activity): Promise<Activity[]>;
}

/** The newest first, the same person's same change within 10 minutes kept as one line, the last 300. */
export function addActivity(list: Activity[], a: Activity): Activity[] {
  const top = list[0];
  if (top && top.by === a.by && top.what === a.what && Date.parse(a.at) - Date.parse(top.at) < 10 * 60e3) return [{ ...top, at: a.at }, ...list.slice(1)];
  return [a, ...list].slice(0, 300);
}
