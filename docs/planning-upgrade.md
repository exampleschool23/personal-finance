# Accounts and planning upgrade

Apply migrations after 017, in this order:

1. `018_accounts_and_planning.sql`: account links, transfers/reconciliation, debt repayments, paid recurring occurrences, goals and categories.
2. `019_budget_versions.sql`: monthly allowance versions and optional positive rollover.
3. `020_statement_import.sql`: atomic, idempotent statement imports.
4. `021_linked_investment_accounts.sql`: cash-linked investment activity and explicit service-role snapshot grants.
5. `022_consistent_backups.sql`: a complete owner backup read from one database snapshot.
6. `023_net_worth_goals.sql`: net-worth goals without cash accounts and saved monthly contribution/return scenarios.
7. `024_holding_accounts.sql`: owner-private brokerage/crypto accounts, holding membership and complete backups. Apply this before deploying the updated Accounts page.

The same SQL is appended to the fresh-database setup. Existing records remain unlinked: adding this feature never retroactively changes cash balances. Cash records are accounts, so they stay in existing asset totals exactly once. Link an existing actual transaction deliberately: saving it then applies its amount to the selected account.

## Account behavior

Only one-time income and expense records can link to an account in the same currency. Inserts affect the account, edits reverse the old effect and apply the new one, and deletion reverses the effect. Restoration reapplies it. Negative cash balances are rejected; the entire operation rolls back.

Transfers update both accounts in one database transaction. For different currencies, enter both sent and received amounts; the displayed rate comes from those explicit amounts. The fee is charged in the source currency. Transfers do not create income or spending other than their fee.

Repayments reduce the outstanding principal and update cash together. Principal is not investment income. Interest received on money lent is recorded as income; interest paid on a loan is recorded as expense. Existing mortgage reporting continues to show the full payment with its principal/interest breakdown. Reconciliation records today's corrected balance, not an income or expense. Operations have stable request IDs: retries do not repeat them. Saved operations are immutable; a subsequent correction is recorded separately.

Investment Tracker optionally uses a same-currency cash account for contributions, withdrawals, actual income and expenses. Its existing dated valuation behavior remains in place. Account-linked events have a separate immutable link so retries cannot move cash twice.

## Investment accounts and deposits

Accounts now includes cash balances, interest-bearing deposits, and named stock/crypto accounts. Investment accounts are containers, not extra finance records: they have no independent balance and do not add to net worth. Their display currency converts the sum of their holdings using explicit available rates. If any holding cannot be converted, the total is unavailable rather than partial. Quotes use the existing market data with saved-price fallback.

Choose Stock account or Crypto account, name it, then add multiple holdings. Existing holdings remain unassigned until the user deliberately assigns them. Holdings can be moved or unlinked from Accounts or the record form without changing value, purchase cost, history, income, or cash. A composite owner foreign key and type guards reject foreign-owner and wrong-kind links. Containers cannot change kind while populated. Cash balances can also belong to these accounts. Savings reservations still use actual cash accounts only.

Choose Interest-bearing deposit to enter a balance, annual interest rate and maturity date. Manage deposit opens the existing dated tracker for top-ups, withdrawals and interest received. Estimates follow dated balances and the selected monthly, daily, or non-compounding schedule. Projected interest does not mutate confirmed bank balances. Recording income can credit an explicitly selected cash account in the same currency. For capitalized interest, use Record capitalized interest once; it credits the deposit and records the income atomically. Do not also add the estimate as recurring income. The planning data includes deposit estimates once, so the goal surplus includes them. Stock tracker income is labeled Dividends / income.

Cash/deposit records and new holdings use the existing record API; containers and assignments use `/api/holding-accounts`. Account containers and record membership are included in JSON backups. Restoring a holding still requires its original matching account. Demo containers and assignments stay in memory; dated investment tracking requires sign-in.

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


## Trades, proceeds and deposit movements

Apply `025_asset_movements.sql` after `024_holding_accounts.sql`. Fresh databases use the updated `database/setup.sql`.

If SQL Editor reports a deadlock (`40P01`) while running the entire migration, that transaction is aborted; its schema changes do not commit. Run `ROLLBACK;` if the editor still has an aborted transaction, then rerun the full updated migration. Close active finance app tabs and let other SQL queries finish first; do not run concurrent copies. The migration now acquires its main table locks with `NOWAIT`, releasing all preflight locks between bounded retries. Later implicit lock waits are limited to 500 ms. A busy-database (`55P03` / lock timeout) failure remains safe to retry in full after contention clears. Do not drop existing tables or terminate database sessions. A successful migration is applied once; this file is not a general-purpose rerunnable setup script.

Stock and crypto accounts can contain fiat Cash records as well as holdings. Create a zero-balance cash record inside the account to hold proceeds. Cash is counted once in asset totals. USDT and USDC remain Crypto records with their own quantities and fiat valuations; they are never treated as dollars automatically.

Use Buy or Sell / convert on a holding. A sale reduces its quantity and credits the selected fiat balance or crypto holding. A purchase debits cash or crypto and increases the bought holding's quantity and weighted purchase cost. Full sales retain the holding with zero units and its unit quote unchanged. Crypto-to-crypto trades require explicit fiat values; conversions between valuation currencies require an explicit value on each side. Fees are included in the entered totals and recorded as expenses without a second deduction. For example: sell BTC for USDT, sell USDT into a fiat cash balance, then transfer that cash to a deposit or select it for a mortgage payment. Stock sale proceeds follow the same cash path. These actions record transactions; they do not execute orders with a broker or bank.

Transfer money supports Cash and Deposit sources/destinations, including cash inside investment accounts. Enter the total debited and net amount credited; in the same currency, net credit equals total debit minus the included fee. Other currencies require the actual net amount received. Deposit cards and the tracker provide Top-up, Withdraw and Record capitalized interest actions. Mortgage payments continue to debit the selected same-currency cash account and split principal from interest.

An explicit Opening balance date is available when creating a Cash, Deposit, Stock or Crypto record. Without it the initial balance is observed today. Enter transactions in chronological order: a movement earlier than either account's latest balance snapshot is rejected, rather than silently overwriting newer history. Existing snapshots and balances are not rewritten.

Deposit projections apply changes at the start of the recorded date. Monthly compounding uses annual rate / twelve weighted by the number of days at each balance; earned interest joins the projected principal at the next month boundary. Daily compounding uses the actual calendar year's day count. No compounding estimates interest without adding it to principal. Current annual rates apply throughout the projection; historical rate changes are not modeled. A confirmed valuation or capitalized-interest credit replaces the projected balance so the same interest is not added twice. Confirm actual bank interest with Record capitalized interest before spending it; the estimated balance is clearly labeled in the tracker. These projections are separate from the confirmed account balances used in net worth and transfers.

The movement ledger, quantity/cost changes, dated histories, fees and interest income commit in one transaction with owner checks and repeat-safe IDs. Failures roll back all changes. The immutable ledger is included in JSON backups.


## Instrument selection

The holding form has searchable crypto and stock/ETF pickers. The crypto catalogue contains 48 named coins, including Toncoin (TON); the stock catalogue contains 68 USD-listed stock/ETF suggestions. Search by company/coin name or symbol. A stock ticker outside the suggestions can still be selected by typing it and choosing Use ticker. Existing crypto names and stored stock symbols remain compatible, and selecting the same instrument preserves its saved unit price.

The catalogue does not guarantee a live price for every listing. Crypto quotes use Coinbase's public USD spot endpoint; stock quotes use the existing authenticated Twelve Data connection and require `TWELVE_DATA_API_KEY`. Missing prices retain the entered/saved price. TON/USD was verified against Coinbase's live endpoint during this change. Refreshes use sequential batches within the existing endpoint limits, covering portfolios beyond the previous 16-crypto/20-stock boundary; failed batches identify missing prices without hiding successful quotes. These picker changes require no database migration.


## Stock and crypto accumulation goals

Apply `026_investment_goals.sql` after migration 025. It adds investment goals without rewriting existing cash or net-worth goals. As with migration 025, run the complete file once and allow other queries to finish first. The migration takes its required locks with `NOWAIT` before changing the schema and limits implicit lock waits; if contention aborts it, roll back the failed transaction and retry the entire file after contention clears.

Choose Stock / crypto accumulation, select the investment account and coin or stock, and enter the target quantity. For example, target 1 BTC or 100 AAPL shares. Empty investment accounts are allowed: the goal starts at zero until matching holdings are added or purchased. Holdings with the same symbol in the chosen account are summed, including legacy crypto names. Other coins, other accounts and cash balances are excluded. Stock/crypto price changes do not advance a quantity goal. Buying, selling or reassigning holdings updates progress when the records refresh.

The accumulation plan uses units per month and an optional target date. It assumes no investment return and does not place trades, reserve holdings or change balances. The required monthly quantity rounds upward to eight decimals; explicitly entered quantities retain their precision. Multiple tracking goals can observe the same holdings. Archived goals retain their settings. Account ownership and matching investment kind are enforced when saving; changing an account type is blocked while goals refer to it. The existing backup includes all goal fields.

The Archived and Show archived goals controls use the shared checkbox component with fixed checkbox sizing, avoiding the monetary-input styles that previously enlarged the Archived checkbox.


## Multiple holdings in one goal

Apply `027_multi_holding_goals.sql` after `026_investment_goals.sql`, then deploy the updated app. The fresh setup includes both migrations. Existing single-holding goals are backfilled without changing their quantities, monthly contributions, names, dates, or archive status.

Use **Add another holding** in the goal editor to add a separate account, coin/stock, and target quantity (up to 50 targets). A goal can combine crypto and stock accounts. Repeating the same instrument in the same account is rejected; the same symbol can be tracked separately in different accounts. Removing a target removes only that goal target, not its holdings or transactions.

Cards show each target's held and desired quantities. Overall progress is the equally weighted average of the targets' completion percentages, each capped at 100%; excess BTC cannot compensate for missing shares. Each target has an independent monthly unit contribution and projection, with the common goal deadline. No quantities of different instruments are summed and no market return is assumed to create units.

Targets are saved atomically inside the owner-scoped goal. Database validation checks all account ownership/type references; linked accounts cannot change identity/type or be removed until their targets are updated, including archived goals. Legacy scalar columns mirror the first target for compatibility. An older client cannot overwrite a multi-holding goal with a single target accidentally. JSON backups include every target automatically.

If additional coins disappear after Save, check that migration 027 has actually been applied to the connected database. The older save function accepts the targets payload but ignores it, retaining only the first holding. The API now checks for the targets column before saving investment targets, so a missing migration leaves the editor open with an error rather than reporting success. The goal editor keeps Save and errors outside the scrolling fields. Regression coverage reproduces the old behavior and verifies editing a 4 BTC goal to include 30,000 TON after migration.

## Cash account linking across currencies

Apply `034_cashflow_account_conversion.sql` after migration 033 before deploying this app update. It adds stored dated conversion metadata for linked income/expenses and scheduled payments, and atomic cross-currency repayments with interest. Existing same-currency records retain their original values. Fresh databases include this change in `database/setup.sql`.

All cash accounts are offered regardless of currency. The form previews the dated rate and cash amount; the server independently verifies it before saving. Edits reverse the original stored conversion before applying the new amount. Retries reuse saved rates, and missing rates prevent a cross-currency write.

## Income and expense categories (050)

Apply `050_income_expense_categories.sql` before deploying this category UI. Settings now adds named categories separately for income and expenses. The migration replaces `custom_categories` with `transaction_categories`, removes the categorization rules table and trigger, and updates backup and planning functions. Existing references remain valid; categories used for both income and expenses receive a separate income copy, including references in Recently deleted. The legacy `custom_category_id` reference column is retained for existing records and CSV compatibility. Transaction amounts and cash-flow calculations are unchanged.

## Category deletion (051)

Apply `051_category_deletion.sql` before using category deletion. Added categories show a remove button. The confirmation checks active transactions/schedules (including splits), Recently deleted records and spending watchlists. Used categories require a same-direction replacement, either existing or created in the dialog. The RPC rechecks usage and performs reassignment and deletion atomically under the owner lock. Generated payment records permit category-only updates; their financial fields remain protected. Direct category deletion is revoked for authenticated users. Built-in financial kinds are not deleted by this migration.
