import { DEFAULT_SETTINGS } from './defaults';
import type { Settings } from './types';

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || v === 0 || (Array.isArray(v) && !v.length)
  || (typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(isEmpty));

/** For items the family already has, fill in only the fields that are still empty. */
function fill<T extends object>(cur: T, inc: T): T {
  const out: any = { ...cur };
  for (const [k, v] of Object.entries(inc)) if (isEmpty((cur as any)[k])) out[k] = v;
  return out;
}

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
        return inc ? { ...fill(w, inc), values: union(w.values, inc.values, (x) => x.date) } : w;
      });
    }
    else if (k === 'properties') out.properties = union(current.properties, v as Settings['properties'], (p) => p.id).map((p) => {
      const inc = (v as Settings['properties'])!.find((x) => x.id === p.id);
      if (!inc || inc === p) return p;
      const f = fill(p, inc);
      return { ...f, costs: union(p.costs, inc.costs, (c) => c.id), running: union(p.running, inc.running, (c) => c.id),
        loan: p.loan && inc.loan ? { ...fill(p.loan, inc.loan), changes: union(p.loan.changes, inc.loan.changes, (c) => c.id), lumps: union(p.loan.lumps, inc.loan.lumps, (c) => c.id) } : (p.loan ?? inc.loan) };
    });
    else if (k === 'uniFunds') out.uniFunds = union(current.uniFunds, v, (f) => f.name).map((f) => {
      const inc = (v as Settings['uniFunds']).find((x) => x.name === f.name);
      return inc ? fill(f, inc) : f;
    });
    else if (k === 'bills') out.bills = union(current.bills, v, (b) => b.id);
    else if (k === 'actions') out.actions = union(current.actions, v, (a) => a.id);
    else if (k === 'customCategories') out.customCategories = union(current.customCategories, v, (c) => c.id);
    else if (k === 'statements') out.statements = union(current.statements, v, (b) => `${b.account}|${b.from}|${b.to}`);
    else if (k === 'customGroups') out.customGroups = union(current.customGroups, v, (g) => g.id);
    else if (k === 'groupNames' || k === 'categoryEdits' || k === 'looks') out[k] = { ...v, ...(cur ?? {}) };
    else if (k === 'hiddenCategories') out.hiddenCategories = [...new Set([...(current.hiddenCategories ?? []), ...v])];
    else if (k === 'accounts') out.accounts = union(current.accounts, v, (a) => a.key).map((a) => {
      const inc = (v as Settings['accounts']).find((x) => x.key === a.key);
      return inc ? fill(a, inc) : a;
    });
    else if (k === 'home') out.home = Object.fromEntries(Object.entries({ ...v, ...current.home }).map(([hk, hv]) =>
      [hk, isEmpty((current.home as any)[hk]) ? (v as any)[hk] ?? hv : hv]));
    else if (k === 'cardItemisedFrom') out.cardItemisedFrom = cur === DEFAULT_SETTINGS.cardItemisedFrom ? v : (v > cur ? v : cur);
    else if (isEmpty(cur) || cur === (DEFAULT_SETTINGS as any)[k]) out[k] = v;
  }
  return out;
}
