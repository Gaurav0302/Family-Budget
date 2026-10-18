# DECISIONS.md

| # | Date | Decision | Why | Affects | Status |
|---|------|----------|-----|---------|--------|
| D1 | 18 Oct 2026 | New standalone app, not a copy of the spreadsheet. React + Vite, a separate page per job, GitHub Pages. | Modern, flexible, reachable anywhere; same stack and "separate pages" preference as the Loan Planner. | Whole build | Agreed (go-ahead 18 Oct) |
| D2 | 18 Oct 2026 | Data in Supabase free plan (replaces the first idea of a private GitHub data repo). | User asked for it. Logins for each person, same data on every device. Trade-offs: pauses after 7 idle days (weekly ping), no free backups (download button). | Data, agent routine | Agreed |
| D3 | 18 Oct 2026 | Review logic: Ramsey baby steps + Babylon's seven cures, with 50/30/20 as a secondary check. | User stated. | Review, Goals | Agreed |
| D4 | 18 Oct 2026 | Never store account/card numbers, BSBs or TFNs. | Privacy. | Everything | Agreed |
| D5 | 18 Oct 2026 | Follow the user's Agent Working Instructions (tracking files over memory). | User stated. | All sessions | Agreed |
| D6 | 18 Oct 2026 | No automated backup job; in-app "Download a backup" plus a monthly reminder in the routine. | A GitHub job would need the secret key and would put backups where a public repo can expose them. | Backups | Decided by Claude, tell user |
| D7 | 18 Oct 2026 | Public repo holds no personal data: household rules, budget, accounts go in a private household file imported with the history; privacy test guards it. | Repo must be public for free GitHub Pages; early code contained school names, friends' names and the rental address. | Code, tests, docs | Decided by Claude, tell user |
| D8 | 18 Oct 2026 | Budget includes "Kept on purpose" lines (savings/offset, shares, uni funds) so the zero-based budget can reach zero. | Without them the budget showed thousands "unassigned". | Budget page | Decided by Claude |
| D9 | 18 Oct 2026 | App name "Family Purse" (from Babylon's fattening purse). | Ties the look to the user's money philosophy; easy to rename. | Branding | Proposed, user can change |
