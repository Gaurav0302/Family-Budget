import type { Category, Settings } from './types';

/** Built-in areas. The live list (GROUPS) also has the family's own areas and their renames. */
export const BUILT_GROUPS = [
  'Home', 'Bills', 'Food', 'Kids & school', 'Health', 'Transport', 'Personal',
  'Subscriptions & fun', 'Family & giving', 'Travel', 'Government', 'Admin & fees', 'Other',
];
export const GROUPS: string[] = [...BUILT_GROUPS];

const c = (id: string, label: string, group: string, type: 'need' | 'want', hint?: string): Category => ({ id, label, group, type, hint });

export const CATEGORIES: Category[] = [
  c('rent', 'Rent', 'Home', 'need'),
  c('mortgage', 'Mortgage repayments', 'Home', 'need'),
  c('council-rates', 'Council rates', 'Home', 'need'),
  c('water', 'Water', 'Home', 'need'),
  c('home-insurance', 'Home & contents insurance', 'Home', 'need'),
  c('home-maintenance', 'Repairs & maintenance', 'Home', 'need'),
  c('cleaner', 'Cleaner & gardener', 'Home', 'want'),

  c('energy', 'Electricity & gas', 'Bills', 'need'),
  c('phone-internet', 'Phone & internet', 'Bills', 'need'),

  c('groceries', 'Groceries', 'Food', 'need', 'Supermarkets and grocery delivery'),
  c('takeaway', 'Takeaway & delivery', 'Food', 'want', 'Uber Eats, DoorDash, pizza'),
  c('eating-out', 'Cafés & restaurants', 'Food', 'want'),

  c('school', 'School fees & costs', 'Kids & school', 'need'),
  c('swimming', 'Swimming lessons & pool', 'Kids & school', 'want'),
  c('kids-tennis', 'Tennis coaching', 'Kids & school', 'want'),
  c('kids-martial-arts', 'Martial arts', 'Kids & school', 'want', 'Jiu-jitsu, karate'),
  c('kids-music', 'Music & singing lessons', 'Kids & school', 'want'),
  c('kids-scouts', 'Scouts & camps', 'Kids & school', 'want'),
  c('kids-activities', 'Other kids activities', 'Kids & school', 'want', 'Chess and anything without its own category'),

  c('health-insurance', 'Health insurance', 'Health', 'need'),
  c('life-insurance', 'Life & income protection', 'Health', 'need'),
  c('medical', 'Doctor, dentist & medical', 'Health', 'need'),
  c('pharmacy', 'Pharmacy & vitamins', 'Health', 'need'),
  c('therapies', 'Alternative therapies', 'Health', 'want'),

  c('fuel', 'Fuel', 'Transport', 'need'),
  c('car-insurance', 'Car insurance', 'Transport', 'need'),
  c('car-rego', 'Car registration', 'Transport', 'need'),
  c('car-maintenance', 'Car servicing & repairs', 'Transport', 'need'),
  c('roadside', 'Roadside assistance', 'Transport', 'need', 'RACV, NRMA, RAA and the like'),
  c('tolls-parking', 'Tolls & parking', 'Transport', 'need'),
  c('public-transport', 'Public transport', 'Transport', 'need'),
  c('rideshare', 'Taxis & Uber rides', 'Transport', 'want'),

  c('clothes', 'Clothes & shoes', 'Personal', 'want'),
  c('personal-care', 'Haircuts & beauty', 'Personal', 'want'),
  c('shopping', 'Shopping & homewares', 'Personal', 'want', 'Amazon, Kmart, Officeworks, Bunnings'),
  c('cash', 'Cash withdrawals', 'Personal', 'want'),

  c('subscriptions', 'Subscriptions & apps', 'Subscriptions & fun', 'want', 'AI tools, streaming, software'),
  c('property-tools', 'Property data & tools', 'Subscriptions & fun', 'want'),
  c('entertainment', 'Entertainment & games', 'Subscriptions & fun', 'want'),

  c('gifts', 'Gifts & birthdays', 'Family & giving', 'want'),
  c('social', 'Friends & social', 'Family & giving', 'want'),
  c('family-overseas', 'Money to family overseas', 'Family & giving', 'need'),
  c('donations', 'Donations & giving', 'Family & giving', 'want'),

  c('travel', 'Holidays & flights', 'Travel', 'want'),

  c('gov-visa', 'Visa, PR & citizenship', 'Government', 'need'),
  c('gov-fees', 'Government & official fees', 'Government', 'need', 'Passports, licences, registrations'),

  c('accountant', 'Accountant & tax', 'Admin & fees', 'need'),
  c('business-fees', 'Company & business fees', 'Admin & fees', 'need'),
  c('bank-fees', 'Bank & card fees', 'Admin & fees', 'want'),

  c('card-unitemised', 'Credit card (items not loaded)', 'Other', 'want', 'Card repayments from before the card statements were added'),
  c('other', 'Other / not sure yet', 'Other', 'want'),

  { id: 'salary', label: 'Pay', group: 'Money in', type: 'need', system: true },
  { id: 'interest', label: 'Interest', group: 'Money in', type: 'need', system: true },
  { id: 'other-income', label: 'Other money in', group: 'Money in', type: 'need', system: true },
  { id: 'own-transfer', label: 'Between our accounts', group: 'Moving money', type: 'need', system: true },
  { id: 'card-payment', label: 'Credit card repayment', group: 'Moving money', type: 'need', system: true },
  { id: 'shares', label: 'Shares', group: 'Investing', type: 'need', system: true },
  { id: 'keep-savings', label: 'Savings & offset', group: 'Kept on purpose', type: 'need', system: true, keep: true, hint: 'The weekly transfers, and from settlement the offset' },
  { id: 'keep-shares', label: 'Shares', group: 'Kept on purpose', type: 'need', system: true, keep: true },
  { id: 'keep-uni', label: 'University funds', group: 'Kept on purpose', type: 'need', system: true, keep: true, hint: 'One fund for each child' },
];

const BUILT_IN = [...CATEGORIES];

/** These lists are live: they change in place when the family adds or hides categories (see applyCustomCategories). */
export const CATEGORY = Object.fromEntries(CATEGORIES.map((x) => [x.id, x])) as Record<string, Category>;
export const SPEND_CATEGORIES = CATEGORIES.filter((x) => !x.system);
export const KEEP_CATEGORIES = CATEGORIES.filter((x) => x.keep);
export const label = (id: string | null | undefined) => (id && CATEGORY[id]?.label) || 'Not sorted';

let applied = '';
type Areas = Pick<Settings, 'customGroups' | 'groupNames' | 'categoryEdits'>;

/** Add the family's own categories and areas, apply their renames and moves, and hide what they don't use.
 *  Areas are referred to by a key: a built-in area's original name, or a custom area's id. Hidden categories keep their name for old transactions. */
export function applyCustomCategories(custom: Category[] = [], hidden: string[] = [], areas: Areas = {}) {
  const key = JSON.stringify([custom, hidden, areas]);
  if (key === applied) return;
  applied = key;
  const names: Record<string, string> = { ...Object.fromEntries((areas.customGroups ?? []).map((g) => [g.id, g.label])), ...(areas.groupNames ?? {}) };
  const area = (k: string) => names[k] ?? k;
  const all = [...BUILT_IN, ...custom.map((x) => ({ ...x, custom: true }))].map((x) => {
    const e = areas.categoryEdits?.[x.id];
    const groupKey = e?.group ?? x.group;
    return { ...x, label: e?.label ?? x.label, type: e?.type ?? x.type, groupKey, group: area(groupKey) };
  });
  CATEGORIES.splice(0, CATEGORIES.length, ...all);
  for (const k of Object.keys(CATEGORY)) delete CATEGORY[k];
  for (const x of all) CATEGORY[x.id] = x;
  SPEND_CATEGORIES.splice(0, SPEND_CATEGORIES.length, ...all.filter((x) => !x.system && !hidden.includes(x.id)));
  KEEP_CATEGORIES.splice(0, KEEP_CATEGORIES.length, ...all.filter((x) => x.keep));
  const keys = [...BUILT_GROUPS.slice(0, -1), ...(areas.customGroups ?? []).map((g) => g.id), 'Other'];
  GROUPS.splice(0, GROUPS.length, ...keys.map(area));
  GROUP_KEYS.splice(0, GROUP_KEYS.length, ...keys);
}
/** Area keys in the same order as GROUPS. */
export const GROUP_KEYS: string[] = [...BUILT_GROUPS];

export const isHidden = (id: string, hidden: string[] = []) => hidden.includes(id);
