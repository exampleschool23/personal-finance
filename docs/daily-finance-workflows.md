# Daily finance workflows

Implemented locally on 24 September 2026. Apply migrations **065–067**, in order, after 064 before deploying this application version. Fresh databases use the matching definitions in `database/setup.sql`. No live database changes have been made by this implementation.

## Where to find the additions

- **Accounts → Reconcile statement:** select the statement period, enter the opening cleared balance immediately before its first day and the closing statement balance, then mark matching entries. Save a draft or reconcile an exact match. The separate **Adjust current balance** action remains an explicit correction.
- **Overview → Available to spend:** account-level estimates with an itemized breakdown of unpaid bills, current goal reservations, remaining monthly expense budgets and a cash buffer. Expected income is a separate scenario. Expand settings to assign budgets and bills to accounts; explicitly identify bills already included in a budget.
- **Income sources / recurring expense forms:** weekly, fortnightly and custom day intervals, alongside monthly/yearly schedules. The Upcoming page supports skipping and restoring individual occurrences; recording a payment still accepts its actual amount.
- **Overview / Upcoming → Reminders:** saved enable/disable and advance-day settings, plus snooze until tomorrow. These are in-app reminders, visible when opening the app. They do not send email/push messages or create payments.
- **Accounts → holding → Investment events:** confirmed gross dividends, withholding, optional reinvestment with fractional shares, stock splits and security transfers. The same-security destination must already exist; its account name identifies it in the selector. Recent events show dividend details.
- **Overview → Financial data health:** missing exchange rates, unavailable/old market quotes, missing opening dates, and account statements needing review.
- **Overview / Income & expenses → Quick entries:** save a recent ordinary transaction as a template, then open a fresh dated copy in the normal form. Templates never save transactions automatically. Deleted account/category references are cleared; a removed preferred currency must be enabled in Settings before using its template.

## Accounting and recovery behavior

Statement matching uses one database projection of actual cashflow, account-operation, trade and tracker cash legs. Derived fee/receipt rows are excluded where the parent operation already accounts for their cash effect. It requires an explicitly entered opening balance; it does not reconstruct unknown history or silently change today's account balance. Direct manual balance edits may have no dated transaction leg and must be investigated as unexplained differences. The saved review contains its ledger snapshot. Previously unchecked entries carry forward into later reviews until marked cleared; their original dates remain visible. Any subsequent account revision conservatively invalidates the match, including a later-period payment. Saving checks both the current account fingerprint and statement revision under the existing owner lock.

Available-to-spend uses ordinary cash accounts, excluding investment cash and illiquid holdings. Goal reservations are deducted once. A bill mapped into a monthly expense budget is counted once: reserve the bill plus only the budget remainder beyond it. Remaining monthly budgets are reserved in full even for an earlier date in the month. Missing assignments, currencies or unresolved debt maturity payments make the allowance unavailable. This is an estimate, not an assertion that a bank balance is verified or that every future obligation has been recorded. Expected income is not included in money available now.

Custom schedules use their original date as the anchor. Month-end monthly schedules return to their original day after shorter months; leap-day annual schedules return to leap day when possible. Weekly/custom monthly estimates count actual scheduled dates in the selected month. Source schedules with recorded payments retain the existing protection against incompatible edits. Skipping an occurrence changes only its scheduling state. A paid occurrence cannot be skipped.

Investment operations are transactional, owner-scoped and retry-safe. They check source/destination revisions and reject events before the latest affected balance update. Dividends record gross income and withholding expense, then optionally a linked purchase; residual cash stays in the selected account. The cash account uses the holding's currency. Splits preserve total recorded value and cost, including fractional shares. Security transfers preserve combined cost and recorded value and create offsetting withdrawal/contribution history. These events are immutable in this first release; they are not a tax-lot engine or tax filing service.

The new statement and investment-event tables participate in owner-isolated backup, restore and account deletion. New exports carry backup schema version 67 so older application databases reject them rather than silently dropping the added data. Unchanged verified schema-59 backups remain supported and restore the new tables as empty. Schedule intervals and daily preferences are included in existing backup tables. Restore keeps the existing signature/manifest and atomic rollback protections.

## Implementation and verification

Shared recurrence calculations live in `lib/finance.ts`; daily planning, reminders, health and template transformations live in `lib/daily-finance.ts`. Forms reuse the shared date/number controls and EN/RU/UZ translations. Business rules are exercised independently of UI.

Focused regression coverage includes calendar anchors and stop dates; paid/skipped occurrences; budget overlap and missing inputs; source/cash precision; template reference cleanup; owner and origin checks; reconciliation conflicts and fractional mismatches; dividend reinvestment; split/transfer cost conservation; rollback after a deliberately failed final write; cross-owner reads/writes; and old/new backup restoration. Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build:production` before deployment. Browser debugging was not performed, following the repository preference.

Final local verification: **476 tests passed**, with no failures or skips. TypeScript, ESLint and the production build passed. The test count covers the current shared workspace, including concurrent portfolio-comparison work.

Import workflows were not changed by this feature implementation.
