import { addActivity, type Adapter, type Loaded } from './adapter';

const KEY = 'fb:data';

function read(): Loaded {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { payees: [], ...JSON.parse(raw) };
  } catch { /* storage blocked or corrupt: start empty */ }
  return { transactions: [], rules: [], budgets: [], coverage: [], settings: null, reviews: [], payees: [] };
}

function write(d: Loaded) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); }
  catch { throw new Error("This browser's storage is full or turned off, so the change wasn't saved. Download a backup from Settings."); }
}

function upsert<T>(list: T[], items: T[], key: (x: T) => string): T[] {
  const map = new Map(list.map((x) => [key(x), x]));
  for (const it of items) map.set(key(it), it);
  return [...map.values()];
}

/** Keeps everything in this browser only. Used for the demo and before Supabase is set up. */
export const localAdapter: Adapter = {
  kind: 'local',
  async load() { return read(); },
  async upsertTransactions(txs) { const d = read(); d.transactions = upsert(d.transactions, txs, (t) => t.id); write(d); },
  async deleteTransactions(ids) { const d = read(); const s = new Set(ids); d.transactions = d.transactions.filter((t) => !s.has(t.id)); write(d); },
  async upsertRules(rules) { const d = read(); d.rules = upsert(d.rules, rules, (r) => r.id); write(d); },
  async deleteRule(id) { const d = read(); d.rules = d.rules.filter((r) => r.id !== id); write(d); },
  async upsertBudgets(lines) { const d = read(); d.budgets = upsert(d.budgets, lines, (b) => `${b.category}|${b.from}`); write(d); },
  async replaceCoverage(list) { const d = read(); d.coverage = list; write(d); },
  async saveSettings(s) { const d = read(); d.settings = s; write(d); return s; },
  async upsertReviews(r) { const d = read(); d.reviews = upsert(d.reviews, r, (x) => x.id); write(d); },
  async deleteReview(id) { const d = read(); d.reviews = d.reviews.filter((r) => r.id !== id); write(d); },
  async savePayees(p) { const d = read(); d.payees = p; write(d); return p; },
  async logActivity(a) { const d = read(); d.activity = addActivity(d.activity ?? [], a); write(d); return d.activity; },
};

export function clearLocal() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
