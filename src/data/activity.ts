import { label } from './categories';
import type { Settings, Transaction } from './types';

/** Plain words for what a settings change touched, for "who changed what". Personal or automatic ones are left out. */
const WORDS: Partial<Record<keyof Settings, string>> = {
  household: 'the household name', accounts: 'accounts', balances: 'account balances', statements: 'statement balances',
  pay: 'pay', superBalances: 'super balances', superMonthly: 'super', grossMonthly: 'pay', people: 'the household', wealth: 'net worth items', bills: 'bills', actions: 'the plan', meetings: 'the money meeting',
  goals: 'goals', debts: 'debts', properties: 'property', home: 'property', uniFunds: 'uni funds', uniPlan: 'uni funds', babySteps: 'baby steps', budgetEvery: 'how often budget lines are paid',
  splits: 'split payments', customCategories: 'categories', hiddenCategories: 'categories', categoryEdits: 'categories',
  customGroups: 'areas', groupNames: 'areas', taxTags: 'tax marks', questions: 'meeting questions', meetingWhen: 'the meeting day',
  expectedIncome: 'expected income',
};

export function describeSettings(patch: Partial<Settings>): string | null {
  const words = [...new Set(Object.keys(patch).map((k) => WORDS[k as keyof Settings]).filter(Boolean))] as string[];
  return words.length ? `Changed ${words.join(', ')}` : null;
}

export function describeTransactions(changed: Transaction[], patch: Partial<Transaction>): string {
  const n = changed.length;
  if (patch.category) return `Sorted ${n === 1 ? 'a payment' : `${n} payments`} into ${label(patch.category)}`;
  if (patch.oneOff !== undefined) return `Marked ${n === 1 ? 'a payment' : `${n} payments`} as ${patch.oneOff ? 'one-off' : 'regular'}`;
  if (patch.note !== undefined) return `Changed the note on ${n === 1 ? 'a payment' : `${n} payments`}`;
  return `Changed ${n === 1 ? 'a payment' : `${n} payments`}`;
}
