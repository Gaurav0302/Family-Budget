/** What a transaction does to the family's money. */
export type Kind =
  | 'spend'     // money going out to buy something (refunds come back as positive spend rows)
  | 'income'    // pay, interest, other money earned
  | 'transfer'  // moving money between the family's own accounts — never counted as spending
  | 'invest';   // shares (Spaceship) — counts as money kept, not spent

export type NeedWant = 'need' | 'want';

export interface Category {
  id: string;
  label: string;
  group: string;
  /** Needs vs wants, for the 50/30/20 check. */
  type: NeedWant;
  /** One short line on what goes here. */
  hint?: string;
  /** Not a spending category (income, transfers, investing). */
  system?: boolean;
  /** Money kept on purpose (savings, offset, shares, uni funds): budgeted, but not spending. */
  keep?: boolean;
  /** Added by the family in Settings. */
  custom?: boolean;
}

export interface Transaction {
  /** Stable id: account + date + amount + nth occurrence, so the same item from a PDF and a CSV matches. */
  id: string;
  date: string;          // YYYY-MM-DD
  account: string;       // account key, e.g. 'g-salary'
  description: string;
  amount: number;        // negative = out, positive = in
  category: string | null;
  kind: Kind | null;
  note?: string | null;
  oneOff?: boolean;      // a one-off that shouldn't distort trends
  manual?: boolean;      // category chosen by a person — rules never overwrite it
  needsReview?: boolean; // the app wasn't sure; shows in "Needs your input"
  source?: string | null;
}

/** Someone the family pays (or is paid by). Every transaction belongs to one, worked out from the bank's wording. */
export interface Payee {
  id: string;
  name: string;
  category: string;
  kind: Kind;
  /** Short merchant names this payee covers (as the app reads them from bank descriptions). */
  match: string[];
  /** Extra "description contains" texts, tried first. */
  patterns?: string[];
  /** Purpose varies (e.g. money sent overseas): every new payment waits for a person to sort it. */
  askEachTime?: boolean;
  /** A person has looked at this payee's category. */
  checked?: boolean;
  notes?: string;
}

export interface Rule {
  id: string;
  /** Case-insensitive text or regular expression matched against the description. */
  pattern: string;
  category: string;
  kind: Kind;
  /** Only money in ('in') or out ('out'). */
  sign?: 'in' | 'out';
  account?: string;
  /** Rules people add are tried before the built-in ones. */
  user?: boolean;
}

export interface BudgetLine {
  category: string;
  amount: number;        // per month
  from: string;          // YYYY-MM — applies from this month until a later line replaces it
}

export interface Coverage {
  account: string;
  from: string;          // YYYY-MM-DD
  to: string;            // YYYY-MM-DD
}

export interface Account {
  key: string;
  name: string;
  owner: string;          // a person's name, or 'Joint'
  type: 'everyday' | 'savings' | 'card' | 'paypal' | 'loan' | 'offset';
  /** Accounts whose spending must be loaded for a month to count as complete. */
  core?: boolean;
  bank?: string;
  /** Last four digits, so statements and transfers tie to this account. Never the full number. */
  last4?: string;
  openedOn?: string;      // YYYY-MM-DD
  closedOn?: string;      // YYYY-MM-DD
  /** Where the money went when this account closed (another account key). */
  movedTo?: string;
}

export interface Balance { account: string; date: string; amount: number }

export interface UniFund { name: string; target: number; monthly: number; saved: number; year: number }

export interface Settings {
  household: string;
  people: string[];
  accounts: Account[];
  /** Expected take-home pay per month, for the zero-based budget. */
  expectedIncome: number;
  /** Credit card repayments dated before this are counted as spending (card items not loaded yet). */
  cardItemisedFrom: string;
  balances: Balance[];
  uniFunds: UniFund[];
  home: {
    /** e.g. the street address, shown on the Goals page. */
    name: string;
    settlement: string;
    repayment: number;
    loan: number;
    rate: number;
    leaseEnds: string;
    value: number;
    loanPlannerUrl: string;
    /** Money expected in the offset on day one (from the Loan Planner). */
    offsetStart?: number;
  };
  babySteps: Record<string, boolean>;
  /** Super going in each month for both of you (employer + salary sacrifice). */
  superMonthly: number;
  /** Gross pay per month for both of you, before tax. */
  grossMonthly: number;
  theme: 'auto' | 'light' | 'dark';
  /** Pay for each person; the latest entry on or before a month applies to that month. */
  pay?: PayEntry[];
  superBalances?: SuperBalance[];
  /** Things owned or owed besides cash and super (which are filled in automatically). */
  wealth?: WealthItem[];
  /** Regular bills added by hand (yearly rego, quarterly rates...). Bills seen in statements are found automatically. */
  bills?: Bill[];
  /** Actions agreed at the monthly money meeting. */
  actions?: Action[];
  customCategories?: Category[];
  hiddenCategories?: string[];
  /** Which version of the built-in rules last sorted the transactions. */
  rulesVersion?: number;
}

export type Every = 'week' | 'fortnight' | 'month' | 'quarter' | 'year';

export interface PayEntry {
  person: string;
  from: string;              // YYYY-MM
  grossYearly: number;       // before tax, without super
  takeHome: number;          // per pay
  every: Every;              // how often pay arrives
  superPct: number;          // employer super, e.g. 12
  salarySacrifice: number;   // extra into super per month, before tax
}

export interface SuperBalance { person: string; date: string; amount: number; fund?: string }

export interface WealthItem {
  id: string;
  name: string;
  kind: 'home' | 'shares' | 'crypto' | 'other' | 'loan' | 'debt';
  owner?: string;
  /** When it was bought or the debt started. Before this date it counts as zero; with no date the first value counts back to the start. */
  ownedSince?: string;
  /** Sold or paid off: counts as zero from this date. */
  endedOn?: string;
  values: { date: string; amount: number }[];
}

export interface Bill { id: string; name: string; amount: number; every: Every; next: string; category: string }

export interface Action { id: string; month: string; text: string; done: boolean }

export interface Review {
  id: string;
  month: string;         // YYYY-MM
  title: string;
  body: string;          // simple markdown
  author: string;
  created: string;
}

export interface Data {
  transactions: Transaction[];
  rules: Rule[];
  budgets: BudgetLine[];
  coverage: Coverage[];
  settings: Settings;
  reviews: Review[];
  payees: Payee[];
}

/** The file format used for imports, backups and agent hand-offs. */
export interface DataFile {
  app: 'family-budget';
  version: 1;
  exported?: string;
  transactions?: Transaction[];
  coverage?: Coverage[];
  reviews?: Review[];
  budgets?: BudgetLine[];
  rules?: Rule[];
  settings?: Partial<Settings>;
  payees?: Payee[];
}
