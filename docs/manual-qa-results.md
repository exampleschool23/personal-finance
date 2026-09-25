# Manual QA: payments, mortgage payoff, purchases, and benchmarks

Tested through the connected Chrome browser at localhost:5000 in the account displayed as Test Account1. The user explicitly authorized retaining QA payment history and requested mortgage payoff, principal-only payments, car/watch purchases, and comparisons with investing that money in benchmarks. This is a focused browser pass plus the automated suite, not certification of every application workflow. The working tree had concurrent application changes; findings describe the observed workspace, not an isolated commit.

## Verified

- Benchmark settings: enabled High-yield bonds and disabled USD deposit, saved, reloaded, and verified both choices persisted. The overview then offered High-yield bonds instead of USD deposit. Restored the original Bitcoin, S&P 500, and USD deposit selection and observed the save confirmation.
- Created the disposable mortgage `QA manual mortgage 25 Sep` with principal 1000, annual rate 12, estimated monthly payment 110, and a later maturity date. The form grouped the balance and the date picker closed on selection. The new debt and estimated payment appeared in totals.
- Payment preview: principal 100 plus interest 10 showed total 110 and remaining principal 900.
- Missing cash account: Save payment was disabled.
- Insufficient cash: selecting the zero-balance settlement record showed the negative projected cash balance, an explicit insufficient-funds message, and disabled Save payment. No transaction was submitted.
- Cancellation: the form requested confirmation to discard changes. Reopening after discarding showed zero payment and the original mortgage balance.
- Principal above the outstanding balance was rejected by the input; the value stayed blank. This checks the UI input only, not server rejection.
- Recovery: moved the unpaid QA mortgage to Recently deleted in the initial pass, then restored it after authorization to retain payment history. It returned with its original balance and terms.
- Created `QA spending cash` with a synthetic USD 50,000 opening balance. Existing cash accounts were not used for successful payments.
- Regular mortgage payment: USD 100 principal plus USD 10 interest reduced the mortgage from USD 1,000 to USD 900 and cash to USD 49,890. Reload preserved both balances.
- Extra principal-only payment: USD 200 with blank interest saved successfully, reducing principal to USD 700 and cash to USD 49,690.
- Full payoff: USD 700 principal with explicit zero interest cleared the mortgage and left cash at USD 48,990. Reload preserved the zero balance. Tracker showed USD 1,000 principal repaid and USD 10 interest, with exactly three payment entries.
- Paid-off behavior: estimated monthly mortgage commitments returned to zero; the QA mortgage disappeared from Monthly mortgage payments and had no reminder in Upcoming payments through its maturity date. The record remains available for history.
- Income & expenses showed exactly three matching mortgage rows, with totals USD 110, USD 200, and USD 700 and the correct principal/interest split. Monthly actual spending increased by USD 1,010.
- Watch purchase: saved a USD 500 one-time Other expense from QA cash, leaving USD 48,490. The note identifies it as a synthetic QA watch purchase.
- Car purchase: saved a USD 20,000 one-time Other expense from QA cash, leaving USD 28,490 after reload. The note explicitly states that no retained asset value was entered.
- Final history search showed exactly five QA transactions: three mortgage payments and two purchases. Monthly actual spending showed USD 25,538 versus its original displayed USD 4,028, a USD 21,510 increase.
- The overview Money invested breakdown included all three QA mortgage payments. Its total rose by USD 1,010; personal purchase spending was included in Expenses paid instead. BTC, SPY, and USD deposit toggles could be enabled together and survived reload. Restored chart visibility to its initial BTC-only state afterward.

## Findings and product gaps

1. **Purchase-versus-benchmark comparison is unavailable.** The current UI provides portfolio-level benchmark overlays, with no way to select the watch/car expense and simulate investing that amount instead. `lib/actual-investment-performance.ts:19` explicitly excludes personal spending from benchmark funding. The standalone investment selector in `components/investment-comparison.tsx` is outside the embedded overview branch, and `app/(workspace)/benchmarks/page.tsx` redirects to the overview. This is a missing requested workflow, not a failed save. Add a separate hypothetical comparison using the selected purchase amount and date without reclassifying personal spending as a real investment.

2. **No dedicated category for a car or personal valuable as a retained asset.** Add asset offers Cash, Stock, Crypto, Deposit, Property, and Business (`lib/finance.ts:40`). A personal purchase can be saved as an expense, as tested, but that does not also track resale value or depreciation. Do not mistake the tested car expense for a complete cash-to-car asset purchase workflow.

3. **All-history chart collapses to the latest opening date without explaining why.** Before the QA cash/mortgage records, the overview displayed history back to 2020. After these positive opening balances dated today were introduced, All history displayed only today, confirmed after reload and visually. `lib/portfolio-history.ts:30` requires a known balance for every included record before emitting a point; only dated zero openings are initialized before their first event. Avoid fabricating historical balances, but explain the incomplete earlier coverage or offer a partial-history view. The benchmark overlay uses these same dates, so its historical curve also disappears. Existing historical records were not deleted.

4. **Tracker labels automatic mortgage balance updates as corrections.** Each saved QA payment was accompanied by a separate Balance correction row even though no manual correction was entered. Payment totals remain correct, but the history implies an extra action. Investigate snapshot/event labeling and avoid presenting an automatic post-payment snapshot as a manual correction.

## Automated regression run

`npm test`: 513 tests, 506 passed, 7 failed, zero skipped. Log: `/tmp/personal-finance-manual-qa-tests.log`.

- Three failures in `tests/background-refresh.mjs` and one in `tests/workspace-hooks.mjs`: `ReferenceError: showSaved is not defined` in the evaluated hook harness.
- Three failures in `tests/investment-value-chart.mjs`: `TypeError: React.useState is not a function or its return value is not iterable`.

These are failures in the observed working tree; attribution to a specific change was not established. No application code was changed by this QA pass. Production build, lint, type check, and auth integration were not run in this pass.

## Coverage limits

Concurrent duplicate submissions, network failure recovery, currency conversion, actual bank transfers, custom stock search, other languages, mobile layouts, and depreciation/resale were not exercised. The purchase opportunity-cost comparison could not be completed because the required UI is absent. The tests record synthetic bookkeeping only, not real purchases or bank payments.

## Retained data

- `QA spending cash`: USD 28,490, from USD 50,000 synthetic starting funds.
- `QA manual mortgage 25 Sep`: paid off, USD 0 balance, three retained payments totaling USD 1,010.
- Watch expense: USD 500, QA-labeled in its name/notes.
- Car expense: USD 20,000, QA-labeled in its name/notes; no retained car asset value recorded.

The user authorized keeping these records. Original benchmark settings were restored in the earlier pass; chart visibility was restored after this pass. Existing financial records were left unchanged.

## Follow-up fixes: income-funded benchmarks

The user replaced the purchase-versus-benchmark request with a new rule: invest every actual income receipt from any source in each benchmark. Overview now uses that rule, independently of investment contributions or expenses. Scheduled income, opening balances, transfers, principal repayments and future receipts are not income funding. Linked Tracker receipts are counted once. Receipt-date historical FX checkpoints determine purchases; current FX converts benchmark values for display. Missing required income FX pauses the comparison instead of silently omitting a receipt. Existing investment performance calculations remain available separately.

- The overview explains the income funding rule and shows its total. Settings copy is updated in EN/RU/UZ.
- Benchmark curves use daily prices between saved actual balance observations. Zooming retains earlier benchmark purchases.
- Historical balances no longer disappear after a positive new opening balance. Overview displays partial earlier history with an explicit notice; period-change and tooltip balance-difference figures are suppressed when coverage is incomplete. No historical balance is invented for a newly added holding.
- Mortgage valuation snapshots are labeled Balance update instead of Balance correction. They remain in the audit trail and do not add payment amounts.
- Updated the hook test harness for save notifications and the chart test harness for responsive sizing.
- The dedicated car/watch asset and depreciation category remains outside this income-based comparison change. Personal expenses remain expenses.

Browser follow-up in the same authorized test account:

- All history again showed dates in 2020 through today, plus the partial-history explanation.
- Income funding loaded as USD 616,573, using historical FX, compared with the existing overall-income figure using current FX. The funding total stayed USD 616,573 when zoomed to 30 days.
- Added and retained `QA benchmark funding receipt`, Other income, USD 123.45 on 25 September 2026, into `QA spending cash`. The saved edit form retained 123.45; the transaction table displayed the whole amount USD 123. Cash displayed USD 28,613 (underlying expected balance 28,613.45).
- Overview funding then displayed USD 616,696. Money invested and Expenses paid stayed unchanged. The receipt appeared exactly once in filtered transaction history.

Final automated verification: `npm test` passed all 517 tests, zero skipped. Production build, typecheck and lint passed. Logs: `/tmp/personal-finance-income-tests.log`, `/tmp/personal-finance-income-build.log`, `/tmp/personal-finance-income-typecheck.log`, `/tmp/personal-finance-income-lint.log`. The focused new coverage checks receipt deduplication, income categories, forecasts/future dates, historical FX, precision, unavailable data, independent owner inputs, zooming, sparse balance histories, partial historical coverage, and mortgage labels. Authentication integration was not rerun.
- Reload confirmed the USD 616,696 benchmark funding total persisted. The paid-off QA mortgage Tracker showed exactly three Mortgage payment entries and three Balance update snapshots, with principal repaid USD 1,000, interest paid USD 10 and outstanding balance USD 0.
