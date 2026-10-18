import type { Kind, Rule, Settings, Transaction } from './types';

/**
 * Built-in sorting rules, tried top to bottom; the first match wins.
 * Rules people add in the app are tried before these.
 * Patterns are case-insensitive regular expressions matched against the description.
 */
const r = (pattern: string, category: string, kind: Kind = 'spend', extra: Partial<Rule> = {}): Rule => ({
  id: `builtin:${category}:${pattern}`, pattern, category, kind, ...extra,
});

export const DEFAULT_RULES: Rule[] = [
  // Money moving between the family's own accounts — never spending.
  r('self (mq )?save|\\bself\\b.*\\b(mq|save)\\b|Transfer (to|from) xx\\d{4}|- self\\b', 'own-transfer', 'transfer'),
  r('CR CARD AUTOPAY|AUTO PAYMENT - THANK YOU', 'card-payment', 'transfer'),

  // Money in.
  r('^Salary\\b|\\bSALARY\\b', 'salary', 'income', { sign: 'in' }),
  r('Credit Interest|^Interest\\b', 'interest', 'income', { sign: 'in' }),
  r('MCARE BENEFITS|MEDICARE', 'medical', 'spend', { sign: 'in' }),
  r('myki-tnfr', 'public-transport', 'spend', { sign: 'in' }),

  // Investing.
  r('Spaceship|Stake|CoinSpot|Vanguard|Pearler', 'shares', 'invest'),

  // Home and bills.
  r('\\brent\\b|REAL ESTATE|PROPERTY MANAGEMENT', 'rent'),
  r('UNITY BANK.*(LOAN|REPAY)|LOAN REPAYMENT', 'mortgage'),
  r('CITY COUNCI.*RATES|COUNCIL RATES', 'council-rates'),
  r('YARRA VALLEY WATER|YVW', 'water'),
  r('CLEANING|CLEANER|GARDEN', 'cleaner'),
  r('\\bAGL\\b|ORIGIN ENERGY|ENERGYAUSTRALIA|RED ENERGY|LUMO', 'energy'),
  r('TELSTRA|OPTUS|VODAFONE|AMAYSIM|AUSSIE BROADBAND|BELONG|TPG', 'phone-internet'),

  // Subscriptions and memberships (before food, so Uber One / DashPass don't count as takeaway).
  r('UBER \\*ONE|DASHPASS|CHATGPT|OPENAI|ANTHROPIC|CLAUDE\\.AI|LOVABLE|MICROSOFT|YouTube|PRIME VIDE|Audible|NETFLIX|SPOTIFY|DISNEY|\\bSTAN\\b|BINGE|VYSOR|McAfee|Unicorn Data|APPLE\\.COM|GOOGLE ONE', 'subscriptions'),
  r('Suburb Data|Microburbs|\\bDSR\\b|RP Data|CoreLogic|Hot Property', 'property-tools'),
  r('Gossip Harbor|PLAYSTATION|Valve|STEAM|ZONE BOWLING|HOYTS|VILLAGE CINEMA|NINTENDO', 'entertainment'),

  // Food.
  r('\\bCOLES\\b|ALDI|WOOLWORTHS|\\bIGA\\b|HARRIS FARM|FOODWORKS|COSTCO', 'groceries'),
  r('UBER \\*EATS|UBEREATS|DOORDASH|MENULOG|PIZZA|KFC|MCDONALD|HUNGRY JACK|SUBWAY|GUZMAN', 'takeaway'),
  r('Cafe|COFFE|PATISSERIE|RESTAURANT|BAKERY|BISTRO|\\bBAR\\b', 'eating-out'),

  // Kids and school.
  r('CompassTix|SCHOOL|GRAMMAR|COLLEGE', 'school'),
  r('scouts?\\b|SCOUT|TENNIS|DOJO|MARTIAL|JIU|Chess\\.com|ChessKid|PIANO|SINGING|MUSIC', 'kids-activities'),
  r('YMCA|SWIM|AQUATIC', 'swimming'),

  // Health.
  r('\\bAHM\\b|MEDIBANK|BUPA|HCF|NIB\\b', 'health-insurance'),
  r('TAL LIFE|AIA|ZURICH|LIFE INSURANCE|INCOME PROTECTION', 'life-insurance'),
  r('DENTAL|MEDICAL|CLINIC|PATHOLOGY|HOSPITAL|PHYSIO|DOCTOR|\\bGP\\b', 'medical'),
  r('PHMCY|PHARMACY|CHEMIST|PLINEPH|PRICELINE', 'pharmacy'),
  r('ACUPUNCT|NATUROPATH|MASSAGE|CHIRO', 'therapies'),

  // Transport.
  r('\\bBP\\b|7 ELEVEN|AMPOL|\\bSHELL\\b|CALTEX|UNITED PETROL|EG FUEL', 'fuel'),
  r('BUDGET DIRECT|AAMI|ALLIANZ|YOUI|RACV INSURANCE', 'car-insurance'),
  r('VICROADS|REGISTRATION', 'car-rego'),
  r('RACV', 'roadside'),
  r('Linkt|CITYLINK|EASTLINK|Paystay|WILSON PARK|SECURE PARK|CARE PARK|PARKING', 'tolls-parking'),
  r('MYKI|Public Transport Victo|PTV', 'public-transport'),
  r('CABS|PAYPAL \\*UBER AU|UBER \\*TRIP|UBER TRIP|DIDI|OLA ', 'rideshare'),

  // Personal.
  r('Wdl ATM|Wdl Agency|\\bATM\\b', 'cash'),
  r('SHEIN|UNIQLO|COTTON ON|MYER|DAVID JONES|H ?& ?M|ZARA', 'clothes'),
  r('Fresha|NAILS|BARBE|HAIR|BEAUTY', 'personal-care'),
  r('AMAZON|KMART|BUNNINGS|OFFICEWORKS|TARGET|BIG W|ANACONDA|\\bPOST\\b|IKEA|JB HI', 'shopping'),

  // Family and giving.
  r('gift|bday|birthday', 'gifts'),
  r('^IMT |INTERNATIONAL TRANSFER|WISE ', 'family-overseas'),
  r('DONATION|RED CROSS|UNICEF|CHARITY|FOUNDATION', 'donations'),

  // Travel, admin, fees.
  r('Jetstar|QANTAS|VIRGIN AUST|AIR INDIA|SINGAPORE AIR|BOOKING\\.COM|AIRBNB|EXPEDIA|\\bflights?\\b', 'travel'),
  r('HOME AFFAIRS|VFS|SERVICE VIC|PASSPORT', 'gov-fees'),
  r('\\bASIC\\b', 'business-fees'),
  r('ACCOUNTANT|H&R BLOCK|TAX AGENT', 'accountant'),
  r('MONTHLY FEE|INTNL TRANSACTION FEE|ACCOUNT FEE|OVERDRAWN', 'bank-fees'),
];

const cache = new Map<string, RegExp>();
function re(pattern: string): RegExp {
  let x = cache.get(pattern);
  if (!x) {
    try { x = new RegExp(pattern, 'i'); } catch { x = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    cache.set(pattern, x);
  }
  return x;
}

export function ruleMatches(rule: Rule, tx: Pick<Transaction, 'description' | 'amount' | 'account'>): boolean {
  if (rule.sign === 'in' && tx.amount <= 0) return false;
  if (rule.sign === 'out' && tx.amount >= 0) return false;
  if (rule.account && rule.account !== tx.account) return false;
  return re(rule.pattern).test(tx.description);
}

export interface Sorted { category: string; kind: Kind; needsReview: boolean }

/** Decide a transaction's category. People's own choices (manual) are never changed. */
export function categorise(tx: Transaction, userRules: Rule[], settings: Pick<Settings, 'cardItemisedFrom'>): Sorted {
  if (tx.manual && tx.category && tx.kind) return { category: tx.category, kind: tx.kind, needsReview: false };
  for (const rule of [...userRules, ...DEFAULT_RULES]) {
    if (!ruleMatches(rule, tx)) continue;
    if (rule.category === 'card-payment' && tx.amount < 0 && tx.date < settings.cardItemisedFrom) {
      return { category: 'card-unitemised', kind: 'spend', needsReview: false };
    }
    return { category: rule.category, kind: rule.kind, needsReview: false };
  }
  // Nothing matched: money in is "other money in", money out is "not sure yet". Both ask for a person's input.
  return tx.amount > 0
    ? { category: 'other-income', kind: 'income', needsReview: true }
    : { category: 'other', kind: 'spend', needsReview: true };
}

export function applyRules(txs: Transaction[], userRules: Rule[], settings: Pick<Settings, 'cardItemisedFrom'>): Transaction[] {
  return txs.map((tx) => {
    if (tx.manual) return tx;
    const s = categorise(tx, userRules, settings);
    return { ...tx, category: s.category, kind: s.kind, needsReview: s.needsReview };
  });
}

/** Turn a merchant name into a safe rule pattern ("Uber Eats" -> "Uber Eats" escaped). */
export function patternFor(merchant: string): string {
  return merchant.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
