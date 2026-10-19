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

## Phase 6c — Grip on categories (approved 19 Oct 2026)
- ✅ 19 Oct 2026 — Payee list: built from history, To check / Ask each time filters, change all past or only new, combine payees, "description contains" wording (D13)
- ✅ 19 Oct 2026 — Categories & payees page: categories by area with their payees, add/hide categories
- ✅ 19 Oct 2026 — Drill-downs from Home, Review, Budget and the money meeting; move a payee or one payment (D16)
- ✅ 19 Oct 2026 — Money meeting: needs/wants/kept tiles, budget-and-targets table by area, next month's targets (D16)
- ✅ 19 Oct 2026 — Accounts page: bank, last 4, opened/closed, money moved to, balance history (D15)
- ✅ 19 Oct 2026 — Wealth: owned-since, edit/delete values and items, line chart (D14); month-end balances worked back from statements
- ✅ 19 Oct 2026 — Tests (36), phone overflow check on new pages
- ⬜ User adds the 19 Oct update file, then checks payees under Categories & payees → Payees → To check
- ⬜ User sets "owned since" for anything added on the Wealth page that isn't long-held (default: before records)
- ⬜ After settlement: add the offset account(s), close the old savings with "money moved to"

## Phase 6d — Easier to read, charts everywhere (approved 19 Oct 2026)
- ✅ 19 Oct 2026 — Own areas, rename/move/hide via ⋯ menus; Government area (D17)
- ✅ 19 Oct 2026 — Compact drill-down with a month chart on top (D19)
- ✅ 19 Oct 2026 — Money meeting: came in vs spent chart, one chart per area, trend column, "planned for" wording; plan on Home
- ✅ 19 Oct 2026 — Trends page: compare areas or categories, or see the make-up, any time span (D18)
- ✅ 19 Oct 2026 — Accounts by person with colour by kind; Wealth panels for cash and super; plain "when did you get it" question
- ⬜ User moves Home Affairs / VFS payees into "Visa, PR & citizenship" if they show under Government & official fees
- ⬜ PayPal Australia ($6,248 in June) sits in "Other / not sure yet": sort it so the Other spike disappears

## Phase 6e — Themes, splits, PayPal (19 Oct 2026)
- ✅ 19 Oct 2026 — No reload when coming back to the app (D20)
- ✅ 19 Oct 2026 — 54 themes × light/dark, per person, contrast-tested (D21)
- ✅ 19 Oct 2026 — Split a payment into parts; notes and bank wording in drill-downs (D22)
- ✅ 19 Oct 2026 — PayPal activity CSV names PayPal bank payments in the app (D22)
- ⬜ User downloads PayPal activity 1 Feb–30 Jun 2026 and adds it, to name the 8 unnamed PayPal payments ($7,207, incl. $6,176.40 on 15 Jun)
- ✅ 19 Oct 2026 — Needs/wants/kept bar with meaningful colours, a guide row, and a like-for-like verdict (D23)
- ✅ 19 Oct 2026 — Theme colours never carry meaning; fixed status/data colours across the app (D24)
- ✅ 19 Oct 2026 — Guide colours: green within, amber/red past it (D25)
- ✅ 19 Oct 2026 — Money meeting as an agenda with Present mode and one-tap actions (D26)
- ✅ 19 Oct 2026 — Statements page: month-by-month checklist and six checks; banners and Draft marking (D27)
- ⬜ User adds the statement balances file (proves Feb–Oct statements add up)
- ⬜ Reeti's statements before July and the card before 22 June, if they can be downloaded, to complete Feb–June
- ⬜ Font loading is from Google Fonts; consider self-hosting fonts if offline use matters

## Phase 6f — One plan: property, loan, forecast, uni funds (approved 19 Oct 2026)
- ✅ 19 Oct 2026 — Loan Planner calculator brought in with its tests (src/loan), fed by real figures
- ✅ 19 Oct 2026 — Property page: list of properties; Overview (loan dashboard), Buying, Loan, Costs & rent, Scenarios; Add a property (home or investment)
- ✅ 19 Oct 2026 — Forecast to next June from bank balances; same story on Home, Goals, What if, Property and the meeting ("Looking ahead" step)
- ✅ 19 Oct 2026 — One "left to give a job" everywhere; meeting plan step gives it a job in one tap; Budget months-ahead strip
- ✅ 19 Oct 2026 — Uni funds page (each fund over time, goal, in the budget month by month); uni and forecast findings in the meeting
- ⬜ User: Add statements → "Family Purse - property 19 Oct 2026" → Apply update; check the buying costs against the conveyancer's statement when it arrives
- ⬜ User (optional): Loan Planner → Settings → Save a backup file, send it to bring saved plans across
- ⬜ After settlement: add the loan and offset accounts, pick them on Property → Loan so real balances drive the payoff date
- ⬜ Investment properties: tax (negative gearing, depreciation) not modelled yet

## Phase 7 — Polish
- ✅ 18 Oct 2026 — Tests (17), phone overflow check on every page, dark mode
- ⬜ Install-to-home-screen (web app manifest + icons)
- ⬜ PDF import in the app
