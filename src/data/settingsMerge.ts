import { DEFAULT_SETTINGS } from './defaults';
import type { Settings } from './types';

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || v === 0 || (Array.isArray(v) && !v.length)
  || (typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(isEmpty));

function union<T>(a: T[] = [], b: T[] = [], key: (x: T) => string): T[] {
  const map = new Map(a.map((x) => [key(x), x]));
  for (const x of b) if (!map.has(key(x))) map.set(key(x), x);
  return [...map.values()];
}

/** Bring settings from a data file into the app without overwriting anything the family already changed:
 *  lists are joined (no duplicates); single values are only filled in where the app still has its blank default. */
export function mergeSettings(current: Settings, incoming: Partial<Settings>): Settings {
  const out: any = { ...current };
  for (const [k, v] of Object.entries(incoming) as [keyof Settings, any][]) {
    const cur = (current as any)[k];
    if (k === 'balances') out.balances = union(current.balances, v, (b) => `${b.account}|${b.date}`);
    else if (k === 'pay') out.pay = union(current.pay, v, (p) => `${p.person}|${p.from}`);
    else if (k === 'superBalances') out.superBalances = union(current.superBalances, v, (b) => `${b.person}|${b.date}`);
    else if (k === 'wealth') {
      const merged = union(current.wealth, v as Settings['wealth'], (w) => w.id);
      out.wealth = merged.map((w) => {
        const inc = (v as Settings['wealth'])!.find((x) => x.id === w.id);
        return inc ? { ...w, values: union(w.values, inc.values, (x) => x.date) } : w;
      });
    }
    else if (k === 'bills') out.bills = union(current.bills, v, (b) => b.id);
    else if (k === 'actions') out.actions = union(current.actions, v, (a) => a.id);
    else if (k === 'customCategories') out.customCategories = union(current.customCategories, v, (c) => c.id);
    else if (k === 'hiddenCategories') out.hiddenCategories = [...new Set([...(current.hiddenCategories ?? []), ...v])];
    else if (k === 'accounts') out.accounts = union(current.accounts, v, (a) => a.key);
    else if (k === 'home') out.home = Object.fromEntries(Object.entries({ ...v, ...current.home }).map(([hk, hv]) =>
      [hk, isEmpty((current.home as any)[hk]) ? (v as any)[hk] ?? hv : hv]));
    else if (k === 'cardItemisedFrom') out.cardItemisedFrom = cur === DEFAULT_SETTINGS.cardItemisedFrom ? v : (v > cur ? v : cur);
    else if (isEmpty(cur) || cur === (DEFAULT_SETTINGS as any)[k]) out[k] = v;
  }
  return out;
}
