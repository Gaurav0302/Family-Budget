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

describe('split payments', () => {
  it('counts each part in its own category and keeps the bank payment whole', async () => {
    const { summarise, withSplits, splitAddsUp } = await import('./analysis');
    const { DEFAULT_SETTINGS } = await import('./defaults');
    const tx = { id: 'a:2026-06-15:-6176.40:1', date: '2026-06-15', account: 'a', description: 'PAYPAL', amount: -6176.4, category: 'other', kind: 'spend' as const };
    const parts = [{ amount: -5000, category: 'travel' }, { amount: -1176.4, category: 'shopping', note: 'Desk' }];
    expect(splitAddsUp(tx.amount, parts)).toBe(true);
    expect(splitAddsUp(tx.amount, parts.slice(0, 1))).toBe(false);
    const settings = { ...DEFAULT_SETTINGS, splits: { [tx.id]: parts } };
    expect(withSplits([tx], settings.splits).map((t) => t.id)).toEqual([`${tx.id}#1`, `${tx.id}#2`]);
    const s = summarise('2026-06', { transactions: [tx], coverage: [], settings });
    expect(s.byCategory.travel).toBe(5000);
    expect(s.byCategory.shopping).toBeCloseTo(1176.4);
    expect(s.byCategory.other).toBeUndefined();
    expect(s.spend).toBeCloseTo(6176.4);
    expect(s.count).toBe(1);
  });
});

describe('the 50/30/20 guide colours', () => {
  it('treats needs and wants as ceilings and kept as a floor', async () => {
    const { tone, toneWords } = await import('./guide');
    expect(tone('needs', 0.29)).toBe('good');
    expect(tone('needs', 0.55)).toBe('warn');
    expect(tone('needs', 0.65)).toBe('bad');
    expect(tone('wants', 0.37)).toBe('warn');
    expect(tone('wants', 0.45)).toBe('bad');
    expect(tone('kept', 0.33)).toBe('good');
    expect(tone('kept', 0.15)).toBe('warn');
    expect(tone('kept', 0.05)).toBe('bad');
    expect(tone('needs', 0.29, false)).toBe('partial');
    expect(toneWords('wants', 6903 / 18585, 18585)).toBe('$1,328 over the 30% guide');
  });
});
