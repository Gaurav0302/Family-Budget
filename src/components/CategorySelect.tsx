import { CATEGORIES, CATEGORY, GROUPS, SPEND_CATEGORIES } from '../data/categories';

/** Pick a category. Hidden categories aren't offered, except the one already chosen. */
export function CategorySelect({ value, onChange, id, label = 'Category', small }: {
  value: string; onChange: (v: string) => void; id?: string; label?: string; small?: boolean;
}) {
  const shown = new Set([...SPEND_CATEGORIES.map((c) => c.id), ...CATEGORIES.filter((c) => c.system && !c.keep).map((c) => c.id), value]);
  const groups = [...GROUPS, 'Money in', 'Moving money', 'Investing'];
  return (
    <select id={id} aria-label={label} className={small ? 'select-small' : ''} value={value} onChange={(e) => onChange(e.target.value)}>
      {!CATEGORY[value] && <option value={value}>Not sorted</option>}
      {groups.map((g) => {
        const cats = CATEGORIES.filter((c) => c.group === g && shown.has(c.id));
        return cats.length ? <optgroup key={g} label={g}>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup> : null;
      })}
    </select>
  );
}
