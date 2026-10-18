# BACKLOG.md

Status: ✅ done · ⬜ to do · 🔄 in progress · ❌ blocked · 🚫 dropped (with decision #)

## Phase 0 — Agree the plan
- ✅ 18 Oct 2026 — Analyse budget sheet and statements Feb–Oct 2026 (research in the Project)
- ✅ 18 Oct 2026 — Check Supabase free plan; user confirmed Supabase (D2) and gave go-ahead
- ✅ 18 Oct 2026 — User created GitHub repo, Supabase project, logins, ran setup.sql
- 🚫 Private GitHub data repo — replaced by Supabase (D2)

## Phase 1 — Foundations
- ✅ 18 Oct 2026 — App skeleton, shell, theme (light/dark), phone/tablet/desktop layouts
- ✅ 18 Oct 2026 — Supabase tables + Row Level Security + login
- ✅ 18 Oct 2026 — Publish workflow + keep-awake workflow
- ⬜ User turns on GitHub Pages (Source: GitHub Actions) and confirms the live site loads and login works
- ⬜ Confirm keep-awake job runs (Actions tab → Keep the database awake → Run workflow)

## Phase 2 — Getting data in
- ✅ 18 Oct 2026 — Categories, built-in rules, own-transfer detection, card-repayment and PayPal handling
- ✅ 18 Oct 2026 — Import page: CommBank/other CSVs and Family Budget data files; duplicate skipping
- ✅ 18 Oct 2026 — History Feb–Oct 2026 prepared (627 transactions, reconciled to the cent)
- ⬜ User imports the history file and sorts the items under "Needs your input"
- ⬜ PayPal CSV import in the app (today PayPal is only handled by the PDF tool)
- ⬜ PDF import directly in the app (today PDFs go through a Claude session)

## Phase 3 — Budget
- ✅ 18 Oct 2026 — Zero-based budget with "Kept on purpose", budgets that change from a month onwards, rent → mortgage from settlement
- ⬜ User reviews the starting budget (taken from the spreadsheet) against real spending and adjusts

## Phase 4 — Review
- ✅ 18 Oct 2026 — Verdict, scorecard, trends, subscriptions, unusual payments, Babylon, Ramsey, 50/30/20, monthly notes

## Phase 5 — Goals
- ✅ 18 Oct 2026 — Baby steps, cash on hand, uni funds, home loan panel
- ⬜ Add the offset and loan accounts after settlement (9 Dec 2026)

## Phase 6 — Monthly routine
- ✅ 18 Oct 2026 — AGENT-RUNBOOK.md, prepare-import and review tools
- ⬜ First run with October 2026 statements (Reeti's October statement still needed)
- ⬜ Optional: Supabase connector in claude.ai so sessions can add data directly

## Phase 6b — Wealth and insight (approved 18 Oct 2026)
- ✅ 18 Oct 2026 — Income & super page: pay history per person, super balances, before-tax cap room and tax effect
- ✅ 18 Oct 2026 — Net worth: cash + super + assets − debts, monthly trend
- ✅ 18 Oct 2026 — Bills & renewals: found from statements, next dates, price rises, manual bills
- ✅ 18 Oct 2026 — Reports: monthly money meeting (printable, actions) and financial year
- ✅ 18 Oct 2026 — What if: cuts and cancelled subscriptions → kept after settlement, loan payoff
- ✅ 18 Oct 2026 — Alert banners on Home; pay-change, creep, dipping-into-savings, price-rise findings
- ✅ 18 Oct 2026 — Kids categories split; custom and hidden categories; re-sort when rules change
- ⬜ User adds the update file, then current super balances and fund names (sheet values are from Jan 2026)
- ⬜ User confirms car rego, insurance renewal dates as manual bills
- ⬜ Each July: update super cap and tax tables in wealth.ts

## Phase 7 — Polish
- ✅ 18 Oct 2026 — Tests (17), phone overflow check on every page, dark mode
- ⬜ Install-to-home-screen (web app manifest + icons)
- ⬜ PayPal CSV import in the app; PDF import in the app
