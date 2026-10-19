import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { todosFor } from './todos';
import type { Data } from './types';

describe('the to-do list on Home', () => {
  it('asks for sorting and the money meeting, and stops asking once the meeting is held', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T09:00:00'));
    const data: Data = {
      transactions: [{ id: 'x', date: '2026-09-03', amount: -40, description: 'SHOP', account: 'a', category: 'other', kind: 'spend', needsReview: true }],
      coverage: [{ account: 'a', from: '2026-09-01', to: '2026-09-30' }], rules: [], budgets: [], reviews: [], payees: [],
      settings: { ...DEFAULT_SETTINGS, accounts: [{ key: 'a', name: 'Everyday', owner: 'A', type: 'everyday', core: true }] },
    };
    expect(todosFor(data, new Map()).map((t) => t.id)).toEqual(['sort', 'meeting']);
    const held = { ...data, settings: { ...data.settings, meetings: { '2026-09': { heldOn: '2026-10-05' } } } };
    expect(todosFor(held, new Map()).map((t) => t.id)).toEqual(['sort']);
    vi.useRealTimers();
  });
});
