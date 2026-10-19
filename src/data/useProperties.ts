import { useMemo } from 'react';
import { forecast, story, type Basis } from './forecast';
import { propertiesOf, runLoan, type LoanView } from './property';
import { useStore } from './store';
import type { Category, Data, Property } from './types';

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

/** Money in the offset on day one: what the family typed, else what the forecast leaves after settlement, else cash today. */
export function offsetAtStart(_data: Data, p: Property, st: ReturnType<typeof story>, cashNow: number): number {
  if (p.loan?.offsetStart !== undefined && p.loan.offsetStart !== null) return p.loan.offsetStart;
  if (p.use !== 'home') return 0;
  return st.settlements.find((x) => x.property === p.name)?.after ?? cashNow;
}

export function useLoan(p: Property | undefined): LoanView | null {
  const { data } = useStore();
  const { f, st } = useForecast();
  return useMemo(() => (p ? runLoan(data, p, { offsetStart: offsetAtStart(data, p, st, f.start.cash) }) : null), [data, p, st, f]);
}
