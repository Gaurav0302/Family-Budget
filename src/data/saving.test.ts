import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from './types';

/** A tiny stand-in for the database's settings table: enough of supabase-js for loading and saving settings. */
const db = { rows: new Map<string, { value: any; updated_at: string }>(), fail: false, clock: 0 };
const stamp = () => `2026-10-19T00:00:00.${String(++db.clock).padStart(6, '0')}+00:00`;
function table(name: string) {
  const f: { col: string; val: any }[] = [];
  let op: 'select' | 'update' | 'insert' = 'select', patch: any = null;
  const run = () => {
    if (db.fail) return { data: null, error: { message: 'Network down' } };
    if (name !== 'settings') return { data: [], error: null };
    const match = [...db.rows].filter(([key, r]) => f.every((x) => (x.col === 'household_id' ? x.val === 'h1' : x.col === 'key' ? key === x.val : (r as any)[x.col] === x.val)));
    if (op === 'update') { for (const [key] of match) db.rows.set(key, { value: patch.value, updated_at: stamp() }); return { data: match.map(([key]) => ({ key })), error: null }; }
    return { data: match.map(([key, r]) => ({ key, ...r })), error: null };
  };
  const q: any = {
    select: () => q, order: () => q, range: () => q, eq: (col: string, val: any) => { f.push({ col, val }); return q; },
    update: (p: any) => { op = 'update'; patch = p; return q; },
    insert: (row: any) => {
      if (db.fail) return Promise.resolve({ error: { message: 'Network down' } });
      if (db.rows.has(row.key)) return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
      db.rows.set(row.key, { value: row.value, updated_at: stamp() });
      return Promise.resolve({ error: null });
    },
    maybeSingle: () => { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return q;
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: table, auth: {} }) }));

/** Two devices: each module copy keeps its own "last seen" state, like two browsers. */
async function device() {
  vi.resetModules();
  const { supabaseAdapter, setHousehold } = await import('./adapters/supabase');
  setHousehold('h1');
  await supabaseAdapter.load();
  return supabaseAdapter;
}
const settings = (patch: Partial<Settings>) => ({ household: 'Example', ...patch }) as unknown as Settings;
const value = () => db.rows.get('settings')!.value;

describe('saving settings from two devices', () => {
  beforeEach(() => { db.rows.clear(); db.fail = false; db.rows.set('settings', { value: settings({ expectedIncome: 1, rulesVersion: 1 }), updated_at: stamp() }); });

  it("keeps the other person's change when both save", async () => {
    const a = await device(), b = await device();
    await b.saveSettings(settings({ expectedIncome: 1, rulesVersion: 9 }), { rulesVersion: 9 });
    const stored = await a.saveSettings(settings({ expectedIncome: 5, rulesVersion: 1 }), { expectedIncome: 5 });
    expect(value()).toMatchObject({ expectedIncome: 5, rulesVersion: 9 });
    expect(stored).toMatchObject({ expectedIncome: 5, rulesVersion: 9 });
  });

  it("trying a failed save again never puts back an old copy", async () => {
    const a = await device(), b = await device();
    await b.saveSettings(settings({ expectedIncome: 1, rulesVersion: 9 }), { rulesVersion: 9 });
    db.fail = true;
    await expect(a.saveSettings(settings({ expectedIncome: 5, rulesVersion: 1 }), { expectedIncome: 5 })).rejects.toThrow();
    db.fail = false;
    await a.saveSettings(settings({ expectedIncome: 5, rulesVersion: 1 }), { expectedIncome: 5 });   // Try again
    expect(value()).toMatchObject({ expectedIncome: 5, rulesVersion: 9 });
  });
});
