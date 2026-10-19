# SESSION-HANDOFF.md

## Current status (19 Oct 2026, late night)
Latest: budget frequencies (D29). Suggestions on the user's data: cleaner $110 weekly, YMCA swimming $39.70 fortnightly (budget was $362/month), school ~$906/term, tennis ~$569/term (Term 4 paid in September), martial arts ~$523/term (Term 4 due October), scouts ~$334/term. With those accepted the forecast (test copy) shows ~$141k before settlement, ~$75.6k after, Dec–Mar about $768/month drawn ($3,073), Term 1 fees in January, lowest ~$72.5k in March, ~$1,818/month kept on average from April (10%). Yearly costs (rego etc.) still need due months from the user.

## Earlier status (19 Oct 2026, night)
Latest: one forward plan (D28). Property page (the home first; adding an investment is one form), the Loan Planner calculator and dashboard on real figures, a cash forecast to June 2027 used by Home, Goals, What if, Property and the money meeting's new "Looking ahead" step, Uni funds page. Private file 'Family Purse - property 19 Oct 2026' carries the property (price, deposit paid 10 Oct, stamp duty estimate $62,157.50 at the general rate, $3,500 fees estimate, rates/water/insurance, loan). Numbers on the user's data: about $140,092 cash before settlement, $74,435 after, lowest $68,616 in March 2027 (4.1 months of spending); Dec–Mar about $1,455 a month drawn from savings; from April about $1,326 kept (7%). Loan paid off Feb 2047 at real spending (Loan Planner's own defaults gave Jan 2042 with $6,000 living).

## Earlier status (19 Oct 2026, evening)
Latest: Statements page with month checks (D27). Private file 'Family Purse - statement balances 19 Oct 2026' carries each statement's opening/closing balance (all tie to the cent). Feb–June are missing Reeti's two accounts and the card (before 22 June); July is fully checked; Aug/Sep only need payments sorted.
Also pushed since: theme-independent meaning colours (D24), 50/30/20 green-within colours (D25), money meeting agenda with Present mode (D26).

## Earlier status (19 Oct 2026, late afternoon)
Fifth build pushed: no reload on returning, 54 themes (light and dark, per person), split payments, PayPal activity CSV naming (D20–D22). Before that, the fourth build: own areas and ⋯ menus, compact drill-downs with charts, dynamic charts everywhere (Trends page, per-area charts in the money meeting), accounts by person, clearer Wealth (D17–D19). Before that, the third build: payee list, Categories & payees page, drill-downs, Accounts page, Wealth fixes (owned-since, editable history, line chart) and the money meeting redesign (D13–D16). Waiting on the user to add the 19 Oct update file and check their payees.

## Done
- 18 Oct 2026: All core pages, review engine, importers, Supabase storage, workflows; history Feb–Oct 2026 (627 transactions, reconciled to the cent). Household details kept out of the code (D7).
- 18 Oct 2026: Bills, Reports, What if, Wealth, alert banners, kids and custom categories.
- 19 Oct 2026: Payees (built automatically from existing transactions the first time the app loads; all start as "to check"). Drill-downs on Home, Review, Budget, money meeting. Accounts page. Wealth owned-since and line chart. Update file "Family Purse - update 19 Oct 2026" (private): account last 4 digits and banks, house and loan from settlement, 25 month-end balances worked back from statements so the chart starts June 2026. `prepare-import` now does that back-calculation itself.

## Next
0. User: Add statements → "Family Purse - property 19 Oct 2026" → Apply update. Then Property → the home → Buying: replace stamp duty and fees with the conveyancer's figures when they arrive.
0. User: download PayPal activity (1 Feb–30 Jun 2026, CSV) and add it on Add statements; split the $6,176.40 (15 Jun) if it covered several things. Pick a theme in Settings → Look.
0. User: Categories & payees → check the new Government area; move Home Affairs / VFS payees to "Visa, PR & citizenship" if needed. Sort PayPal Australia (in Other).
1. User: Add statements → the 19 Oct update file → Apply update.
2. User: Categories & payees → Payees → To check: fix any wrong category, then "Looks right" (or tick all). Create a category like "India home upkeep" and move the money-to-India payee if that's what it is.
3. User: Wealth → tap the India house and shares: "Before our records start" is the default; set a date only if bought recently.
4. Next session: October statements → monthly routine (AGENT-RUNBOOK.md), using `--payees` with the user's latest backup.

## Known issues
- Lines switched to a new frequency before the 19 Oct 20:55 fix kept the monthly total (e.g. martial arts showed $1,230 a term): the user needs to retype those amounts.
- Theme fonts come from Google Fonts (blocked in this workspace, so local screenshots show fallback fonts).
- PayPal purchases paid from a PayPal balance never reach the bank, so the app can't see them.
- The workspace can't reach supabase.co; Supabase saving of the payee list (settings key `payees`) is untested from here. First real use is the test.
- Charts read the categories' current areas; renaming an area renames it everywhere, including past months.
- Changing a payee's "description contains" wording re-sorts payments that now match it, but not ones that stop matching (they keep their category until changed).
- Subscriptions seen only once are treated as yearly until a second payment appears.

## Got wrong this session
- The needs/wants/kept bar took its colours from the theme, so they meant nothing (wants looked fine while over guide), and the verdict compared spending without one-offs against averages with them. Fixed (D23): status colours with words, like-for-like sentence.
- Chart tooltips first sat above the plot and covered the time span buttons; they now sit beside the hovered month. Menus inside scrolling sheets were cut off; they're now fixed to the screen.
- The drill-down sheet stayed open after moving to another page; fixed by closing it on navigation and Escape. Test flows across pages, not just one page.
