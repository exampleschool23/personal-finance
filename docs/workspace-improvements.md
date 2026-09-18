# Workspace improvements

Apply `migrations/035_transaction_tools.sql` after migration 034 on an existing database. Fresh installations use `database/setup.sql`, which includes the same changes. No production migration is run by the application.

## Daily use

- Overview starts with upcoming obligations, remaining budget by currency, and a setup checklist. The checklist links to currency preferences, account opening balances, budgets, and import.
- Income & expenses opens with actual monthly results. Plans and forecasts are explicitly separate. New income defaults to a one-time receipt; select a repeat interval to create a schedule.
- Filters persist separately for each record section, reset between owners, and do not trigger server requests for local search edits. Moving the start date beyond the end clears the end date. Mobile filters collapse behind an accessible disclosure.
- Settings has a retry control, category rules, CSV import review, and export/backup links.
- CSV export contains raw records for reference, not a restorable bank statement. The importer rejects that export format to prevent expenses, assets and schedules from becoming income. JSON backup restoration is not implemented yet.
- Account and asset pages explain their relationship and link to one another. Missing exchange-rate coverage is labeled next to headline totals.
- Goal charts fit mobile widths. Exact amounts remain available in tooltips and the monthly milestone table.
- Shared discard prompts protect record, account, budget, goal, tracker, movement and payment dialogs. Settings, import, rules, and goal projection editors warn on link navigation and browser unload when changed.

## Categorization and splits

Rules match literal, case-insensitive text in new transaction names. Lower priority numbers run first; rule IDs break ties. Disabled rules are ignored. A database trigger applies the same rules to manual entries, scheduled receipts, and bank imports. Explicit categories and existing transactions are preserved. Rules can be disabled, reprioritized or deleted; replacing a rule changes future classification only.

Use **Split** in transaction history for ordinary income or expense entries. Add at least two positive category amounts equal to the original amount, or clear all parts. Splits allocate a single existing transaction; they never insert extra cash movements. Change or clear a split before changing the transaction amount, currency or type. System-generated payment and fee records cannot be split. Splits appear in the monthly spending breakdown, are included in backups, and survive deletion/restoration.

All new tables use owner policies and owner-constrained references. Split replacement is atomic and repeatable. Failed validation restores the previous split. Restoring a split fails atomically if its required categories no longer exist.

## Forecast and review assumptions

Account forecasts use current cash balances and unpaid recurring schedules through the chosen date. Assign each schedule to an account in the same currency. Unassigned or mismatched schedules remain visibly excluded. Overdue occurrences are projected today; outflows precede inflows on the same date to expose potential shortfalls. Forecasts never move money. Budgets, unscheduled expenses, transfers, investment values and maturity reminders are not cash-flow assumptions.

Monthly reviews use original-currency, actual transactions through today, with a full previous-month comparison. They exclude recurring schedules and future-dated transactions. Mortgage interest is an expense; principal is not. Income minus expenses is a savings measure, not an available cash balance. Category allocations count once. Net-worth change uses saved snapshots and their own exchange rates, shows the observation dates, and is unavailable without a pre-month observation and an observation within the month.

## Verification

Regression tests cover filter scopes and date changes, decimal split equality, classifier priority/direction, forecast exclusions and shortfalls, monthly accounting, component accessibility, discard behavior, read/write failure recovery, API validation, RLS, import deduplication, atomic splits, backup and deletion/restoration. SQL tests use isolated PGlite databases, including the incremental upgrade path. Use `npm test`, `npm run build:production`, `npm run typecheck`, `npm run lint`, and `npm run test:integration`.

No browser debugging or production database writes are required for these checks.
