# PROJECT.md

## What and why
A modern, easy family budget tool replacing a spreadsheet: one view of every account, automatic sorting, a zero-based budget, and a monthly review that says plainly whether the family is heading the right way, judged by Ramsey's baby steps, The Richest Man in Babylon and 50/30/20. Any Claude session can add next month's statements and write the review (AGENT-RUNBOOK.md).

## Architecture
- Front end: React + Vite + TypeScript on GitHub Pages (this public repo, code only). HashRouter so deep links work on Pages.
- Data: Supabase free plan (Postgres + email/password logins). Every table has Row Level Security: only users in `members` can read or write. Sign-ups are switched off.
- Keep-awake: GitHub Action calls `rpc/ping` twice a week and commits `.github/heartbeat.txt` so scheduled jobs keep running.
- Backups: no automatic backups on the free plan, so the app offers "Download a backup" (a data file that restores everything when added back).
- Demo mode: `?demo` keeps data in the browser only, for testing.

## Principles
- Plain English everywhere. Every number explains itself.
- The payee list decides sorting; the family reviews it, and every import follows it.
- Transfers between own accounts are never spending. One-offs can be set aside from trends.
- A month counts only when all core accounts are loaded; partial months are marked.
- Nothing personal in the public code.

## Files
```
src/
  App.tsx, main.tsx, config.ts
  components/  Shell.tsx (sidebar / phone tab bar), bits.tsx (meter, purse bar, columns chart, badges),
               Drill.tsx (payments behind a figure), Chart.tsx (all charts), Menu.tsx (⋯ menus), CategorySelect.tsx
  data/        types, categories, rules, merchant, analysis, review, importers, defaults, store, adapters/,
               wealth (pay, super, net worth), bills, whatif, settingsMerge, payees (the payee list), useMonthly (month totals for charts)
  screens/     Home, Transactions, Budget, Bills, Review, Reports, Trends, Goals, WhatIf, Wealth, Accounts, Categories,
               More (phone), Import, Settings, Login
  styles/      app.css (tokens, light + dark)
tools/         parse_statements.py, prepare-import.ts, review.ts
supabase/      setup.sql
.github/       workflows/pages.yml, workflows/keep-awake.yml
```
