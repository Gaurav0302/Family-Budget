import { CATEGORY, SPEND_CATEGORIES } from './categories';
import {
  average, budgetFor, cashOnHand, completeMonths, findRecurring, monthOf, summarise,
  type MonthSummary, type Recurring,
} from './analysis';
import { merchantOf } from './merchant';
import type { Data, Transaction } from './types';

export type Severity = 'act' | 'watch' | 'good' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Monthly dollars at stake, used for ranking. */
  impact: number;
  source: 'Budget' | 'Trend' | 'Babylon' | 'Ramsey' | '50/30/20' | 'Subscriptions' | 'Unusual' | 'Home' | 'Data';
  category?: string;
}

export interface ScoreRow {
  category: string;
  label: string;
  group: string;
  budget: number;
  actual: number;
  usual: number;
  average: number;
  status: 'under' | 'near' | 'over' | 'no-budget' | 'unused';
  diff: number;
}

export interface Check { title: string; rule: string; status: Severity; detail: string }

export interface ReviewResult {
  month: string;
  summary: MonthSummary;
  baselineMonths: string[];
  baseline: { spend: number; kept: number; keptRate: number; income: number };
  verdict: { tone: 'better' | 'steady' | 'worse' | 'first'; text: string };
  scorecard: ScoreRow[];
  findings: Finding[];
  babylon: Check[];
  ramsey: { steps: (Check & { n: number; current: boolean })[]; housingShare: number; housingAfter: number };
  split: { needs: number; wants: number; kept: number };
  subscriptions: (Recurring & { overlap?: string })[];
  unusual: { tx: Transaction; reason: string }[];
}

/** Categories that are placeholders rather than plans: they show up under "Needs your input" instead. */
const UNPLANNED = ['other', 'card-unitemised'];

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const OVERLAPS: [string, RegExp][] = [
  ['two AI assistants', /^(ChatGPT|Claude)$/],
  ['two food-delivery memberships', /^(Uber One|DoorDash DashPass)$/],
  ['several streaming services', /^(YouTube Premium|Prime Video|Netflix|Stan|Binge|Disney|Spotify)$/i],
];

/** The full monthly review: budget scorecard, trends, Babylon's seven cures, Ramsey's baby steps, 50/30/20. */
export function reviewMonth(data: Data, month: string): ReviewResult {
  const summary = summarise(month, data);
  const complete = completeMonths(data);
  const baselineMonths = complete.filter((m) => m < month).slice(-3);
  const base = baselineMonths.map((m) => summarise(m, data));
  const baseline = {
    spend: average(base.map((b) => b.spend - b.oneOffs.reduce((s, t) => s - t.amount, 0))),
    kept: average(base.map((b) => b.kept)),
    keptRate: average(base.map((b) => b.keptRate)),
    income: average(base.map((b) => b.income)),
  };
  const usualSpend = summary.spend - summary.oneOffs.reduce((s, t) => s - t.amount, 0);
  const findings: Finding[] = [];
  const s = data.settings;

  // ---- Verdict
  let verdict: ReviewResult['verdict'];
  if (!base.length) verdict = { tone: 'first', text: `This is the first complete month, so there's nothing to compare with yet. You kept ${pct(summary.keptRate)} of what came in.` };
  else {
    const spendChange = baseline.spend ? (usualSpend - baseline.spend) / baseline.spend : 0;
    const keptChange = summary.keptRate - baseline.keptRate;
    const tone = spendChange < -0.03 || keptChange > 0.02 ? 'better' : spendChange > 0.03 || keptChange < -0.02 ? 'worse' : 'steady';
    const dir = usualSpend <= baseline.spend ? 'less' : 'more';
    verdict = {
      tone,
      text: `Day-to-day spending was ${money(usualSpend)}, ${money(usualSpend - baseline.spend)} ${dir} than your ${base.length}-month average of ${money(baseline.spend)}. ` +
        `You kept ${pct(summary.keptRate)} of what came in, against ${pct(baseline.keptRate)} on average.`,
    };
  }

  // ---- Scorecard
  const scorecard: ScoreRow[] = [];
  for (const c of SPEND_CATEGORIES) {
    const budget = budgetFor(data.budgets, c.id, month);
    const actual = summary.byCategory[c.id] ?? 0;
    const usual = summary.byCategoryUsual[c.id] ?? 0;
    const avg = average(base.map((b) => b.byCategoryUsual[c.id] ?? 0));
    if (!budget && !actual && !avg) continue;
    const diff = usual - budget;
    const status: ScoreRow['status'] = !budget ? 'no-budget'
      : usual === 0 && avg === 0 ? 'unused'
      : diff > Math.max(budget * 0.1, 25) ? 'over'
      : diff > -Math.max(budget * 0.1, 25) ? 'near' : 'under';
    scorecard.push({ category: c.id, label: c.label, group: c.group, budget, actual, usual, average: avg, status, diff });

    const overEveryMonth = base.length >= 2 && base.every((b) => (b.byCategoryUsual[c.id] ?? 0) > budget * 1.1);
    if (status === 'over') {
      findings.push({
        id: `over:${c.id}`, category: c.id, source: 'Budget',
        severity: diff > Math.max(budget * 0.25, 100) ? 'act' : 'watch',
        title: `${c.label}: ${money(diff)} over budget`,
        detail: `${money(usual)} spent against a budget of ${money(budget)}.` + (overEveryMonth
          ? ` It's been over in each of the last ${base.length} months too, so either the budget is unrealistic or this is a habit worth changing. Pick one: raise the budget to about ${money(Math.ceil(avg / 10) * 10)} or set a firm cap.`
          : ''),
        impact: diff,
      });
    } else if (status === 'no-budget' && usual >= 100 && !UNPLANNED.includes(c.id)) {
      findings.push({ id: `nobudget:${c.id}`, category: c.id, source: 'Budget', severity: 'watch', impact: usual,
        title: `${c.label}: ${money(usual)} with no budget`, detail: `Give it a budget so every dollar has a job. Your recent average is ${money(avg || usual)} a month.` });
    } else if (status === 'unused' && budget >= 100) {
      findings.push({ id: `unused:${c.id}`, category: c.id, source: 'Budget', severity: 'info', impact: 0,
        title: `${c.label}: budgeted ${money(budget)}, nothing seen`, detail: `Nothing was paid this month or in the months before. That's expected if you're setting money aside for it (like holidays). If it's paid some other way, for example life insurance through super, set this budget to $0.` });
    }
    // Creeping up compared with recent months.
    if (!UNPLANNED.includes(c.id) && base.length >= 2 && avg > 0 && usual - avg > Math.max(avg * 0.2, 75) && status !== 'over') {
      findings.push({ id: `trend:${c.id}`, category: c.id, source: 'Trend', severity: 'watch', impact: usual - avg,
        title: `${c.label} is creeping up`, detail: `${money(usual)} this month against a ${base.length}-month average of ${money(avg)}.` });
    }
  }
  scorecard.sort((a, b) => b.diff - a.diff);

  // ---- 50/30/20 split
  const inc = summary.income || 1;
  const split = { needs: summary.needs / inc, wants: summary.wants / inc, kept: summary.kept / inc };
  if (split.wants > 0.3) findings.push({ id: 'split:wants', source: '50/30/20', severity: split.wants > 0.35 ? 'act' : 'watch', impact: summary.wants - inc * 0.3,
    title: `Wants took ${pct(split.wants)} of income`, detail: `The 50/30/20 guide keeps wants to about 30%. That would be ${money(inc * 0.3)} this month; you spent ${money(summary.wants)}.` });

  // ---- Subscriptions
  const subscriptions: ReviewResult['subscriptions'] = findRecurring(data.transactions, month).map((r) => ({ ...r }));
  for (const [what, re] of OVERLAPS) {
    const hits = subscriptions.filter((x) => re.test(x.merchant) && x.every === 'month');
    if (hits.length >= 2) {
      hits.forEach((h) => (h.overlap = what));
      const cheapest = Math.min(...hits.map((h) => h.monthly));
      findings.push({ id: `overlap:${what}`, source: 'Subscriptions', severity: 'watch', impact: cheapest,
        title: `You're paying for ${what}`, detail: `${hits.map((h) => `${h.merchant} ${money(h.monthly)}/month`).join(', ')}. Keeping just one saves at least ${money(cheapest * 12)} a year.` });
    }
  }
  const subsMonthly = subscriptions.reduce((a, x) => a + x.monthly, 0);
  const subsBudget = budgetFor(data.budgets, 'subscriptions', month) + budgetFor(data.budgets, 'property-tools', month) + budgetFor(data.budgets, 'entertainment', month);
  if (subsMonthly > subsBudget * 1.2 && subsMonthly > 100) findings.push({ id: 'subs:total', source: 'Subscriptions', severity: 'act', impact: subsMonthly - subsBudget,
    title: `Subscriptions cost about ${money(subsMonthly)} a month`, detail: `That's ${money(subsMonthly * 12)} a year, against ${money(subsBudget)} a month budgeted. The Subscriptions list below shows each one, so you can cancel what you don't use.` });
  const property = subscriptions.filter((x) => x.category === 'property-tools' && x.every === 'month');
  if (property.length && month >= '2026-10') findings.push({ id: 'subs:property', source: 'Subscriptions', severity: 'watch', impact: property.reduce((a, x) => a + x.monthly, 0),
    title: 'Property research tools, now the house is bought', detail: `${property.map((p) => `${p.merchant} ${money(p.monthly)}/month`).join(', ')}. Worth cancelling unless you're planning another purchase.` });

  // ---- Unusual spending
  const unusual: ReviewResult['unusual'] = [];
  const history = data.transactions.filter((t) => t.kind === 'spend' && t.amount < 0 && monthOf(t.date) < month);
  for (const t of data.transactions) {
    if (monthOf(t.date) !== month || t.kind !== 'spend' || t.amount >= 0 || t.oneOff) continue;
    const cat = CATEGORY[t.category ?? 'other'];
    const m = merchantOf(t.description);
    const past = history.filter((h) => merchantOf(h.description) === m).map((h) => -h.amount).sort((a, b) => a - b);
    const median = past.length ? past[Math.floor(past.length / 2)] : 0;
    const amt = -t.amount;
    if (past.length >= 2 && amt > Math.max(median * 2.5, 150)) unusual.push({ tx: t, reason: `About ${Math.round(amt / median)}× the usual ${money(median)} at ${m}` });
    else if (!past.length && amt >= 250 && cat?.type === 'want') unusual.push({ tx: t, reason: `First time at ${m}` });
    else if (amt >= 1000 && !['rent', 'mortgage', 'school', 'card-unitemised'].includes(t.category ?? '')) unusual.push({ tx: t, reason: 'A large one-off payment' });
  }
  unusual.sort((a, b) => a.tx.amount - b.tx.amount);
  if (unusual.length) findings.push({ id: 'unusual', source: 'Unusual', severity: 'info', impact: 0,
    title: `${unusual.length} payment${unusual.length > 1 ? 's' : ''} out of the ordinary`, detail: 'If something was a one-off (a dental bill, a visa fee), mark it as one-off so it doesn\'t skew your trends.' });

  const toSort = data.transactions.filter((t) => t.needsReview).length;
  if (toSort) findings.push({ id: 'data:review', source: 'Data', severity: 'info', impact: 0,
    title: `${toSort} transaction${toSort > 1 ? 's need' : ' needs'} your input`, detail: "The app couldn't tell what these were. Sorting them makes every number here more accurate." });

  // ---- Home: settlement, rent overlap, upkeep
  const h = s.home;
  const hasHome = !!h.settlement;
  const settleMonth = hasHome ? monthOf(h.settlement) : '9999-12';
  const housingNow = (summary.byCategory['rent'] ?? 0) + (summary.byCategory['mortgage'] ?? 0) + (summary.byCategory['council-rates'] ?? 0) + (summary.byCategory['water'] ?? 0) + (summary.byCategory['home-insurance'] ?? 0);
  const housingAfterCost = h.repayment + budgetFor(data.budgets, 'council-rates', settleMonth) + budgetFor(data.budgets, 'water', settleMonth) + budgetFor(data.budgets, 'home-insurance', settleMonth);
  const housingShare = summary.income ? housingNow / summary.income : 0;
  const housingAfter = s.expectedIncome ? housingAfterCost / s.expectedIncome : 0;
  if (hasHome && h.leaseEnds > h.settlement && month <= settleMonth) {
    const overlap = Math.max(0, Math.round((new Date(h.leaseEnds).getTime() - new Date(h.settlement).getTime()) / (30.44 * 864e5)));
    const rent = budgetFor(data.budgets, 'rent', month);
    if (overlap && rent) findings.push({ id: 'home:overlap', source: 'Home', severity: 'act', impact: rent,
      title: `Rent and mortgage could overlap for ${overlap} months`, detail: `Settlement is ${fmtDate(h.settlement)} but the lease runs to ${fmtDate(h.leaseEnds)}. Paying both would cost about ${money(overlap * rent)} extra. Ask the rental agent now about ending the lease early or finding a replacement tenant.` });
  }

  // ---- Babylon's seven cures for a lean purse
  const cash = cashOnHand(s);
  const avgSpend = base.length ? average(base.map((b) => b.spend)) : summary.spend;
  const monthsCovered = avgSpend ? cash.total / (avgSpend + (month < settleMonth ? Math.max(0, housingAfterCost - (budgetFor(data.budgets, 'rent', month))) : 0)) : 0;
  const insured = ['health-insurance', 'car-insurance'].filter((c) => (summary.byCategory[c] ?? 0) > 0 || base.some((b) => (b.byCategory[c] ?? 0) > 0));
  const incomeStart = complete.length ? summarise(complete[0], data).income : summary.income;
  const babylon: Check[] = [
    { title: 'Start thy purse to fattening', rule: 'Keep at least one coin in every ten you earn.',
      status: summary.keptRate >= 0.2 ? 'good' : summary.keptRate >= 0.1 ? 'watch' : 'act',
      detail: `You kept ${money(summary.kept)} (${pct(summary.keptRate)}) of ${money(summary.income)}. The rule asks for at least 10%, which would be ${money(summary.income * 0.1)}.` },
    { title: 'Control thy expenditures', rule: 'Budget so that necessities are met without spending more than nine tenths.',
      status: usualSpend <= summary.income * 0.9 && scorecard.filter((r) => r.status === 'over').length <= 3 ? 'good' : 'watch',
      detail: `${scorecard.filter((r) => r.status === 'over').length} categories went over budget this month. Wants came to ${money(summary.wants)}.` },
    { title: 'Make thy gold multiply', rule: 'Put saved money to work so it earns more.',
      status: (summary.byCategory['interest'] ?? 0) >= 0 && month >= settleMonth ? 'good' : 'info',
      detail: month >= settleMonth
        ? `Money in the offset saves ${h.rate}% interest on the loan, more than any savings account pays after tax.`
        : `From settlement, savings moved into the offset save ${h.rate}% on the loan. Until then, keep them in the best-paying savings accounts.` },
    { title: 'Guard thy treasures from loss', rule: 'Protect what you have: emergency money and insurance.',
      status: monthsCovered >= 3 && insured.length >= 2 ? 'good' : 'watch',
      detail: cash.asOf
        ? `Cash on hand of ${money(cash.total)} covers about ${monthsCovered.toFixed(1)} months of spending. Insurance seen: ${insured.map((c) => CATEGORY[c].label.toLowerCase()).join(', ') || 'none'}.`
        : 'Add your savings balances on the Goals page to check your emergency cover.' },
    { title: 'Make of thy dwelling a profitable investment', rule: 'Own your home rather than rent it.',
      status: month >= settleMonth ? 'good' : 'info',
      detail: !hasHome ? 'Add your home loan details on the Goals page.' : month >= settleMonth ? `You own your home. Every extra dollar in the offset brings payoff closer.` : `Settlement on ${fmtDate(h.settlement)} turns ${money(budgetFor(data.budgets, 'rent', month))} of rent a month into paying off your own home.` },
    { title: 'Insure a future income', rule: 'Provide for the years when you no longer work.',
      status: s.grossMonthly && s.superMonthly / s.grossMonthly >= 0.12 ? 'good' : 'watch',
      detail: `About ${money(s.superMonthly)} a month goes into super for both of you: ${pct(s.superMonthly / (s.grossMonthly || 1))} of gross pay.` },
    { title: 'Increase thy ability to earn', rule: 'Grow your skills and your income.',
      status: summary.income > incomeStart * 1.01 ? 'good' : 'info',
      detail: complete.length > 1 ? `Take-home pay was ${money(summary.income)} this month, against ${money(incomeStart)} in ${fmtMonth(complete[0])}.` : `Take-home pay was ${money(summary.income)} this month.` },
  ];
  if (summary.keptRate < 0.1) findings.push({ id: 'babylon:tenth', source: 'Babylon', severity: 'act', impact: summary.income * 0.1 - summary.kept,
    title: 'Less than a tenth kept this month', detail: `Babylon's first rule is to keep at least 10%. You'd need another ${money(summary.income * 0.1 - summary.kept)}.` });
  else findings.push({ id: 'babylon:tenth', source: 'Babylon', severity: 'good', impact: 0,
    title: `${pct(summary.keptRate)} of income kept`, detail: `Above Babylon's one-in-ten rule. The habit doing the work: automatic weekly transfers to savings before anything gets spent.` });

  // ---- Ramsey's baby steps
  const fundsSaved = s.uniFunds.reduce((a, f) => a + f.saved, 0);
  const giving = summary.byCategory['donations'] ?? 0;
  const steps: { n: number; title: string; rule: string; done: boolean; detail: string }[] = [
    { n: 1, title: 'Starter emergency fund', rule: 'Save $1,000 for emergencies.', done: cash.total >= 1000 || !!s.babySteps['1'],
      detail: cash.asOf ? `${money(cash.total)} in cash.` : 'Add your balances on the Goals page.' },
    { n: 2, title: 'Pay off all debt except the house', rule: 'Clear credit cards, car and personal loans smallest first.', done: !!s.babySteps['2'],
      detail: s.babySteps['2'] ? 'Marked as done.' : 'Tick this on the Goals page if the credit card is paid in full every month and there are no other loans.' },
    { n: 3, title: '3–6 months of expenses saved', rule: 'A full emergency fund.', done: monthsCovered >= 3 || !!s.babySteps['3'],
      detail: cash.asOf ? `Covers about ${monthsCovered.toFixed(1)} months, counting the mortgage from settlement.` : 'Add your balances on the Goals page.' },
    { n: 4, title: 'Invest 15% for retirement', rule: 'Your reading: super only, until the house is paid off.', done: s.superMonthly / (s.grossMonthly || 1) >= 0.15 || !!s.babySteps['4'],
      detail: `Super is ${pct(s.superMonthly / (s.grossMonthly || 1))} of gross pay. 15% would be ${money(s.grossMonthly * 0.15)} a month.` },
    { n: 5, title: "Save for the children's university", rule: 'Build a fund for each child.', done: !!s.babySteps['5'],
      detail: `${money(fundsSaved)} saved so far. Planned: ${s.uniFunds.map((f) => `${f.name} ${money(f.monthly)}/month`).join(', ')}.` },
    { n: 6, title: 'Pay off the home early', rule: 'Every spare dollar to the mortgage.', done: !!s.babySteps['6'],
      detail: !hasHome ? 'Add your home loan on the Goals page.' : month >= settleMonth ? 'Extra money into the offset counts here.' : `Starts at settlement on ${fmtDate(h.settlement)}.` },
    { n: 7, title: 'Build wealth and give', rule: 'Invest and give generously.', done: !!s.babySteps['7'],
      detail: giving ? `${money(giving)} given this month.` : 'Giving this month: none recorded.' },
  ];
  let currentFound = false;
  const ramseySteps = steps.map((st) => {
    const current = !st.done && !currentFound;
    if (current) currentFound = true;
    return { n: st.n, title: st.title, rule: st.rule, detail: st.detail, current, status: (st.done ? 'good' : current ? 'watch' : 'info') as Severity };
  });
  if (hasHome && housingAfter > 0.25) findings.push({ id: 'ramsey:housing', source: 'Ramsey', severity: 'watch', impact: 0,
    title: `Housing will take ${pct(housingAfter)} of take-home pay`, detail: `Ramsey suggests keeping it to 25% or less. From settlement, the repayment, rates, water and insurance come to about ${money(housingAfterCost)} a month on ${money(s.expectedIncome)} take-home. It makes keeping other spending on budget more important.` });

  const order: Record<Severity, number> = { act: 0, watch: 1, info: 2, good: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.impact - a.impact);

  return { month, summary, baselineMonths, baseline, verdict, scorecard, findings, babylon,
    ramsey: { steps: ramseySteps, housingShare, housingAfter }, split, subscriptions, unusual };
}

export function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtMonth(m: string) {
  return new Date(m + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

/** Plain-text version of a review, for agents writing the monthly note. */
export function reviewText(r: ReviewResult): string {
  const lines = [
    `# ${fmtMonth(r.month)} review`, '',
    r.verdict.text, '',
    `Income ${money(r.summary.income)} · spent ${money(r.summary.spend)} · kept ${money(r.summary.kept)} (${pct(r.summary.keptRate)})`,
    `Needs ${pct(r.split.needs)} · wants ${pct(r.split.wants)} · kept ${pct(r.split.kept)}`, '',
    '## Findings',
    ...r.findings.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`), '',
    '## Over budget',
    ...r.scorecard.filter((x) => x.status === 'over').map((x) => `- ${x.label}: ${money(x.usual)} vs ${money(x.budget)} (avg ${money(x.average)})`), '',
    '## Subscriptions',
    ...r.subscriptions.map((x) => `- ${x.merchant}: ${money(x.monthly)}/month${x.overlap ? ` (overlap: ${x.overlap})` : ''}`),
  ];
  return lines.join('\n');
}
