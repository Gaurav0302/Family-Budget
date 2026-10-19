import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { taxLines, taxTotals } from './tax';
import type { Settings, Transaction } from './types';

const t = (id: string, date: string, amount: number, category: string, account = 'a'): Transaction =>
  ({ id, date, amount, description: id.toUpperCase(), account, category, kind: amount > 0 ? 'income' : 'spend' });
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  accounts: [{ key: 'a', name: 'A everyday', owner: 'A', type: 'everyday' }, { key: 'b', name: 'B everyday', owner: 'B', type: 'everyday' }],
  taxTags: { tools: { kind: 'work' }, course: { kind: 'self-education', person: 'B' }, split: { kind: 'work' } },
  splits: { split: [{ amount: -30, category: 'shopping' }, { amount: -20, category: 'phone-internet' }] },
};
const txs = [
  t('tools', '2026-08-02', -120, 'shopping'),
  t('course', '2026-09-10', -450, 'education', 'a'),
  t('gift', '2026-12-01', -50, 'donations', 'b'),
  t('acct', '2027-03-01', -330, 'accountant'),
  t('split', '2026-10-05', -50, 'shopping'),
  t('old', '2026-06-30', -99, 'donations'),          // the year before
  t('food', '2026-08-03', -80, 'groceries'),          // not for tax
];

describe('tax time', () => {
  it('lists marked payments and the usual deductible categories, by person', () => {
    const lines = taxLines({ transactions: txs, settings }, '2026-27');
    expect(lines.map((l) => l.tx.splitOf ?? l.tx.id).sort()).toEqual(['acct', 'course', 'gift', 'split', 'split', 'tools']);
    const by = taxTotals(lines);
    expect(by.get('A')?.get('work')).toBe(170);            // tools + both parts of the split payment
    expect(by.get('A')?.get('tax-agent')).toBe(330);
    expect(by.get('B')?.get('self-education')).toBe(450);  // marked as B's though paid from A's account
    expect(by.get('B')?.get('donation')).toBe(50);
  });
});
