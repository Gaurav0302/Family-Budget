import type { YM } from './dates';

export interface Kid {
  name: string;
  /** Put aside each month from `start` until university starts. */
  monthly: number;
  start: YM;
  /** Year university starts; the fund is drawn from February of that year. */
  uni: number;
  /** Target value when university starts. 0 means no goal set. */
  goal: number;
}

/** How things stood when the loan started. All money is per month unless named otherwise. */
export interface Setup {
  loan: number;
  /** Annual interest rate, in percent. */
  rate: number;
  /** Years. */
  term: number;
  /** Month of the first repayment. */
  start: YM;
  offset0: number;
  inc1: number;
  inc2: number;
  living: number;
  sac1: number;
  sac2: number;
  /** Marginal tax rate in percent, used to cost salary sacrifice. */
  tax: number;
  /** Yearly growth of incomes, living costs and the extra amount, in percent. */
  growth: number;
  extra: number;
  /** Put the whole monthly surplus into the offset instead of `extra`. */
  sweep: boolean;
  /** Yearly bonus into the offset. */
  bonus: number;
  /** 1-based month the bonus is paid in. */
  bonusMonth: number;
  kids: Kid[];
  /** Keep the college funds inside the offset (they earn the loan rate by cancelling interest). */
  kidsInOffset: boolean;
  /** Return on college funds kept elsewhere, after fees and tax, in percent. */
  eduRate: number;
  /** Years at university; each fund is drawn evenly over them. */
  uniYears: number;
}

export type ChangeType = 'rate' | 'inc1' | 'inc2' | 'living' | 'extra' | 'bonus' | 'sweep' | `kid${number}`;

/**
 * From `month`, one setting takes a new value. Without `until` it stays until a later change;
 * with `until` it applies through that month and then the earlier value returns.
 */
export interface Change {
  id: string;
  month: YM;
  until?: YM;
  type: ChangeType;
  /** Rate in percent, money per month, bonus per year, or 1/0 for sweep. */
  value: number;
  /** Rate changes only: the repayment the bank set. Without it the repayment is recalculated on the remaining term. */
  repayment?: number;
  /** Rate changes only: keep paying this amount; anything above the bank's repayment goes into the offset. */
  keepPaying?: number;
}

export interface Lump {
  id: string;
  month: YM;
  amount: number;
}

/** Real balances at the end of a month, read off statements. */
export interface Anchor {
  month: YM;
  loan: number;
  /** Offset balance as the statement shows it, including any college money held there. */
  offset: number;
  kids: number[];
}

export interface SimOptions {
  /** false gives the bank's schedule: no offset, no extras, no college funds. Default true. */
  extras?: boolean;
  /** Months where costs exceed pay draw the gap from the offset. Default true. */
  drawShortfall?: boolean;
  /** Restart from real balances at the end of this month. */
  anchor?: Anchor;
}

export interface MonthPoint {
  /** Months since the first repayment, from 0. */
  m: number;
  idx: number;
  loan: number;
  /** Offset balance, not counting college money held in it. */
  offset: number;
  /** Loan minus offset; 0 once paid off. */
  net: number;
  kids: number[];
  rate: number;
  /** The bank's required repayment this month (0 once paid off). */
  repayment: number;
  /** What actually leaves your account for the loan: the repayment, or more if you kept paying a higher amount. */
  paidOut: number;
  interest: number;
  cumInterest: number;
  takeHome: number;
  living: number;
  kidsSaving: number;
  /** Extra that went into the offset this month. */
  extra: number;
  /** Take-home minus loan payment, living costs and college saving. Negative is a shortfall. */
  spare: number;
  /** Spare money that was not sent anywhere. */
  unallocated: number;
  /** Shortfall taken from the offset. */
  drawn: number;
  /** Shortfall the offset could not cover. */
  unfunded: number;
  /** Settings in effect this month, before growth. */
  settings: { extra: number; sweep: boolean; bonus: number; inc1: number; inc2: number; living: number; kidMonthly: number[] };
  loanActive: boolean;
}

export interface SimResult {
  points: MonthPoint[];
  startIdx: number;
  /** Months from the first repayment until the offset first matches the loan (or the full term). */
  paidMonth: number;
  paidIdx: number;
  totalInterest: number;
  termMonths: number;
  kidsAtUni: number[];
  kidsContributed: number[];
}
