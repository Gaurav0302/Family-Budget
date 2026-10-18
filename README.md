# Family Purse

A family budget app: every account in one place, sorted into categories, checked against a budget, and reviewed each month against Dave Ramsey's baby steps, The Richest Man in Babylon and the 50/30/20 guide.

Works on desktop, tablet and phone. Published to GitHub Pages; the family's data lives in a private Supabase database that only their logins can open. **No personal data is ever stored in this repository.**

## Pages

- **Home**: what came in, what was spent, what was kept, and what needs attention.
- **Spending**: every transaction. Change a category, add a note, mark a one-off, or teach the app a rule.
- **Budget**: a zero-based budget. Every dollar gets a job, including money kept on purpose.
- **Review**: verdict against recent months, category scorecard, subscriptions, unusual payments, Babylon's seven cures, Ramsey's baby steps, 50/30/20, and monthly notes.
- **Bills**: regular bills found in the statements, what's due next, and prices that went up; add yearly ones by hand.
- **Reports**: a printable monthly money-meeting page (with actions to tick off next month) and a financial-year report for tax time.
- **Goals**: baby steps, cash on hand, university funds, the home loan.
- **What if**: try spending less or cancelling subscriptions and see how much it frees up and how much sooner the loan is gone.
- **Wealth**: net worth (cash, super, shares, home minus loan) and each person's pay and super, with room under the super cap.
- **Add statements**: bank CSVs or a data file prepared by Claude from PDF statements. Duplicates are skipped.
- **Settings**: theme, accounts, categories (add your own, hide unused ones), sorting rules, backup.

The Home page shows red banners only for things that need action now (spending more than came in, the squeeze after a home purchase, rent and mortgage overlapping).

## Running it

Needs Node 22.

```bash
npm install
npm run dev          # http://localhost:5173, add ?demo to keep data in the browser only
npm test             # sorting, importing, monthly numbers, review, privacy guard
npm run build
```

## How data flows

1. PDF statements → `pdftotext -layout` → `tools/parse_statements.py` → raw transactions (amounts checked against running balances).
2. `npm run prepare-import` → a Family Budget data file, sorted with the app's own rules plus the household's private rules.
3. Add the file on the **Add statements** page (or insert through the Supabase connector).
4. `npm run review -- YYYY-MM backup.json new.json` prints the same review the app shows, for writing the monthly note.

See `AGENT-RUNBOOK.md` for the monthly routine.

## Setup (once)

1. Create a Supabase project, create a login for each person, turn off sign-ups, then run `supabase/setup.sql` in the SQL Editor.
2. Put the project URL and publishable key in `src/config.ts`.
3. In GitHub: Settings → Pages → Source: **GitHub Actions**. Every push to `main` tests, builds and publishes.
4. `.github/workflows/keep-awake.yml` pings the database twice a week so the free project doesn't pause.
