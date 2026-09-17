# Accounts and planning upgrade

Apply migrations after 017, in this order:

1. `018_accounts_and_planning.sql`: account links, transfers/reconciliation, debt repayments, paid recurring occurrences, goals and categories.
2. `019_budget_versions.sql`: monthly allowance versions and optional positive rollover.
3. `020_statement_import.sql`: atomic, idempotent statement imports.
4. `021_linked_investment_accounts.sql`: cash-linked investment activity and explicit service-role snapshot grants.
5. `022_consistent_backups.sql`: a complete owner backup read from one database snapshot.
6. `023_net_worth_goals.sql`: net-worth goals without cash accounts and saved monthly contribution/return scenarios.

The same SQL is appended to the fresh-database setup. Existing records remain unlinked: adding this feature never retroactively changes cash balances. Cash records are accounts, so they stay in existing asset totals exactly once. Link an existing actual transaction deliberately: saving it then applies its amount to the selected account.

## Account behavior

Only one-time income and expense records can link to an account in the same currency. Inserts affect the account, edits reverse the old effect and apply the new one, and deletion reverses the effect. Restoration reapplies it. Negative cash balances are rejected; the entire operation rolls back.

Transfers update both accounts in one database transaction. For different currencies, enter both sent and received amounts; the displayed rate comes from those explicit amounts. The fee is charged in the source currency. Transfers do not create income or spending other than their fee.

Repayments reduce the outstanding principal and update cash together. Principal is not investment income. Interest received on money lent is recorded as income; interest paid on a loan is recorded as expense. Existing mortgage reporting continues to show the full payment with its principal/interest breakdown. Reconciliation records today's corrected balance, not an income or expense. Operations have stable request IDs: retries do not repeat them. Saved operations are immutable; a subsequent correction is recorded separately.

Investment Tracker optionally uses a same-currency cash account for contributions, withdrawals, actual income and expenses. Its existing dated valuation behavior remains in place. Account-linked events have a separate immutable link so retries cannot move cash twice.

## Upcoming payments

The page shows unpaid monthly/yearly occurrences from their recorded start dates, plus loan due dates and deposit maturity dates. Month-end schedules clip to the final day without drifting in following months. Existing schedules can therefore show earlier unpaid occurrences; a schedule is a plan, not evidence that a historical payment happened. Do not record historical payments that are already reflected in your opening balance unless you intend to adjust that balance. No email or push messages are sent. Sidebar counts and overdue labels are in-app reminders.

Mortgage and loan reminders use the existing due date and outstanding balance; actual principal/interest is entered when paying. Partial repayments leave the outstanding item visible. Dismissing a deposit maturity reminder does not withdraw or close the deposit.

## Budgets and goals

Changing a plan's amount or rollover setting takes effect from the selected forecast month and continues until the next version. Existing budgets are seeded with their currently known amount; previous edits cannot be reconstructed. The start date and currency of an existing budget remain fixed. Positive unused allowance carries forward when rollover is enabled; overspending is not carried as a negative allowance. Earlier months can be reviewed using the existing forecast-month controls. Ending a plan retains earlier spending and versions.

Goal allocations are reservations within an existing cash account, not new assets or transfers. Combined active allocations cannot exceed the account balance when saving. If later spending reduces cash below the reserved total, the goal cards flag the shortfall. Archiving a goal releases its reservation while retaining the goal.

Net-worth goals measure all current assets minus debt in the goal currency, including stock quantities and business ownership. They require no cash account and do not change balances. Existing goals retain their cash reservations and account currency. Select a goal to explore its actual snapshot history, projected path, required path and monthly milestones. Changes to the target, currency, date, archive state and scenario can be saved.

The projection holds existing wealth constant and compounds only new monthly investments at the chosen effective annual return (zero by default). Contributions start on the next monthly anniversary, clip short months without drifting, and earn through the exact deadline using a 365.25-day year. No contribution is assumed immediately. Deadlines before the first contribution cannot be solved by a monthly plan. Planning horizons are limited to 100 years. Taxes, fees, inflation and future FX changes are excluded.

Available surplus uses the current month’s income estimates, active recurring entries, expense plans and mortgage commitments. Missing FX or unavailable budget data prevents a partial surplus estimate; a manual monthly contribution still permits scenario exploration. Net-worth projections pause if any holding cannot be converted. Each goal is a separate scenario, so the same surplus must not be allocated to several savings goals. Savings reservations are already included in net worth. Saving a plan never moves or invests money automatically.

## Imports and backups

Import up to 500 rows / 2 MB per file. Choose the cash account, delimiter, columns, date order and decimal separator, then review and deselect rows before saving. Signed amounts represent inflows and outflows. Start from the balance preceding the imported transactions. A failing row rolls back the whole batch.

Duplicate keys use account, date, description, signed amount and the occurrence index for otherwise identical rows. This makes repeated files safe while retaining identical legitimate transactions within a file. It cannot reliably distinguish partially overlapping files containing different subsets of identical same-day transactions, changed descriptions, or manually entered transactions. Review such files and deselect duplicates. Transfers need the transfer workflow rather than two independent imported income/expense records.

CSV exports include records. JSON backups read all owner-readable record/history/settings/planning tables from one consistent database snapshot and include a version marker. Export fails rather than emitting a partial backup if any table is unavailable. JSON backup restoration is not automated; restoration requires a reviewed migration process to preserve links and avoid replaying balance effects.

## Background capture

Set `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` only in the server environment and deploy the configured Vercel job. The cron endpoint rejects missing or incorrect credentials before any privileged access. It reads holdings on the server, fetches market data with bounded concurrency, and writes only today's Tashkent observation. Missing prices or rates skip affected portfolios and return a failure status with aggregate counts, without exposing account details. Configure hosting alerts for failed cron invocations. Large deployments should replace the single invocation with a queued, paginated worker before exceeding the hosting time limit.

[Vercel cron configuration and authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
