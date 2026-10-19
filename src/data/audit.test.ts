import { describe, expect, it } from 'vitest';
import { auditMonth } from './audit';
import { DEFAULT_SETTINGS } from './defaults';
import { statementFrom } from './importers';
import type { Settings, Transaction } from './types';

const t = (id: string, account: string, date: string, amount: number, category: string, description = 'x'): Transaction =>
  ({ id, account, date, amount, description, category, kind: category === 'own-transfer' || category === 'card-payment' ? 'transfer' : category === 'salary' ? 'income' : 'spend' });

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  cardItemisedFrom: '2020-01-01',
  accounts: [
    { key: 'a', name: 'Everyday', owner: 'Alex', type: 'everyday', core: true, last4: '1111' },
    { key: 's', name: 'Savings', owner: 'Alex', type: 'savings', last4: '2222' },
  ],
  pay: [{ person: 'Alex', from: '2026-01', grossYearly: 100000, takeHome: 5000, every: 'month', superPct: 12, salarySacrifice: 0 }],
  statements: [{ account: 'a', from: '2026-08-01', to: '2026-08-31', opening: 1000, closing: 4750 }, { account: 's', from: '2026-08-01', to: '2026-08-31', opening: 0, closing: 250 }],
};
const txs = [
  t('1', 'a', '2026-08-01', 5000, 'salary'),
  t('2', 'a', '2026-08-03', -250, 'own-transfer'), t('3', 's', '2026-08-03', 250, 'own-transfer'),
  t('4', 'a', '2026-08-10', -1000, 'groceries', 'Transfer to xx9999 someone'),
];
const coverage = [{ account: 'a', from: '2026-08-01', to: '2026-08-31' }, { account: 's', from: '2026-08-01', to: '2026-08-31' }];

describe('statements checklist', () => {
  it('passes a month where everything is in and adds up, and flags an unknown account', () => {
    const a = auditMonth({ transactions: txs, coverage, settings }, '2026-08');
    const st = Object.fromEntries(a.checks.map((c) => [c.id, c.state]));
    expect(st).toMatchObject({ statements: 'ok', balances: 'ok', transfers: 'ok', pay: 'ok', unknown: 'warn' });
    expect(a.state).toBe('checks');
  });
  it('catches a missing transaction through the balances, and a transfer with no other end', () => {
    const a = auditMonth({ transactions: txs.filter((x) => x.id !== '3' && x.id !== '4'), coverage, settings }, '2026-08');
    expect(a.checks.find((c) => c.id === 'balances')!.items).toEqual(['Everyday: out by $1,000.00', 'Savings: out by $250.00']);
    expect(a.checks.find((c) => c.id === 'transfers')!.state).toBe('warn');
  });
  it('says which statements are missing or only partly in', () => {
    const a = auditMonth({ transactions: txs, coverage: [{ account: 'a', from: '2026-08-01', to: '2026-08-16' }], settings }, '2026-08');
    expect(a.state).toBe('missing');
    expect(a.checks[0].items).toEqual(['Everyday: only 1 Aug to 16 Aug', 'Savings: no statement yet']);
  });
  it('reads opening and closing balance from a running balance, in either order', () => {
    const rows = [{ amount: -50, balance: 950 }, { amount: 200, balance: 1150 }];
    expect(statementFrom(rows, 'a', '2026-08-01', '2026-08-31')).toMatchObject({ opening: 1000, closing: 1150 });
    expect(statementFrom([...rows].reverse(), 'a', '2026-08-01', '2026-08-31')).toMatchObject({ opening: 1000, closing: 1150 });
    expect(statementFrom([{ amount: -50, balance: 950 }, { amount: 200, balance: 9 }], 'a', '', '')).toBeUndefined();
  });
});
