/** Shorten a raw bank description into a readable merchant name, e.g.
 *  "UBER *EATS HELP.UBER.C Sydney AU AUS" -> "Uber Eats". */
const KNOWN: [RegExp, string][] = [
  [/UBER \*EATS|UBEREATS/i, 'Uber Eats'],
  [/UBER \*ONE/i, 'Uber One'],
  [/PAYPAL \*UBER AU/i, 'Uber'],
  [/DASHPASS/i, 'DoorDash DashPass'],
  [/Coles Online/i, 'Coles Online'],
  [/AMAZON/i, 'Amazon'],
  [/KMART/i, 'Kmart'],
  [/OFFICEWORKS/i, 'Officeworks'],
  [/CHATGPT|OPENAI/i, 'ChatGPT'],
  [/ANTHROPIC/i, 'Claude'],
  [/YouTube/i, 'YouTube Premium'],
  [/PRIME VIDE/i, 'Prime Video'],
  [/Audible/i, 'Audible'],
  [/MYKI/i, 'Myki'],
  [/AGL/i, 'AGL'],
  [/AHM/i, 'ahm health insurance'],
  [/BUDGET DIRECT/i, 'Budget Direct'],
  [/YMCA/i, 'YMCA'],
  [/Spaceship/i, 'Spaceship'],
  [/CR CARD AUTOPAY|AUTO PAYMENT/i, 'Credit card repayment'],
  [/TELSTRA/i, 'Telstra'],
  [/RACV/i, 'RACV'],
  [/Linkt/i, 'Linkt tolls'],
  [/Credit Interest|^Interest/i, 'Interest'],
  [/self mq save|Macquarie/i, 'To Macquarie savings'],
  [/self save/i, 'To savings'],
  [/Transfer (to|from) xx\d{4}/i, 'Between own accounts'],
];

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function merchantOf(description: string): string {
  for (const [re, name] of KNOWN) if (re.test(description)) return name;
  let s = description.split(' | ')[0];
  const salary = s.match(/^Salary\s+(.+)$/i);
  if (salary) return `Pay: ${titleCase(salary[1].replace(/\s+\d.*$/, ''))}`;
  const imt = s.match(/^IMT\s+(?:\d+\s+)?(.+)$/i);
  if (imt) return `${titleCase(imt[1])} (overseas transfer)`;
  const paypal = s.match(/^PayPal: (.*?)( Pty\.? Limited| Pty Ltd| Limited| Corporation| Ireland Ltd| Group)?( \(US\$.*\))?$/i);
  if (paypal) return paypal[1];
  const transfer = s.match(/^(?:Fast )?Transfer (?:To|From) (?:- )?(.+)$/i);
  if (transfer) return titleCase(transfer[1].replace(/ PayID.*$/i, ''));
  const dd = s.match(/^Direct (?:Debit|Credit) \d+ (.+)$/i);
  if (dd) s = dd[1];
  s = s.replace(/^(SQ|SP|ZLR|DD|PAYPAL|COM|MYO)\s?\*\s?/i, '')
    .replace(/\b(AUS?|AU AUS|VIC|NSW|VI|NS)\b\s*$/i, '')
    .replace(/\s+(SYDNEY|MELBOURNE|BRISBANE|ADELAIDE|PERTH|HOBART|CANBERRA|DARWIN|SAN FRANCISCO.*|SEATTLE.*|LONDON.*|DOVER.*|BARANGAROO|PYRMONT|BELCONNEN|HELP\.UBER.*)\b.*$/i, '')
    .replace(/\s+\d{3,}.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return titleCase(s || description).slice(0, 40);
}

/** Remove reference numbers and long digit strings before storing a description. */
export function tidyDescription(d: string): string {
  return d
    .replace(/\s*\|\s*Value Date[^|]*/gi, '')
    .replace(/\s*\|\s*Card xx\d+[^|]*/gi, '')
    .replace(/\bDT\.\w+ \w+\b/g, '')
    .replace(/\bPD\d+-[\d-]+\b/g, '')
    .replace(/\b\d{7,}\b/g, '')
    .replace(/\s*\|\s*(?=\||$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\|\s*$/, '')
    .trim();
}
