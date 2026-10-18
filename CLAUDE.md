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
React 18 + Vite + TypeScript, HashRouter, Supabase (supabase-js, email + password logins, Row Level Security via `members` table). No chart library: small SVG/CSS components in `src/components/bits.tsx`. Fonts: Familjen Grotesk (headings), Atkinson Hyperlegible (text).

## Where things are
- `src/data/rules.ts`: built-in sorting rules (generic only). `categories.ts`: categories and groups. `analysis.ts`: month totals, coverage, budgets, recurring payments. `review.ts`: the review engine (budget, trends, Babylon, Ramsey, 50/30/20, subscriptions, unusual). `importers.ts`: CSV and data-file import. `store.tsx`: state and saving. `adapters/`: Supabase and browser-only storage.
- `tools/`: `parse_statements.py` (PDF text → transactions), `prepare-import.ts`, `review.ts`.
- `supabase/setup.sql`: tables and access rules. `.github/workflows/`: publish and keep-awake.

## Gotchas
- The workspace proxy blocks supabase.co and Google Fonts: test locally with `?demo` and Playwright (`npm i playwright@1.56.1` matches the installed Chromium).
- A month only counts as complete when every account marked "needed for a complete month" covers it.
- Grids need `minmax(0, 1fr)` columns, or tables push the phone layout sideways.
