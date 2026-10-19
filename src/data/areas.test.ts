import { describe, expect, it } from 'vitest';
import { inRange } from '../components/Chart';
import { applyCustomCategories, CATEGORY, GROUP_KEYS, GROUPS } from './categories';

describe('the family’s own areas', () => {
  it('adds an area, renames a built-in one and moves a category, without losing old names', () => {
    applyCustomCategories(
      [{ id: 'custom-permits', label: 'Permits', group: 'area-civic', type: 'need' }], [],
      { customGroups: [{ id: 'area-civic', label: 'Civic' }], groupNames: { Travel: 'Holidays' }, categoryEdits: { 'gov-fees': { group: 'area-civic', label: 'Official fees' } } },
    );
    expect(GROUPS).toContain('Civic');
    expect(GROUPS).toContain('Holidays');
    expect(GROUPS.at(-1)).toBe('Other');
    expect(GROUP_KEYS[GROUPS.indexOf('Holidays')]).toBe('Travel');
    expect(CATEGORY['custom-permits'].group).toBe('Civic');
    expect(CATEGORY['gov-fees']).toMatchObject({ label: 'Official fees', group: 'Civic', groupKey: 'area-civic' });
    expect(CATEGORY.travel.group).toBe('Holidays');
    applyCustomCategories([], [], {});
    expect(GROUPS).not.toContain('Civic');
    expect(CATEGORY['gov-fees'].group).toBe('Government');
  });
});

describe('chart time spans', () => {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  it('counts back from the latest month', () => {
    expect(inRange(months, '3m')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(inRange(months, '6m')).toHaveLength(6);
    expect(inRange(months, 'fy')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(inRange(months, 'all')).toHaveLength(11);
  });
});
