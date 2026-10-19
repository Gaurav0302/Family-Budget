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
React 18 + Vite + TypeScript, HashRouter, Supabase (supabase-js, email + password logins, Row Level Security via `members` table). No chart library: one SVG chart component, `src/components/Chart.tsx` (spans, tooltips, click-through; colours `--s1`…`--s8` validated for colour-blind separation), plus `Spark` in `bits.tsx`. Fonts: Familjen Grotesk (headings), Atkinson Hyperlegible (text).

## Where things are
- `src/data/payees.ts`: the payee list (D13) that decides each transaction's category; `sortTransaction` is the one sorting entry point. Stored as settings key `payees`.
- `src/data/rules.ts`: built-in sorting rules (generic only), used only for payees not seen before. Bump `RULES_VERSION` when you change them: the app re-sorts everything not sorted by hand.
- `wealth.ts`: pay, super, caps, tax rates, net worth, pay-change detection. `bills.ts`: regular bills and price rises. `whatif.ts`: loan payoff with offset. `settingsMerge.ts`: how settings from files merge without overwriting. `categories.ts`: categories and groups. `analysis.ts`: month totals, coverage, budgets, recurring payments, month-end balances. `review.ts`: the review engine (budget, trends, Babylon, Ramsey, 50/30/20, subscriptions, unusual). `importers.ts`: CSV and data-file import. `store.tsx`: state and saving. `adapters/`: Supabase and browser-only storage.
- `tools/`: `parse_statements.py` (PDF text → transactions), `prepare-import.ts`, `review.ts`.
- `supabase/setup.sql`: tables and access rules. `.github/workflows/`: publish and keep-awake.

## Gotchas
- The workspace proxy blocks supabase.co and Google Fonts: test locally with `?demo` and Playwright (`npm i playwright@1.56.1` matches the installed Chromium).
- A month only counts as complete when every account marked "needed for a complete month" covers it.
- Grids need `minmax(0, 1fr)` columns, or tables push the phone layout sideways.
- Pay, super, wealth items, bills, actions and custom categories all live in the `settings` JSON row: no database change needed to add fields there.
- Themes: `src/theme/themes.ts` (54 specs → tokens via OKLCH, contrast enforced; `themes.test.ts` checks all 108). Each person's look is settings `looks[email]`; `useLook()` applies it. Never hard-code colours outside `:root`: use the tokens. Themes set look only; meaning uses fixed tokens: `--good/--warn/--bad` (hue fixed), `--data` (data marks), `--ink-2` dashed for budget/target lines, `--s1…8`, `--k-*`, `--p*` (D24).
- Splits: settings `splits[txId]` (parts add up to the payment). Anything totalling spending should go through `summarise()` or `withSplits()`.
- PayPal: `src/data/paypal.ts` reads PayPal's activity CSV and pairs purchases with bank debits (same amount, ±6 days).
- Areas: `GROUPS` (names) and `GROUP_KEYS` are live lists; a category's `groupKey` is the stable key, `group` its display name. Family changes live in settings `customGroups`, `groupNames`, `categoryEdits`.
- Actions go behind `Menu` (⋯) from `components/Menu.tsx`; month totals for charts come from `useMonthly()` in `data/useMonthly.ts`.
- Steps pane: `components/StepPane.tsx` (Shell shows it on hover over Reports, docks it on click). The meeting tells it the current step via `usePane().setInfo`; the pane sends steps as `/reports?step=…` and Present as `?present=1`.
- Drill-downs: `DrillLink` with `drillCategory/drillType/drillGroup` from `components/Drill.tsx` opens the payments behind any figure.
- Keep pages uncluttered: explanations go behind the small `Info` button, not in paragraphs.
- Super cap and tax-rate tables in `wealth.ts` need updating each July (ATO key super rates and thresholds).
