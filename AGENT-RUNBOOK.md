# Monthly routine for Claude sessions

Use this when the user gives you new statements ("add these to Family Budget and review the month").
Household context (accounts, private sorting rules, research) lives in the claude.ai Project **Personal Finance**, folder `family-budget/`. Never commit personal data to this public repository.

## 1. Get ready
- Read `CLAUDE.md`, `DECISIONS.md`, `SESSION-HANDOFF.md`, `BACKLOG.md` here, and the Project's `family-budget/` docs.
- Clone this repo, `npm ci`. Make a `private/` folder (git-ignored) for all household files.
- From the Project, read `family-budget/private/household.json` into `private/household.json`.
- Ask the user for the latest backup (app → Settings → Download a backup) so the review can compare with earlier months. If the Supabase connector is on, you can read the tables instead.

## 2. Turn statements into a data file
Since D34 the family can add CommBank and Macquarie PDFs themselves on Statements → Add statements (read on their device, same ids as below). Use this section for other banks, PayPal PDFs, or when they'd rather hand the PDFs to you.
```bash
pdftotext -layout statement.pdf private/statement.txt
python3 tools/parse_statements.py private/parsed.json ACCOUNT:FORMAT:private/statement.txt [...]
```
The family can also add PayPal's activity CSV in the app (Add statements) to name PayPal payments themselves.
Formats: `cba_summary` (CommBank "Transaction Summary" letters and the credit card), `cba_statement` (formal CommBank statements), `macquarie`, `paypal` (only used to name the merchant behind PayPal debits).
Account keys are in `household.json` → `settings.accounts`. Match each statement to its account by the last 4 digits (`last4`); if a statement's last 4 isn't there, it's a new account: ask the user, then add it on the Accounts page.

**Check every account reconciles**: the sum of parsed amounts must equal closing minus opening balance. Don't continue until it does.

```bash
npm run prepare-import -- private/parsed.json private/import.json \
  --household private/household.json \
  --coverage ACCOUNT=YYYY-MM-DD..YYYY-MM-DD   # one per statement: the period it covers
  --balance ACCOUNT=YYYY-MM-DD:CLOSING        # closing balance of EVERY account (earlier month-ends are worked out from it)
  --payees private/backup.json                # sort with the family's payee list, so imports follow their choices
  --statement ACCOUNT=FROM..TO:OPENING:CLOSING # each statement's printed opening and closing balance (the app's Statements checks prove nothing was missed)
```
The printout shows each month as complete or partial, with income, spending and money kept.

## 3. Review the month
```bash
npm run review -- YYYY-MM private/backup.json private/import.json
```
Write `private/review.md` from it, in plain English for a non-technical reader:
- One-line verdict: heading the right way or not, with the numbers.
- What went well and the habit behind it (specific, no hollow praise).
- The top three things to change, each with a dollar figure and one concrete action.
- Progress on Babylon's tenth, the current Ramsey baby step, and anything coming up (bills, settlement).
- Any pay change the review flags ("pay changed"), and a reminder to update super balances every few months.
- No "not financial advice" disclaimers.

Then rebuild the file with the note attached: add `--review YYYY-MM:private/review.md` to the prepare-import command.

## 4. Deliver
- Send `private/import.json` to the user with step-by-step: app → Add statements → choose the file → Add.
- Or, if the Supabase connector is on, upsert the rows into `transactions`, `coverage` and `reviews` (column names in `supabase/setup.sql`).
- Check the app's Statements page for that month: every account in, every check green. Tell the user exactly which statement is missing if not.
- Remind them to sort anything under "Needs your input" (and new payees under Categories & payees → To check) and to download a fresh backup.
- Update `SESSION-HANDOFF.md` and `BACKLOG.md` (here) and the Project docs if household facts changed.

## Settings in data files
Settings in a data file never overwrite what the family changed in the app: lists (balances, pay, super balances, bills, wealth items) are joined, and single values only fill blanks. Rules with the same id replace the old rule and everything not sorted by hand is re-sorted. So a monthly file can safely carry `--household`.

## Gotchas
- Money moving between the family's own accounts is a transfer, never spending. Check new account numbers' last four digits against the transfer rules.
- Credit card repayments are transfers once card statements are loaded (`cardItemisedFrom`); count the card's own items instead.
- PayPal "Transfer to PayPal account" and currency-conversion rows are funding rows: never import them as spending.
- Ids are `account:date:amount:nth-on-that-day`, so the same item from a PDF and a CSV is one transaction.
