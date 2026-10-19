# CLAUDE.md — Family Purse (family budget app)

Read first: `DECISIONS.md`, `SESSION-HANDOFF.md`, `BACKLOG.md` (first ⬜ or ❌ in the current phase), then `AGENT-RUNBOOK.md` for monthly work.
Household context, research and private files are in the claude.ai Project "Personal Finance", folder `family-budget/`. Read those too.

## Working rules (from the user)
- Files over memory: keep these tracking files current after every meaningful step; log pivots in DECISIONS.md.
- Discuss proposals first. Don't build or change code until the user gives a clear go-ahead; a question or complaint is not approval.
- The user isn't technical: plain English, step-by-step with what to expect at each step.
- Take analysis end to end with real numbers, but keep it short. No hollow praise, no "not financial advice" disclaimers.
- Money philosophy: Dave Ramsey's baby steps (their reading: no investing beyond super until the house is paid off) and The Richest Man in Babylon.

## Hard privacy rules
- This repository is public. Never commit names, addresses, schools, employers, account numbers, balances, budgets or statements. Household-specific sorting rules, budget and accounts live in `private/household.json` (git-ignored) and in the Project.
- `npm test` includes a privacy guard: it reads `private/privacy-words.txt` (git-ignored; a copy is in the Project) and fails if any of those words appear in the public files. Add new words when you learn them.
- Never store tax file numbers, BSBs, full account or card numbers anywhere.
- Commit as `Gaurav0302 <Gaurav0302@users.noreply.github.com>`, never with a personal email.

## Stack
React 18 + Vite + TypeScript, HashRouter, Supabase (supabase-js, email + password logins, Row Level Security via `members` table). No chart library: one SVG chart component, `src/components/Chart.tsx` (spans, tooltips, click-through; colours `--s1`…`--s8` validated for colour-blind separation), plus `Spark` in `bits.tsx`. Fonts: Familjen Grotesk (headings), Atkinson Hyperlegible (text), bundled from @fontsource (no Google Fonts; theme fonts load on demand in `themes.ts`). The published page has a content security policy (vite.config.ts `csp()`): new outside hosts must be added there.

## Where things are
- `src/data/payees.ts`: the payee list (D13) that decides each transaction's category; `sortTransaction` is the one sorting entry point. Stored as settings key `payees`.
- `src/data/rules.ts`: built-in sorting rules (generic only), used only for payees not seen before. Bump `RULES_VERSION` when you change them: the app re-sorts everything not sorted by hand.
- `wealth.ts`: pay, super, caps, tax rates, net worth, pay-change detection. `bills.ts`: regular bills and price rises. `whatif.ts`: loan payoff with offset. `settingsMerge.ts`: how settings from files merge without overwriting. `categories.ts`: categories and groups. `analysis.ts`: month totals, coverage, budgets, recurring payments, month-end balances. `review.ts`: the review engine (budget, trends, Babylon, Ramsey, 50/30/20, subscriptions, unusual). `importers.ts`: CSV and data-file import. `store.tsx`: state and saving. `adapters/`: Supabase and browser-only storage.
- `reviewCache.ts`: `reviewFor`. `uni.ts`: uni fund maths. `components/FocusTrap.tsx`: keyboard-safe pop-ups.
- `src/loan/`: the Loan Planner's month-by-month loan calculator (`simulate`, tested against the original page). `src/data/property.ts`: properties (`propertiesOf`, falls back to the old `home` details), `runLoan` (real pay, spending, rent overlap, uni funds, real balances). `forecast.ts`: cash month by month and `story()`, the one set of sentences every page uses. `useProperties.ts`: `useProperties`, `useForecast`, `useLoan`. Screens `Property.tsx` (Overview, `CashChart`, Buying, Costs), `LoanPlans.tsx` (Plans, Edit plan, Record), `Uni.tsx`. `plans.ts`: plan wording, presets, what-ifs, `summarize`, `expectedAt`, check-ins. `uni.ts`: a fund's monthly saving over time, path and monthly-for-goal. `components/LoanChart.tsx`: the loan chart with check-ins and the lane of changes.
- `tools/`: `parse_statements.py` (PDF text → transactions), `prepare-import.ts`, `review.ts`.
- `supabase/setup.sql`: tables and access rules. `.github/workflows/`: publish and keep-awake.

## Gotchas
- The workspace proxy blocks supabase.co: test locally with `?demo` and Playwright (`npm i playwright@1.56.1` matches the installed Chromium).
- A month only counts as complete when every account marked "needed for a complete month" covers it.
- Grids need `minmax(0, 1fr)` columns, or tables push the phone layout sideways.
- Pay, super, wealth items, bills, actions and custom categories all live in the `settings` JSON row: no database change needed to add fields there.
- Themes: `src/theme/themes.ts` (54 specs → tokens via OKLCH, contrast enforced; `themes.test.ts` checks all 108). Each person's look is settings `looks[email]`; `useLook()` applies it. Never hard-code colours outside `:root`: use the tokens. Themes set look only; meaning uses fixed tokens: `--good/--warn/--bad` (hue fixed), `--data` (data marks), `--ink-2` dashed for budget/target lines, `--s1…8`, `--k-*`, `--p*` (D24).
- Splits: settings `splits[txId]` (parts add up to the payment). Anything totalling spending should go through `summarise()` or `withSplits()`.
- PayPal: `src/data/paypal.ts` reads PayPal's activity CSV and pairs purchases with bank debits (same amount, ±6 days).
- Areas: `GROUPS` (names) and `GROUP_KEYS` are live lists; a category's `groupKey` is the stable key, `group` its display name. Family changes live in settings `customGroups`, `groupNames`, `categoryEdits`.
- Actions go behind `Menu` (⋯) from `components/Menu.tsx`; month totals for charts come from `useMonthly()` in `data/useMonthly.ts`.
- Statements checks: `data/audit.ts` (`auditMonth`), `useAudits()`, `MonthBanner`. Statement balances live in settings `statements`.
- Layout (D32): menu groups Home + Monthly check-in, Money, Plans, Setup (`NAV` in Shell.tsx; phone tabs `TAB_PATHS`). Monthly check-in is `/check-in` (screens/Reports.tsx: meeting, Trends tab, Financial year); Statements has Add statements as `?tab=add`; What if is `/property/<home>?tab=whatif`. Old routes (/reports, /review, /trends, /import, /what-if) forward via `Moved` in App.tsx.
- Steps pane: `components/StepPane.tsx` (Shell shows it on hover over Monthly check-in, docks it on click). The meeting tells it the current step via `usePane().setInfo`; the pane sends steps as `/check-in?step=…` and Present as `?present=1`.
- Drill-downs: `DrillLink` with `drillCategory/drillType/drillGroup` from `components/Drill.tsx` opens the payments behind any figure.
- Anything about the future (settlement, overlap, what's kept after, money without a job, uni funds) comes from `forecast()`/`story()` or `aheadFindings()` in review.ts: never work it out again on a page. Recent spending leaves out `HOUSING_CATS` and an investment's own area; each property's running costs go back in.
- Budget frequencies (D29): `frequency.ts` (`freqOf`, `perTime`/`monthlyOf`, `dueIn`, `allowance`, `meterLimit`, `scheduled`, `suggest`, `paidAhead`). Budget amounts are always monthly equivalents; settings `budgetEvery[cat] = { every, due }`. A term is a quarter due Jan/Apr/Jul/Oct. Compare spending to `allowance()`/`meterLimit()`, never straight to the monthly budget.
- Loan plans (D30): facts (`loan.changes`/`lumps`) apply to every plan, guesses (`plan.changes`/`lumps`) to one. The active plan's extra is the Budget's `keep-savings` line, never `plan.extra`; budget lines after the first repayment become 'extra' changes. Check-ins: `checkInsOf` (typed + loan/offset statements, statements win); the projection restarts from the latest one. Plan edits are drafts in localStorage `fb:draft:<property>:<plan>` until saved. Net worth's linked loan item reads `linkedLoanOn`.
- Today: always `today()`/`thisMonth()` from `lib/format.ts` (local date). Never `new Date().toISOString()` for "today": in Australia that is still yesterday until 10–11am.
- Saving (D31): `saveSettings(s, patch)` and `savePayees(p, base)` compare-and-swap on `updated_at` (adapters/supabase.ts `saveRecord`); always pass the patch/base so another person's newer copy is kept. Store `guard()` shows failures as a banner with Try again; use `guard(fn, true)` only when the caller shows its own message.
- The month's review: use `reviewFor(data, month)` (data/reviewCache.ts), not `reviewMonth`, in screens: it is cached per data version.
- Pop-up panels: put `<FocusTrap onClose={...} />` first inside the `sheet-wrap` (focus in, Tab kept inside, Escape closes, focus returns). Scrolling tables: `table-wrap` with `tabIndex={0} role="region"` and a unique `aria-label`.
- Privacy check: scans every file `git ls-files -co --exclude-standard` lists; on GitHub it reads the PRIVACY_WORDS secret.
- Dev only: localStorage `fb:today` = `YYYY-MM` pretends the current month (`thisMonth()`), to test Record and check-ins before settlement.
- Home's To do: `data/todos.ts` (`todosFor`). Settings also hold `meetings[month]` (meeting held), `goals` (own goals), `debts` (non-house debts, snowball), and each property's `checklist`. Own goals and debts are `screens/GoalsParts.tsx`. Password reset: store `resetPassword`/`changePassword`; Supabase's PASSWORD_RECOVERY event sets `recovering` and Gate shows `SetPassword`.
- PDF statements (D34): `data/pdfStatements.ts` (`layoutLines`, `parseStatementText`, `accountFor`; same patterns and ids as tools/parse_statements.py) and `data/readPdf.ts` (pdf.js, loaded only when a PDF is chosen). Test against real PDFs only from the scratchpad, never commit statements.
- Bills list: `data/billList.ts` (`billList`) is the one list for Bills, the calendar file and exports. Sinking funds and safe to spend: `data/setAside.ts`. Calendar file: `data/calendar.ts`; settings `meetingWhen`. Tax marks: settings `taxTags[txId]`, `data/tax.ts`. Meeting questions: settings `questions[txId]`. Who changed what: settings-table record `activity` (`adapter.logActivity`, store `note()`; describe new settings keys in `data/activity.ts`). CSV: `lib/csv.ts`.
- Offline: `public/sw.js` caches only the app's own files (and fonts), never Supabase responses. Bump `CACHE` there if caching rules change.
- Keep pages uncluttered: explanations go behind the small `Info` button, not in paragraphs.
- Super cap and tax-rate tables in `wealth.ts` need updating each July (ATO key super rates and thresholds).
