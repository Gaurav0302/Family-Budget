import { useMemo } from 'react';
import { forecast, story, type Basis } from './forecast';
import { activePlanOf, propertiesOf, runLoan, type LoanView } from './property';
import { useStore } from './store';
import type { Category, LoanPlan, Property, Settings } from './types';
import { lastDay, monthOf } from './analysis';
import type { Change } from '../loan';

/** Every property, and the one way to change them: the rest of the app reads from here. */
export function useProperties() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const list = useMemo(() => propertiesOf(s, data.budgets), [s, data.budgets]);
  const saveAll = (next: Property[]) => updateSettings({ properties: next });
  return {
    list,
    save: (p: Property) => saveAll(list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]),
    remove: (id: string) => {
      const p = list.find((x) => x.id === id);
      const area = p?.area;
      return updateSettings({
        properties: list.filter((x) => x.id !== id),
        ...(area ? { customGroups: (s.customGroups ?? []).filter((g) => g.id !== area) } : {}),
      });
    },
    /** A new property; an investment gets its own area of categories, so its costs stay apart from the family's. */
    add: (p: Property) => {
      if (p.use !== 'investment') return saveAll([...list, p]);
      const area = `prop-${p.id}`;
      const cats: Category[] = [['loan', 'loan repayments'], ['rates', 'rates & water'], ['insurance', 'insurance'], ['agent', 'agent fees'], ['repairs', 'repairs & upkeep']]
        .map(([k, l]) => ({ id: `${area}-${k}`, label: `${p.name}: ${l}`, group: area, type: 'need' as const }));
      return updateSettings({
        properties: [...list, { ...p, area }],
        customGroups: [...(s.customGroups ?? []), { id: area, label: p.name }],
        customCategories: [...(s.customCategories ?? []), ...cats],
      });
    },
  };
}

/** The forecast and its story, worked out once per change to the data. */
export function useForecast(basis: Basis = 'recent') {
  const { data } = useStore();
  return useMemo(() => { const f = forecast(data, { basis }); return { f, st: story(f) }; }, [data, basis]);
}

/** Money in the offset on day one: what the plan (or the loan) says; once statements reach past settlement, the real cash at the
 *  end of the settlement month; before that, what the forecast leaves after settlement; else cash today. */
export function offsetAtStart(p: Property, st: ReturnType<typeof story>, cashNow: number, plan?: LoanPlan, s?: Settings): number {
  const set = plan?.offsetStart ?? p.loan?.offsetStart;
  if (set !== undefined && set !== null) return set;
  if (p.use !== 'home') return 0;
  const real = s ? cashAfterSettlement(s, p) : null;
  if (real !== null) return real;
  return st.settlements.find((x) => x.property === p.name)?.after ?? cashNow;
}

/** Cash in the bank at the end of the settlement month, once every open account has a balance from then or later. */
export function cashAfterSettlement(s: Settings, p: Property): number | null {
  const end = lastDay(monthOf(p.settlement));
  const live = s.accounts.filter((a) => a.type !== 'loan' && (!a.closedOn || a.closedOn > end) && (!a.openedOn || a.openedOn <= end));
  if (!live.length || !live.every((a) => s.balances.some((b) => b.account === a.key && b.date >= end))) return null;
  let total = 0;
  for (const a of live) {
    const b = s.balances.filter((x) => x.account === a.key && x.date <= end).sort((x, y) => y.date.localeCompare(x.date))[0];
    if (b) total += b.amount;
  }
  return total;
}

/** A property's loan on a plan (the active one by default), with extra changes on top (a draft's new figures). */
export function useLoan(p: Property | undefined, plan?: LoanPlan, extra: Change[] = []): LoanView | null {
  const { data } = useStore();
  const { f, st } = useForecast();
  const key = JSON.stringify([plan, extra]);
  return useMemo(() => {
    if (!p) return null;
    const pl = plan ?? activePlanOf(p);
    return runLoan(data, p, { plan: pl, offsetStart: offsetAtStart(p, st, f.start.cash, pl, data.settings), changes: extra });
  }, [data, p, key, st, f]);
}
