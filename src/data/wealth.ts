import { monthOf } from './analysis';
import type { Data, Every, PayEntry, Settings, Transaction } from './types';

export const PER_MONTH: Record<Every, number> = { week: 52 / 12, fortnight: 26 / 12, month: 1, quarter: 1 / 3, year: 1 / 12 };
export const PER_YEAR: Record<Every, number> = { week: 52, fortnight: 26, month: 12, quarter: 4, year: 1 };

export function people(s: Settings): string[] {
  const fromPay = (s.pay ?? []).map((p) => p.person);
  return [...new Set([...fromPay, ...s.accounts.map((a) => a.owner).filter(Boolean)])];
}

/** The pay that applies to a person in a month: their latest entry on or before it. */
export function payFor(s: Settings, person: string, month: string): PayEntry | undefined {
  let best: PayEntry | undefined;
  for (const p of s.pay ?? []) if (p.person === person && p.from <= month && (!best || p.from > best.from)) best = p;
  return best;
}

export function earners(s: Settings, month: string): PayEntry[] {
  return [...new Set((s.pay ?? []).map((p) => p.person))].map((n) => payFor(s, n, month)).filter((p): p is PayEntry => !!p);
}

/** Take-home pay per month for the household. Falls back to the single figure typed on the Budget page. */
export function expectedIncome(s: Settings, month: string): number {
  const e = earners(s, month);
  return e.length ? e.reduce((a, p) => a + p.takeHome * PER_MONTH[p.every], 0) : s.expectedIncome;
}
export function grossMonthly(s: Settings, month: string): number {
  const e = earners(s, month);
  return e.length ? e.reduce((a, p) => a + p.grossYearly / 12, 0) : s.grossMonthly;
}
export function superMonthly(s: Settings, month: string): number {
  const e = earners(s, month);
  return e.length ? e.reduce((a, p) => a + (p.grossYearly / 12) * (p.superPct / 100) + p.salarySacrifice, 0) : s.superMonthly;
}

/** Before-tax ("concessional") super contribution caps by financial year (ATO). Later years use the latest known. */
const CAPS: [string, number][] = [['2024-25', 30000], ['2025-26', 30000], ['2026-27', 32500]];
export function financialYear(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
export function concessionalCap(fy: string): { cap: number; known: boolean } {
  const hit = CAPS.find(([f]) => f === fy);
  return hit ? { cap: hit[1], known: true } : { cap: CAPS[CAPS.length - 1][1], known: false };
}

/** Australian resident marginal tax rate (2026-27 rates; the lowest band falls to 15% from 1 July 2026). */
export function marginalRate(gross: number): number {
  if (gross > 190000) return 0.45;
  if (gross > 135000) return 0.37;
  if (gross > 45000) return 0.3;
  if (gross > 18200) return 0.15;
  return 0;
}

export interface SuperRoom { person: string; used: number; cap: number; room: number; capKnown: boolean; costPer1000: number; taxSavedPer1000: number }
export function superRoom(p: PayEntry, month: string): SuperRoom {
  const used = p.grossYearly * (p.superPct / 100) + p.salarySacrifice * 12;
  const { cap, known } = concessionalCap(financialYear(month));
  const rate = marginalRate(p.grossYearly) + 0.02;
  return { person: p.person, used, cap, room: Math.max(0, cap - used), capKnown: known,
    costPer1000: Math.round(1000 * (1 - rate)), taxSavedPer1000: Math.round(1000 * (rate - 0.15)) };
}

export function latestSuper(s: Settings, person: string, upTo = '9999-12-31') {
  return (s.superBalances ?? []).filter((b) => b.person === person && b.date <= upTo).sort((a, b) => b.date.localeCompare(a.date))[0];
}

const latestValue = (values: { date: string; amount: number }[], upTo: string) =>
  values.filter((v) => v.date <= upTo).sort((a, b) => b.date.localeCompare(a.date))[0];

export interface NetWorth { date: string; cash: number; super: number; assets: number; debts: number; total: number; parts: { name: string; amount: number; kind: string; date?: string }[] }

/** Everything owned minus everything owed, as known on a date. Cash comes from account balances, super from super balances. */
export function netWorth(s: Settings, date: string): NetWorth {
  const parts: NetWorth['parts'] = [];
  let cash = 0;
  for (const a of s.accounts) {
    if (a.type === 'loan') continue;
    const b = s.balances.filter((x) => x.account === a.key && x.date <= date).sort((x, y) => y.date.localeCompare(x.date))[0];
    if (b) { cash += b.amount; parts.push({ name: a.name, amount: b.amount, kind: 'cash', date: b.date }); }
  }
  let sup = 0;
  for (const p of people(s)) {
    const b = latestSuper(s, p, date);
    if (b) { sup += b.amount; parts.push({ name: `${p}'s super${b.fund ? ` (${b.fund})` : ''}`, amount: b.amount, kind: 'super', date: b.date }); }
  }
  let assets = 0, debts = 0;
  for (const w of s.wealth ?? []) {
    const v = latestValue(w.values, date);
    if (!v) continue;
    const debt = w.kind === 'loan' || w.kind === 'debt';
    if (debt) debts += v.amount; else assets += v.amount;
    parts.push({ name: w.name, amount: debt ? -v.amount : v.amount, kind: w.kind, date: v.date });
  }
  return { date, cash, super: sup, assets, debts, total: cash + sup + assets - debts, parts };
}

/** Net worth at each month end where anything was known. */
export function netWorthSeries(s: Settings, months: string[]) {
  return months.map((m) => {
    const [y, mo] = m.split('-').map(Number);
    const end = `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
    return { month: m, value: netWorth(s, end).total };
  }).filter((x) => x.value !== 0);
}

/** Has anyone's pay changed in the statements without the Income & super page being updated? */
export function payChanges(data: Pick<Data, 'transactions' | 'settings'>): { person: string; month: string; from: number; to: number }[] {
  const s = data.settings;
  const owner = new Map(s.accounts.map((a) => [a.key, a.owner]));
  const byPerson = new Map<string, Map<string, number>>();
  for (const t of data.transactions) {
    if (t.kind !== 'income' || t.category !== 'salary') continue;
    const p = owner.get(t.account);
    if (!p) continue;
    const m = monthOf(t.date);
    const months = byPerson.get(p) ?? new Map<string, number>();
    months.set(m, Math.max(months.get(m) ?? 0, t.amount));   // the main pay in the month
    byPerson.set(p, months);
  }
  const out: { person: string; month: string; from: number; to: number }[] = [];
  for (const [person, months] of byPerson) {
    const list = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // Ignore one-off months (bonuses, leave payouts): a change counts once it repeats.
    for (let i = list.length - 1; i >= 2; i--) {
      const [m, now] = list[i], [, prev] = list[i - 1], [, before] = list[i - 2];
      const same = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) < 0.01;
      if (same(now, prev) && !same(prev, before)) {
        const entry = payFor(s, person, m);
        if (!entry || !same(entry.takeHome, now)) out.push({ person, month: list[i - 1][0], from: before, to: now });
        break;
      }
    }
  }
  return out;
}

export const isSalary = (t: Transaction) => t.kind === 'income' && t.category === 'salary';
