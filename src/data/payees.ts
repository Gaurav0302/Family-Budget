import { merchantOf } from './merchant';
import { categorise } from './rules';
import type { Kind, Payee, Rule, Settings, Transaction } from './types';

export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'payee';
const key = (s: string) => s.trim().toLowerCase();

export interface PayeeIndex { byMatch: Map<string, Payee>; withPatterns: Payee[]; byId: Map<string, Payee> }

export function indexPayees(payees: Payee[]): PayeeIndex {
  const byMatch = new Map<string, Payee>();
  for (const p of payees) for (const m of p.match) byMatch.set(key(m), p);
  return { byMatch, withPatterns: payees.filter((p) => p.patterns?.length), byId: new Map(payees.map((p) => [p.id, p])) };
}

/** Which payee a transaction belongs to: "description contains" texts first, then the short merchant name. */
export function findPayee(t: Pick<Transaction, 'description'>, idx: PayeeIndex): Payee | undefined {
  const d = t.description.toLowerCase();
  for (const p of idx.withPatterns) if (p.patterns!.some((x) => x.trim() && d.includes(x.trim().toLowerCase()))) return p;
  return idx.byMatch.get(key(merchantOf(t.description)));
}

export interface Sorted { category: string; kind: Kind; needsReview: boolean; payee?: Payee }

/** Sort a transaction: the payee list decides; the built-in rules only help with payees seen for the first time.
 *  `fresh` = just imported, so "ask me each time" payees wait for a person. */
export function sortTransaction(t: Transaction, idx: PayeeIndex, rules: Rule[], settings: Pick<Settings, 'cardItemisedFrom'>, fresh = false): Sorted {
  const payee = findPayee(t, idx);
  if (t.manual && t.category && t.kind) return { category: t.category, kind: t.kind, needsReview: false, payee };
  if (payee) {
    if (payee.category === 'card-payment' && t.amount < 0 && t.date < settings.cardItemisedFrom) return { category: 'card-unitemised', kind: 'spend', needsReview: false, payee };
    const unsure = payee.category === 'other' || payee.category === 'other-income';
    return { category: payee.category, kind: payee.kind, needsReview: unsure || (fresh && !!payee.askEachTime) || (!fresh && !!t.needsReview && !!payee.askEachTime), payee };
  }
  return categorise(t, rules, settings);
}

/** Make payees for transactions that don't have one yet, taking the category most of their transactions already have. */
export function payeesFor(txs: Transaction[], existing: Payee[]): Payee[] {
  const idx = indexPayees(existing);
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (findPayee(t, idx)) continue;
    const m = merchantOf(t.description);
    groups.set(key(m), [...(groups.get(key(m)) ?? []), t]);
  }
  const ids = new Set(existing.map((p) => p.id));
  const out: Payee[] = [];
  for (const [, list] of groups) {
    const name = merchantOf(list[0].description);
    const votes = new Map<string, number>();
    for (const t of list) {
      if (!t.category || !t.kind) continue;
      const k = `${t.category === 'card-unitemised' ? 'card-payment' : t.category}|${t.category === 'card-unitemised' ? 'transfer' : t.kind}`;
      votes.set(k, (votes.get(k) ?? 0) + (t.manual ? 3 : 1));
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (list[0].amount > 0 ? 'other-income|income' : 'other|spend');
    const [category, kind] = best.split('|') as [string, Kind];
    let id = `p-${slug(name)}`;
    for (let n = 2; ids.has(id); n++) id = `p-${slug(name)}-${n}`;
    ids.add(id);
    out.push({ id, name, category, kind, match: [name], checked: false });
  }
  return out;
}

/** Transactions grouped under their payee, for lists and drill-downs. */
export function groupByPayee(txs: Transaction[], idx: PayeeIndex) {
  const groups = new Map<string, { payee?: Payee; name: string; txs: Transaction[]; total: number }>();
  for (const t of txs) {
    const p = findPayee(t, idx);
    const k = p?.id ?? `?${merchantOf(t.description)}`;
    const g = groups.get(k) ?? { payee: p, name: p?.name ?? merchantOf(t.description), txs: [], total: 0 };
    g.txs.push(t); g.total += t.amount;
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => a.total - b.total);
}

export function kindForCategory(category: string): Kind {
  return ['salary', 'interest', 'other-income'].includes(category) ? 'income'
    : ['own-transfer', 'card-payment'].includes(category) ? 'transfer'
    : category === 'shares' ? 'invest' : 'spend';
}
