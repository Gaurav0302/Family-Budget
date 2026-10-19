import { describe, expect, it } from 'vitest';
import { addActivity } from './adapters/adapter';
import { describeSettings } from './activity';

describe('who changed what', () => {
  it('keeps one line for the same change by the same person within ten minutes', () => {
    let list = addActivity([], { at: '2026-10-20T08:00:00Z', by: 'a', what: 'Changed bills' });
    list = addActivity(list, { at: '2026-10-20T08:05:00Z', by: 'a', what: 'Changed bills' });
    expect(list).toEqual([{ at: '2026-10-20T08:05:00Z', by: 'a', what: 'Changed bills' }]);
    list = addActivity(list, { at: '2026-10-20T08:06:00Z', by: 'b', what: 'Changed bills' });
    list = addActivity(list, { at: '2026-10-20T08:30:00Z', by: 'b', what: 'Changed bills' });
    expect(list.length).toBe(3);
  });
  it('describes settings in plain words and leaves out personal ones', () => {
    expect(describeSettings({ bills: [], goals: [] })).toBe('Changed bills, goals');
    expect(describeSettings({ looks: {} })).toBeNull();
  });
});
