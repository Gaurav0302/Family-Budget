/** A calendar month written as "YYYY-MM". */
export type YM = string;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Months since year 0, so months can be compared and subtracted. */
export function toIdx(ym: YM): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function toYM(idx: number): YM {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function addMonths(ym: YM, n: number): YM {
  return toYM(toIdx(ym) + n);
}

/** "Mar 2027" */
export function monthLabel(idx: number): string {
  return `${SHORT[idx % 12]} ${Math.floor(idx / 12)}`;
}

/** "March 2027" */
export function monthLabelLong(idx: number): string {
  return `${LONG[idx % 12]} ${Math.floor(idx / 12)}`;
}

/** "July", for a 1-based month number. */
export function monthName(month1: number): string {
  return LONG[month1 - 1];
}
