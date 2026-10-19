import { withSplits } from './analysis';
import type { Data, TaxKind, Transaction } from './types';

export const TAX_KINDS: { id: TaxKind; label: string; hint: string }[] = [
  { id: 'work', label: 'Work-related expense', hint: 'Tools, uniforms, work phone or internet share, travel between work sites' },
  { id: 'self-education', label: 'Self-education', hint: 'Courses and books tied to your current job' },
  { id: 'donation', label: 'Donation', hint: '$2 or more to a registered charity (DGR), with a receipt' },
  { id: 'income-protection', label: 'Income protection insurance', hint: 'Only the income protection part, not life cover' },
  { id: 'tax-agent', label: 'Tax agent or accountant fees', hint: 'Claimed in the year you pay them' },
  { id: 'other', label: 'Other deduction', hint: 'Anything else your accountant should look at' },
];
export const TAX_LABEL = Object.fromEntries(TAX_KINDS.map((k) => [k.id, k.label])) as Record<TaxKind, string>;

/** Categories that are usually deductible on their own, so they're listed even when no payment is marked. */
const AUTO: Partial<Record<string, TaxKind>> = { donations: 'donation', accountant: 'tax-agent' };

export interface TaxLine { tx: Transaction; kind: TaxKind; person: string; amount: number; marked: boolean }

/** Every payment for tax time in a financial year ("2026-27"): the ones marked by hand, plus donations and accountant fees.
 *  Whose it is: as marked, else the account's owner, else "Joint". */
export function taxLines(data: Pick<Data, 'transactions' | 'settings'>, fy: string): TaxLine[] {
  const start = `${fy.slice(0, 4)}-07-01`, end = `${Number(fy.slice(0, 4)) + 1}-06-30`;
  const owner = new Map(data.settings.accounts.map((a) => [a.key, a.owner]));
  const tags = data.settings.taxTags ?? {};
  const out: TaxLine[] = [];
  for (const t of withSplits(data.transactions, data.settings.splits)) {
    if (t.date < start || t.date > end || t.amount >= 0) continue;
    // A mark is on the bank payment; for a split payment it covers the part chosen (or every part: the whole payment).
    const raw = tags[t.splitOf ?? t.id];
    const tag = raw && t.splitOf && raw.part && t.id !== `${t.splitOf}#${raw.part}` ? undefined : raw;
    const kind = tag?.kind ?? (t.category ? AUTO[t.category] : undefined);
    if (!kind) continue;
    out.push({ tx: t, kind, person: tag?.person || owner.get(t.account) || 'Joint', amount: -t.amount, marked: !!tag });
  }
  return out.sort((a, b) => a.person.localeCompare(b.person) || a.kind.localeCompare(b.kind) || a.tx.date.localeCompare(b.tx.date));
}

/** Totals by person and kind. */
export function taxTotals(lines: TaxLine[]) {
  const by = new Map<string, Map<TaxKind, number>>();
  for (const l of lines) {
    const p = by.get(l.person) ?? new Map<TaxKind, number>();
    p.set(l.kind, (p.get(l.kind) ?? 0) + l.amount);
    by.set(l.person, p);
  }
  return by;
}
