# Goal, portfolio, and personal-finance feature research

Research date: 18 September 2026. Compared official product/help documentation for Monarch, YNAB, Quicken Simplifi, Actual Budget, Sharesight, Portfolio Performance, and Ghostfolio against this repository. This is a representative comparison, not a statistical survey of what “most apps” have. Product documentation confirms advertised behavior, not independent reliability, regional availability, or plan entitlement.

**Implementation update:** the gap tables below record the research baseline before the latest feature batch. Use [the implementation ledger](roadmap-implementation.md) for current shipped-local versus outstanding status. Shared funding, goal activity/scenarios, payoff, allocation, return estimates, watchlists, richer import review, recovery and the PWA shell have since been added locally.

“Present” below means implemented in the current working tree. It does not mean deployed or verified in production. Migration 035 is tested locally but still awaits access to the correct Supabase account. Several transaction tools depend on it.

## Recommended product direction

Connect three questions in one workflow:

1. What money is available after obligations?
2. How should the user allocate that money among their goals?
3. How much progress came from saving versus investment performance?

The strongest opportunity is an understandable, multi-currency path from everyday transactions to long-term goals. The existing EN/RU/UZ support, cash/deposit tracking, private businesses, property, lending, and stock/crypto accumulation provide a useful foundation. The assumption for the initial roadmap is individual users managing multiple currencies; audience confirmation remains open. This positioning is a product hypothesis to validate with users, not a demonstrated market-size claim.

## What is already present

| Area | Existing capability | Evidence |
| --- | --- | --- |
| Goals | Cash savings, net-worth targets, stock/crypto quantity goals, multi-holding goals, deadlines, monthly contributions, assumption sliders, projected paths, archive | `lib/planning.ts`, `lib/goal-projection.ts`, `lib/investment-goals.ts`, `components/planning/goals-page.tsx` |
| Goal reservations | Cash allocations and warnings when goal reservations exceed an account balance | `components/planning/accounts-page.tsx`, `components/planning/goals-page.tsx` |
| Portfolio | Multiple holding accounts, buys/sells, fees, average-cost updates, recorded realized gains, manual dividend/income entries, valuation history, daily snapshots | `lib/asset-movements.ts`, `lib/investment-history.ts`, `migrations/025_asset_movements.sql`, `docs/portfolio-snapshots.md` |
| Benchmarking | Actual investments compared with the same dated cash flows into BTC and selected alternatives | `docs/investment-comparison.md`, `lib/actual-investment-performance.ts` |
| Daily finance | Income/expenses, categories, versioned monthly budgets/rollover, linked cash accounts, transfers, repayments, mortgage payments, recurring schedules and upcoming items | `docs/planning-upgrade.md`, `lib/planning.ts` |
| Data entry | CSV preview/import and duplicate keys, a current-balance correction operation, scoped search/filtering, Recently deleted, JSON backup and raw CSV export | `components/data-tools.tsx`, `components/planning/account-operation.tsx`, `lib/record-filters.ts` |
| New transaction tools | Categorization rules, category splits, account forecasts, actual monthly reviews | `migrations/035_transaction_tools.sql`, `lib/transaction-tools.ts` |

Do not rebuild those features under new names. Extend their models and calculations.

## Goal-tracker gaps

| Gap | Current state and concrete addition | Competitor evidence | Priority |
| --- | --- | --- | --- |
| Shared funding plan across goals | **Partial.** Each goal can compare its planned contribution with the same overall surplus. There is no combined monthly commitment or priority allocator. Add one funding pool, ordered priorities, per-goal allocations, and a visible remaining/overcommitted amount. | Monarch documents priorities and goal allocations; Simplifi includes goal contributions in its monthly plan. [Monarch goals](https://help.monarch.com/hc/en-us/articles/44373110771860-Introducing-Goals-3-0), [Simplifi spending plan](https://support.simplifi.quicken.com/en/articles/4212702-understanding-your-spending-plan) | First feature release |
| Goal contribution and withdrawal ledger | **Partial.** Saved allocation totals exist, but no dedicated dated goal-event ledger/transaction-link workflow was found. Add contributions, withdrawals, transfers between goals, and actual-versus-planned funding history without moving bank money. | Monarch supports allocations and transaction links, including spending against a goal. [Goal activity](https://help.monarch.com/hc/en-us/articles/44373110771860-Introducing-Goals-3-0) | First feature release |
| Flexible target behavior | **Missing beyond ordinary deadlines/archive.** Add refill-to-target, recurring savings targets, pause this month, milestone completion and resumption. Distinguish a reusable emergency fund from a one-time purchase. | YNAB supports weekly/monthly/yearly/custom targets, refill behavior, and target snoozing. [Targets](https://support.ynab.com/how-to-use-targets-rk5kkI9ks), [Snoozing](https://support.ynab.com/en_us/snooze-a-target-HyS4E5rZT) | Next |
| Debt-payoff goals | **Partial.** Liabilities, repayments and mortgage calculations exist; a coordinated payoff strategy does not. Add a payoff date, planned extra payments, interest comparison, and snowball/avalanche scenarios. | YNAB's loan planner projects payoff and interest savings; Monarch provides payoff scenarios. [YNAB loan planner](https://www.ynab.com/whats-new/introducing-ynabs-loan-planner), [Monarch debt goals](https://help.monarch.com/hc/en-us/articles/44373110771860-Introducing-Goals-3-0) | Next |
| Scenario comparison and purchasing power | **Partial.** A single adjustable scenario exists. Add saved conservative/base/optimistic cases, an explicit inflation assumption, a missed-contribution month, and target-date comparison. Current projection holds starting wealth constant and compounds only new contributions; preserve that disclosure or introduce an explicit invested-capital model. | This is a recommended planning extension, not claimed universal parity. | Later, after funding ledger |

Example of the first gap: two separate goals can each appear affordable against the same monthly surplus even when their combined contributions exceed it. The existing reservation checks protect allocated cash; they do not coordinate future monthly funding. `goalFinancials()` takes records and budgets, not other goal commitments, and each `GoalForecast` receives the resulting surplus independently.

## Portfolio-tracker gaps

| Gap | Current state and concrete addition | Competitor evidence | Priority |
| --- | --- | --- | --- |
| Annualized and cash-flow-adjusted performance | **Missing.** Current benchmark return is explicitly cumulative profit divided by gross contributions. Add XIRR/money-weighted return and time-weighted return, with clear labels and missing-history states. Retain the existing useful cash-flow-matched benchmark. | Portfolio Performance calculates both time-weighted and internal rates of return. [Official manual](https://help.portfolio-performance.info/en/) | First portfolio upgrade, after reliable history |
| Target allocation and drift | **Partial.** Current allocation charts exist; allocation targets and rebalancing analysis do not. Add target weights and drift by asset class/account, then user-defined sector/region groups. Show contribution-only adjustments as a planning scenario, not trade execution. | Portfolio Performance supports target allocation/rebalancing; Sharesight reports diversity across classifications. [Portfolio strategy](https://help.portfolio-performance.info/en/), [Sharesight reporting](https://www.sharesight.com/uk/investment-portfolio-performance/) | First portfolio upgrade |
| Dividend lifecycle | **Partial.** Manual dividend/income entries exist. Add gross/net dividend, withholding, payment dates, optional expected payments, reinvestment links and income reports. Reinvestment must not become fresh external capital twice. | Sharesight includes dividends in performance; Ghostfolio also tracks dividend activity. [Sharesight returns](https://www.sharesight.com/uk/investment-portfolio-performance/), [Ghostfolio feature page](https://ghostfol.io/pl/funkcje) | Next |
| Corporate actions and cost lots | **Missing specialist workflows.** Average-cost buy/sell behavior and a realized-gain field already exist. Add stock splits/consolidations, security transfers that preserve cost, and lot histories before offering lot-based realized-gain reports. | Sharesight's overview describes split-adjusted quantities/cost and realized/unrealized performance. [Portfolio overview](https://help.sharesight.com/show_portfolio/) | Later; important for serious investors |
| Wider instrument identity and feeds | **Partial.** USD stock/ETF quotes and a selected crypto catalogue exist. Add exchange/currency-qualified instruments and broker statement imports. Non-USD listings, bonds, and more crypto networks need separate data coverage and pricing checks. | Sharesight documents broad markets and broker integrations; Portfolio Performance supports broker imports. [Sharesight integrations](https://www.sharesight.com/uk/investment-portfolio-performance/), [Portfolio Performance](https://help.portfolio-performance.info/en/) | Import first; feeds by audience demand |
| Exposure/risk and investment watchlists | **Missing beyond asset-kind allocation.** Add concentration views and an investment watchlist. ETF look-through, overlap, drawdown and volatility require sufficiently complete licensed data/history. | Sharesight documents ETF exposure; Ghostfolio documents regional/sector allocations, static portfolio analysis and watchlists. [Sharesight exposure](https://www.sharesight.com/uk/investment-portfolio-performance/), [Ghostfolio](https://ghostfol.io/pl/funkcje) | Later specialist tier |

Tax reporting is a separate, jurisdiction-specific product commitment. Do not label average-cost gains “tax-ready,” or market a return metric as comparable across accounts with incomplete histories. Those are not launch shortcuts.

## Personal-finance gaps

| Gap | Current state and concrete addition | Competitor evidence | Priority |
| --- | --- | --- | --- |
| Statement reconciliation | **Partial.** “Reconcile balance” currently records a correction today. Add cleared/pending/reconciled states, statement date/balance, a transaction-matching view, discrepancy explanations and reversible reconciliation status. | Actual distinguishes cleared balances and locks reconciled transactions. [Reconciliation](https://actualbudget.org/docs/accounts/reconciliation/) | First feature release |
| Better imports and transaction review | **Partial.** CSV mapping and basic duplicate detection exist. Add saved bank mappings, stable source IDs, import batches with review/undo semantics, transfer/refund matching, and bulk categorization. OFX/QFX can follow validated demand. | Actual supports multiple statement formats, saved filters and bulk actions, and richer rules. [Account register](https://actualbudget.org/docs/tour/accounts/), [Rules](https://actualbudget.org/docs/budgeting/rules/) | First feature release |
| Reliable available-to-spend view | **Partial.** Forecast surplus, current balances, budgets and goal reservations exist separately. Add an explicitly dated, account-aware spending allowance after unpaid commitments, reserves and planned goal funding, with assumptions and exclusions shown. | Simplifi combines income, bills, spending and goals in a monthly plan. [Spending plan](https://support.simplifi.quicken.com/en/articles/4212702-understanding-your-spending-plan) | After shared funding model |
| Bank/broker synchronization | **Missing.** Market prices update; personal account transactions do not synchronize from banks/brokers. Add consent-based connections, sync health, reconnect flows and stable deduplication only for verified institutions. | Monarch supports financial-institution connections. [Connection guide](https://help.monarch.com/hc/en-us/articles/360048393352-Connection-issues) | Conditional on audience/provider coverage |
| Subscription detection and reminders | **Partial.** Manually configured recurring schedules/upcoming items exist. Add suggested recurring patterns, a calendar, amount-change review, and opt-in reminders. Require confirmation before creating schedules or recording payment. | Monarch documents detection and a recurring calendar. [Recurring transactions](https://www.monarch.com/track-recurring-bills-and-subscriptions) | Next |
| Spending watchlists and notifications | **Missing as a dedicated workflow.** Add merchant/category/tag targets, budget thresholds, duplicate-suspicion notices, and daily/weekly summaries. | Simplifi watchlists track selected spending with projections and threshold alerts. [Watchlists](https://support.simplifi.quicken.com/en/articles/3472367-using-watchlists-on-the-web-app) | Next |
| Credit-card lifecycle | **Missing dedicated model.** Generic debt tracking exists. Add statement balances, due dates, minimum payments and card purchases/payments with correct liability accounting. | YNAB distinguishes credit-card payment categories; Monarch includes credit and bill workflows. [YNAB targets](https://support.ynab.com/how-to-use-targets-rk5kkI9ks), [Monarch feature guides](https://help.monarch.com/hc/en-us/categories/32460945233812-Product-Feature-Guides) | Audience-dependent; earlier for card-heavy markets |
| Household collaboration | **Missing.** Current ownership is per user. Add explicit shared-workspace membership, roles, invitations/revocation and audit events. Decide whether private accounts can coexist before changing RLS. | Monarch supports a shared household, with documented visibility limitations. [Households](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples) | Later; substantial permissions work |
| Recovery and portability | **Partial.** Export and Recently deleted exist; complete backup restore does not. Add a versioned restore preview and verified atomic application. | Actual restores exported backups. [Backup restoration](https://actualbudget.org/docs/backup-restore/restore/) | Public-launch requirement |

## Region matters for integration priority

Bank sync is valuable, but “add Plaid” is not a complete plan for an Uzbekistan-focused launch. Plaid's current bank-data coverage documentation lists the US, Canada and selected European countries; Uzbekistan is not listed. Global identity-verification coverage is a different product and does not establish bank-transaction coverage. Verify each intended bank, product and production entitlement before committing. [Plaid country/product coverage](https://support.plaid.com/hc/en-us/articles/27895826947735-What-Plaid-products-are-supported-in-each-country-and-region).

For a UZS/USD audience, prioritize trustworthy manual entry, useful statement templates, dated FX, cash/deposit accounts and multi-currency goals while investigating regional connections. For a US/Canada/Europe mass-market launch, bank sync and credit-card workflows move earlier. For an investor-first launch, broker imports, instrument coverage, performance methodology and corporate actions move earlier. These are prioritization judgments, not findings about users' willingness to pay.

## Recommended implementation sequence

| Stage | Deliverable | Dependency / release condition |
| --- | --- | --- |
| 0 | Finish public-web foundations from the launch audit | Correct Supabase access and migration 035; chosen admission policy; recovery; backup restore; abuse controls; monitoring; browser/mobile verification |
| 1 | Shared goal funding + goal activity ledger | Define one funding pool, account reservations, actual versus planned contributions and owner-scoped goal events |
| 2 | Statement reconciliation + import review | Stable transaction identity, cleared states, import batches, discrepancy review; extend current correction/CSV helpers |
| 3 | Available-to-spend + budget/goal integration | Uses the funding and reconciliation models; avoid duplicated commitments and distinguish liquid cash from total wealth |
| 4 | Portfolio return methodology + target allocation | Correct external cash-flow boundaries and adequate valuation history; server-verified snapshot data |
| 5 | Dividends/reinvestment + payoff goals + reminders | Reuse transaction/goal events and schedules; user-controlled notifications |
| 6 | PWA, selected integrations, household features | Stable web workflows; measured audience demand and verified service coverage |

A reasonable first public version does not need every specialist feature. Publish a complete, reliable workflow through stages 0–3, then deepen portfolio analysis according to the intended audience. If investors are the primary users, move stage 4 alongside stages 1–2.

## Acceptance tests for the highest-value additions

- **Shared funding:** two individually affordable goals that exceed one shared surplus produce an explicit combined shortfall. Archived/paused goals release only their planned future funding. Missing FX cannot silently make the plan look funded. Monetary quick-fill values are whole numbers; unit goals retain quantity precision.
- **Goal ledger:** contributions/withdrawals link to one source without double-counting transfers or editing bank balances as a side effect. Replays are idempotent. Removing/restoring a linked transaction preserves a consistent goal balance. One owner's IDs cannot be linked to another owner's goal.
- **Reconciliation:** cleared totals reconcile to the statement on its date; pending items stay separate. Backdated changes invalidate the relevant reconciliation instead of silently remaining verified. A correction requires a visible explanation and is not income.
- **Imports:** repeated and overlapping statements are distinct cases; identical legitimate purchases remain possible. Pending-to-posted replacement, refunds, transfers, same-day duplicates, decimal separators, currencies and failed batches are covered.
- **Available to spend:** transfers are not income; already-paid recurring items are not subtracted twice; goal reserves, planned funding and current balances are not conflated. Negative and incomplete results remain visible.
- **Portfolio returns:** external contributions do not manufacture investment performance; internal transfers and reinvested dividends do not become new external capital. Test partial/full sales, fees, FX, zero/negative-value periods, incomplete history, and XIRR cases with no unique valid solution against independent reference examples.
- **Allocation:** weights have a valid total; missing prices/currencies prevent false precision; cash flows can be modeled without executing trades; the same holding cannot be counted twice through multiple accounts.
- **Reminders:** retry delivery does not send duplicates; opt-out and timezone changes take effect; a dismissed reminder does not create a payment.

Reuse `lib/format.ts`, `FormattedNumberInput`, `DatePicker`, currency/category helpers and existing operation validators. Introduce shared event and funding helpers only where workflows actually share behavior. Add sequential root migrations, owner-isolation SQL coverage and incremental-upgrade tests for new persisted features.

## Decisions that remain open

- Initial audience and countries.
- Open signup versus invitation beta.
- Which bank/broker statement formats beta users actually have.
- Whether household sharing is a launch requirement.
- Whether portfolio performance should lead the product or remain one part of the broader goal/finance workflow.

These answers change ordering; they do not prevent implementing the shared funding, reconciliation and recovery foundations.
