import type { Change, Lump } from '../loan/types';
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
  /** The area's key (built-in name or custom id); `group` is its display name. Set when categories are applied. */
  groupKey?: string;
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
  /** Set on the parts of a split payment (worked out from settings.splits, never saved): the id of the bank payment. */
  splitOf?: string;
}

/** One part of a payment the family divided between categories. Parts add up to the payment. */
export interface SplitPart { amount: number; category: string; note?: string }

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

/** A statement's own opening and closing balance, so the app can prove every transaction in it was read. */
export interface StatementBalance { account: string; from: string; to: string; opening: number; closing: number }

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

export interface UniFund {
  name: string;
  /** Goal for when uni starts (0 = no goal yet). */
  target: number;
  monthly: number;
  /** Saved so far, as at `savedOn` (money put aside under "University funds" after that date is added on). */
  saved: number;
  savedOn?: string;
  /** Year uni starts. */
  year: number;
  /** Month saving starts (YYYY-MM). Defaults to the first month the budget gives the funds money. */
  start?: string;
  /** Kept in the offset, where it earns the loan rate by cancelling interest (default yes). Superseded by settings `uniPlan`. */
  inOffset?: boolean;
  /** The monthly saving changing from a month on, or for a while ("until" is the last month). */
  changes?: { id: string; month: string; until?: string; monthly: number }[];
  /** The fund's real balance at the end of a month. */
  checkIns?: { month: string; amount: number }[];
}

/** How the uni funds are kept, for all children. */
export interface UniPlan {
  /** In the offset (earns the loan rate by cancelling interest) or invested elsewhere. */
  inOffset: boolean;
  /** Return a year after fees and tax when invested elsewhere, in percent. */
  returnPct: number;
  /** Years at uni; each fund is drawn evenly over them. */
  years: number;
}

/** A way of paying the loan down. One is active; the others are for comparing. What really happened (the loan's
 *  `changes` and `lumps`) applies to every plan; each plan keeps its own guesses about the future. */
export interface LoanPlan {
  id: string;
  name: string;
  color: string;
  /** Guesses: rate moves, more or less into the offset, a year on one income… (Loan Planner format). */
  changes: Change[];
  lumps: Lump[];
  /** Money in the offset on day one. Blank: what the forecast leaves after settlement. */
  offsetStart?: number;
  /** Put all spare money into the offset. */
  sweep?: boolean;
  /** Into the offset each month while this plan isn't active (the active plan uses the Budget's "Savings & offset" line). */
  extra?: number;
  /** A yearly bonus into the offset, and the month it's paid (1–12). */
  bonus?: number;
  bonusMonth?: number;
  /** Pay, living costs and the extra all rising this much a year, in percent. */
  growth?: number;
  editedAt: string;
}

/** Money paid to buy a property: deposit, stamp duty, legal fees… */
export interface PropertyCost {
  id: string;
  label: string;
  amount: number;
  /** When it was paid or is due (YYYY-MM-DD). */
  date: string;
  /** Account it comes from, if known: tells the forecast whether bank balances already include it. */
  account?: string;
}

/** A regular cost of owning a property (rates, water, insurance, strata, agent fees, repairs). */
export interface RunningCost { id: string; label: string; amount: number; every: Every }

export interface PropertyLoan {
  amount: number;
  /** Interest rate when the loan starts, in percent. */
  rate: number;
  /** Years. */
  term: number;
  /** Month of the first repayment (YYYY-MM). */
  firstRepayment: string;
  /** The bank's monthly repayment, when known. Otherwise worked out from the amount, rate and term. */
  repayment?: number;
  /** Money in the offset on day one. Blank: whatever the forecast says is left after settlement. */
  offsetStart?: number;
  /** Put everything left over each month into the offset (default yes). */
  sweep?: boolean;
  /** A fixed extra into the offset each month, when not sweeping. */
  extra?: number;
  /** Accounts that hold the loan and its offset, so real balances replace the projection. */
  loanAccount?: string;
  offsetAccount?: string;
  /** What really happened: rate changes (with what the bank did), changes to what goes into the offset, lump sums.
   *  These apply to every plan (Loan Planner's "recorded" facts). */
  changes?: Change[];
  lumps?: Lump[];
  plans?: LoanPlan[];
  activePlan?: string;
  /** Month-end balances typed in on Record (statements for the loan and offset accounts fill these in automatically). */
  checkIns?: { month: string; loan: number; offset: number }[];
}

/** A property the family owns or is buying: everything about it lives here, and every page reads it from here. */
export interface Property {
  id: string;
  name: string;
  use: 'home' | 'investment';
  owners?: string[];
  price: number;
  contractDate?: string;
  /** Settlement date (YYYY-MM-DD): from then it's owned, the loan starts, and its costs begin. */
  settlement: string;
  /** Latest estimate of what it's worth (history lives in net worth). */
  value?: number;
  costs: PropertyCost[];
  loan?: PropertyLoan;
  running: RunningCost[];
  /** Rent received (investment): per week, from a date, less a few weeks empty a year. */
  rent?: { weekly: number; from: string; emptyWeeks?: number };
  /** Area holding this property's own categories (investment), so its costs aren't counted twice. */
  area?: string;
  /** Sold on (YYYY-MM-DD). */
  soldOn?: string;
  /** Net worth items this property replaces (its value and loan were added by hand before properties existed). */
  wealthIds?: string[];
  /** Settlement checklist: which steps are done (by step id). */
  checklist?: Record<string, boolean>;
}

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
  /** How often each budget line is paid (default each month), and a month it's due for quarterly, term and yearly lines.
   *  The budget amount itself stays the monthly equivalent, so totals add up. */
  budgetEvery?: Record<string, { every: Every; due?: string }>;
  uniPlan?: UniPlan;
  /** Properties owned or being bought. When empty, the old `home` details stand in for the family home. */
  properties?: Property[];
  babySteps: Record<string, boolean>;
  /** Super going in each month for both of you (employer + salary sacrifice). */
  superMonthly: number;
  /** Gross pay per month for both of you, before tax. */
  grossMonthly: number;
  theme: 'auto' | 'light' | 'dark';
  /** Opening and closing balances of each statement added (for the Statements checks). */
  statements?: StatementBalance[];
  /** Payments divided into parts, by transaction id. */
  splits?: Record<string, SplitPart[]>;
  /** Each person's own theme and light/dark choice, by sign-in email. */
  looks?: Record<string, { theme: string; mode: 'auto' | 'light' | 'dark' }>;
  /** Pay for each person; the latest entry on or before a month applies to that month. */
  pay?: PayEntry[];
  superBalances?: SuperBalance[];
  /** Things owned or owed besides cash and super (which are filled in automatically). */
  wealth?: WealthItem[];
  /** Regular bills added by hand (yearly rego, quarterly rates...). Bills seen in statements are found automatically. */
  bills?: Bill[];
  /** Actions agreed at the monthly money meeting. */
  actions?: Action[];
  /** The family's own savings goals (a car, a holiday, a trip): target, saved so far, and when it's wanted by (YYYY-MM). */
  goals?: { id: string; name: string; target: number; saved: number; by?: string }[];
  /** Debts other than the home loan, for baby step 2 (paid smallest first). Balance owed, yearly rate %, minimum a month. */
  debts?: { id: string; name: string; balance: number; rate?: number; minimum?: number }[];
  /** Money meetings held, by the month they reviewed (YYYY-MM): when, and who pressed "We've had this meeting". */
  meetings?: Record<string, { heldOn: string; by?: string }>;
  customCategories?: Category[];
  hiddenCategories?: string[];
  /** The family's own areas (groups of categories). */
  customGroups?: { id: string; label: string }[];
  /** New names for areas, by area key. */
  groupNames?: Record<string, string>;
  /** Renames, moves to another area, and need/want changes for built-in categories. */
  categoryEdits?: Record<string, { label?: string; group?: string; type?: NeedWant }>;
  /** Which version of the built-in rules last sorted the transactions. */
  rulesVersion?: number;
}

/** How often something is paid. A school term is counted like a quarter (four a year), due January, April, July and October. */
export type Every = 'week' | 'fortnight' | 'month' | 'term' | 'quarter' | 'year';

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
