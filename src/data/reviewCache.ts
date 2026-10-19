import { reviewMonth, type ReviewResult } from './review';
import type { Data } from './types';

/** The month's review, worked out once per version of the data and shared by every page (Home, Review, Goals, the money
 *  meeting). Typing in a box or scrolling no longer recalculates it; any change to the data does. */
const cache = new WeakMap<Data, Map<string, ReviewResult>>();
export function reviewFor(data: Data, month: string): ReviewResult {
  let byMonth = cache.get(data);
  if (!byMonth) { byMonth = new Map(); cache.set(data, byMonth); }
  let r = byMonth.get(month);
  if (!r) { r = reviewMonth(data, month); byMonth.set(month, r); }
  return r;
}
