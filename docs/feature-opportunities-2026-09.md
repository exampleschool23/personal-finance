> Implementation follow-up: the non-import priorities now have a local first release. See [daily finance workflows](daily-finance-workflows.md) for scope, remaining limits and migration requirements.

# Feature opportunities

Research date: 24 September 2026. Scope: current local source, migrations through 064, and official product documentation. This is a product recommendation, not a deployment audit or evidence of customer demand. Effort labels describe relative implementation complexity, not delivery estimates.

## Recommendation

Prioritize reliable daily decisions: statement reconciliation, transaction review, then an explainable available-to-spend view. Add flexible schedules and reminders next. For an investment-first audience, move dividends and corporate actions ahead of reminders. Confirm usage priorities before committing to bank providers, household sharing, or tax reporting.

The app already implements multi-currency records, goals and funding history, debt payoff planning, portfolio return estimates, allocation targets, spending watchlists, recurring-pattern suggestions, CSV import profiles/undo, reports, and an installable web shell. The latest local changes also implement signed backup restoration and paginated transaction history. These are existing foundations, not new feature proposals; live deployment was not verified in this research.

## Prioritized opportunities

| Priority | Addition | User benefit | First release | Relative effort |
| --- | --- | --- | --- | --- |
| 1 | Statement reconciliation | Explain why the app balance differs from the bank | Statement closing date/balance; cleared and reconciled transactions; difference breakdown; reopening changed periods | Large |
| 2 | Transaction review inbox | Spend less time cleaning imported data | Bulk categorization; suggested transfer/refund matches; pending-to-posted matching when source data supports it; reversible decisions | Medium–large |
| 3 | Available to spend | See what remains after obligations and reservations | Account-specific allowance through a chosen date, itemized commitments, separate expected-income scenario, explicit incomplete-data state | Large |
| 4 | Flexible schedules and reminders | Handle weekly income, renewals and bill deadlines | Weekly/fortnightly/custom intervals, per-occurrence exceptions, in-app reminders, optional delivery channel | Medium–large |
| 5 | Dividends and corporate actions | Keep share counts, cash and investment returns consistent | Confirmed gross/net dividends, withholding, linked reinvestment, stock splits and security transfers preserving cost | Large |
| 6 | Financial data health | Know which numbers need attention | One review view for missing FX, unassigned bills, stale quotes, unverified balances and incomplete history; links to corrections | Medium |
| 7 | Faster everyday entry | Reduce the friction of recording purchases | Reuse the existing form for recent-entry templates and account/category defaults; preview before saving | Small–medium |
| 8 | Credit card workflow | Track purchases, statement obligations and repayments coherently | Dedicated liability account, statement date, due date, minimum and full payment, refunds, fees and interest | Large; depends on actual usage |

Priorities reflect engineering dependencies and likely usefulness, not measured demand. A simpler health view or entry-template improvement can ship alongside the larger reconciliation work.

## What the code establishes

- `migrations/046_scheduled_actual_amount.sql`: the current reconcile action requires today's Tashkent date and sets the cash account amount. It does not match a dated statement against individual cleared transactions.
- `lib/transaction-tools.ts`: account forecasts apply scheduled events to assigned accounts and expose unassigned events. They do not produce a unified allowance incorporating goal reserves and spending budgets. Monthly review already distinguishes actual transactions and several repayment paths; reuse that logic rather than adding another inconsistent definition of spending.
- `lib/finance.ts`: entry frequency is limited to Once, Monthly and Yearly. `lib/recurring-insights.ts` already supplies recurring suggestions; extend it instead of introducing another detector.
- `lib/csv.ts`, `app/api/import/route.ts`, migrations 020 and 038: imports already have mapping, provenance and replay/undo foundations. More formats alone will not solve transfer or pending/posted matching.
- `migrations/050_income_expense_categories.sql`: the former category-rules table was deliberately removed. Earlier roadmap claims about rule support are stale. Start with explicit bulk review; introducing automatic rules again requires a separate product decision.
- `lib/asset-movements.ts`: supported movements are transfer, buy, sell and interest. These operations are not a complete dividend, stock-split or tax-lot model.
- `docs/reliability-and-restore.md`: restore exists locally, including disaster-recovery tests. The old roadmap's “complete backup restore” gap is superseded, although a live recovery exercise and operational configuration still need verification.

## First-release boundaries and correctness requirements

### Statement reconciliation

Build a reusable account ledger projection covering cashflows, transfers, investment movements, repayments, mortgage payments, fees and balance corrections. Every leg needs a stable identity. Establish a dated opening balance when historical activity is incomplete; do not infer a verified history from today's balance.

Compare a statement balance with cleared activity through its date. Show unmatched items and the difference. Treat a balance adjustment as an explicit, audited operation rather than silently hiding the difference. Editing, deleting, restoring or undoing activity in a reconciled period must invalidate or explicitly reopen the affected reconciliation.

Acceptance: month-end statements, imported/manual duplicates, backdated edits, deleted/restored transactions, both transfer legs, fees, multi-currency accounts, same-day ordering, concurrent changes and owner isolation. A matched period must remain explainable from its ledger.

[Actual Budget's reconciliation workflow](https://actualbudget.org/docs/accounts/reconciliation/) provides a useful reference for statement matching, cleared balances and locked transactions. Our historical-ledger requirements are codebase-specific recommendations.

### Transaction review and imports

Build on existing import batches and stable source IDs. Pair own-account transfers without classifying them as earnings or purchases. Keep FX amounts and fees explicit. Link refunds to purchases without deleting the original history. Preserve user categories, splits, goal links and notes when replacing pending records with posted records.

Use a preview for ambiguous matches: two identical purchases can both be legitimate. Bulk changes need conflict detection and transactional failure behavior. Add OFX/QFX or bank-specific mappings only after examining representative, redacted files from banks actually used. Do not reintroduce categorization rules by assumption.

[Actual's import documentation](https://actualbudget.org/docs/transactions/importing/) supports multiple financial file formats and explains how stable transaction IDs and matching reduce duplicates. Our existing CSV source-ID support should remain the foundation.

### Available to spend

Separate “available from money already held” from a forecast that includes expected future income. Show the selected accounts, date horizon, outstanding obligations, goal reservations, remaining variable-spending budgets and minimum cash buffer. A bill included in a budget must be counted once; a paid bill must not also remain outstanding. A goal reservation is not an additional cash movement.

Do not count investment/property wealth as immediately spendable. Keep currencies separate unless explicit positive conversion rates are available. An unassigned bill or missing rate must produce an incomplete result, not a confident positive allowance. Explain every deduction and let the user inspect its source.

[Simplifi's spending plan](https://support.simplifi.quicken.com/en/articles/4212702-understanding-your-spending-plan) is a useful reference for combining bills, planned spending and goals while avoiding duplicate commitments. Its documented plan excludes existing account balances; the proposed account-based allowance would require additional logic specific to this app.

### Schedules and reminders

Use one shared recurrence engine for forecasts, suggestions, calendars and reminder scheduling. Define anchor dates, month-end behavior, leap years, stop dates, skipped occurrences and “this occurrence” versus “future occurrences” edits. Do not approximate weekly events as a fixed monthly amount for due-date calculations.

Start with in-app upcoming/overdue review. Optional email or push needs explicit opt-in, timezone handling, delivery deduplication, retry behavior and suppression after payment. A reminder must never create a payment. [Monarch's recurring view](https://www.monarch.com/features/tracking) documents bill/subscription calendars and reminders as a comparable workflow.

### Investment events

Record confirmed dividend dates and gross/net/withholding values, then connect any reinvestment to the purchase and residual cash. Stock splits change quantities and unit cost without creating an economic gain. Security transfers must preserve cost and must not be classified as new external investment.

Update performance, income reporting, portfolio history, backups and undo together. Test fractional quantities, reinvestment rounding, event ordering, currencies and historical corrections. Tax-lot selection and jurisdiction-specific tax reports should be a later scope, not implied by average-cost tracking. [Sharesight's dividend troubleshooting](https://help.sharesight.com/why-does-my-dividend-look-incorrect/) illustrates why withholding, reinvestment, share counts and conversion dates need distinct records.

### Data health and everyday entry

Aggregate existing missing-data signals rather than calculating another set of totals. Show what is unknown, why it matters and a direct correction action. Quote freshness needs source timestamps; missing history must remain unknown. Backup status should distinguish a downloaded file from a successfully verified recovery exercise.

For entry templates, reuse the existing financial form, `FormattedNumberInput`, `DatePicker`, preferred-currency rules and validators. Templates should prefill fields without saving automatically. Preserve user-entered precision and protect against duplicate submission. Receipt uploads/OCR can follow only if manual capture remains a significant burden; extracted values should first become reviewable drafts.

## Conditional investments

- **Bank/broker sync:** identify countries and institutions first. [Plaid's published coverage](https://support.plaid.com/hc/en-us/articles/27895826947735-What-Plaid-products-are-supported-in-each-country-and-region) lists transaction support in the US, Canada and selected European countries; Uzbekistan is not listed. Its global identity-verification offering does not establish global transaction coverage. This does not prove that no other integration is available. Prioritize usable local statement imports while researching actual institutions.
- **Household sharing:** useful if multiple people need the same budget, but requires explicit account visibility, invitations, roles, revocation and workspace isolation. Current per-owner access is not a household permissions system.
- **Broader portfolio risk:** establish exchange/currency-qualified instrument identity and reliable coverage before adding sector, region or ETF look-through charts. Unknown exposure must remain visible.
- **AI assistance:** consider draft categorization or explanations only after deterministic reconciliation and matching work. Financial writes should remain reviewable and use existing validators; generated calculations must not become authoritative balances.
- **Native/offline finance:** defer until conflicts, account switching, protected storage and recovery semantics are designed. The current network-only PWA is not an offline transaction editor.

## Suggested delivery order

1. Verify deployment and recovery prerequisites for the existing reliability work. Add operational error/snapshot alerts as needed; avoid recording financial payloads in logs.
2. Create the shared account ledger and dated statement reconciliation.
3. Add transaction review/matching, then the explainable available-to-spend view.
4. Extend recurrence and add opt-in reminders, or prioritize investment events if portfolio tracking is the main use case.
5. Select bank integrations, credit cards or household sharing based on actual workflows.

All new persisted entities must join owner isolation, export/restore, delete-account cleanup and migration coverage. Follow the repository's shared formatting/date controls, root migration numbering and behavioral regression requirements. This research changed documentation only; no browser debugging, production changes or new feature implementation was performed.
