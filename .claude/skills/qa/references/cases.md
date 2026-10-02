# QA regression catalog

Priority: **P0** core money / data / security (the `smoke` set), **P1** main behaviour,
**P2** edges and copy. "Expect" is the pass condition; anything else is a FAIL.
IDs are stable: never renumber; append new cases at the end of their area.
Cases marked `[bug 2026-10-02]` reproduce a defect found in the 2 October QA pass;
`[dr 2026-10-02]` marks a behaviour defect found in that day's design review.

## Run log (newest first; `/qa retest` starts from the top sha)

| Date | Commit tested | Scope | Notes |
|---|---|---|---|
| 2026-10-02 | 6eb533f | Retest of every 2 October finding, live | Dashboard fixes and design-review fixes in 9c08db8 not yet retested live; ACC-010 not run live |
| 2026-10-02 | 2c91d67…4f27bdb | Full app + bot on user1@gmail.com | Deposits, T-bills, crypto, Business income, watchlists, Monthly review, downloads and crons not tested |

Conventions: amounts typed as shown; "USD/EUR" = the test account's two preferred
currencies (USD primary). Compute every expected figure yourself first.

## AUTH — sign-in and access (signed out)

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| AUTH-001 | P0 | Landing loads | Open `/` signed out | Landing page with "Get started", "Explore sample workspace"; no language selector; no console errors |
| AUTH-002 | P1 | Sign-in page | Open `/sign-in` | Google, phone, email + password fields, "Forgot password?", "Create an account", Terms and Privacy links |
| AUTH-003 | P1 | Language follows browser | Signed out, browser language ru | Sign-in copy in Russian; unsupported browser language falls back to English |
| AUTH-004 | P0 | Sample workspace | Click "Explore sample workspace" | Dashboard with Demo badge; saving anything says sign in; "Exit demo" in drawer returns to landing |
| AUTH-005 | P1 | Sample survives navigation | In demo, use sidebar to visit every page | Each page renders sample data; a full reload returns to landing (known, by design) |
| AUTH-006 | P1 | Legal pages | Open `/terms`, `/privacy` | Public, link to each other; no country named for the operator |
| AUTH-007 | P2 | Password rule copy | Create account form | Minimum 8 characters stated and enforced client-side `[bug 2026-10-02]` |
| AUTH-008 | P1 | Wrong password | User types a wrong password (user does it) | Clear error, no account details leaked |
| AUTH-009 | P1 | `/benchmarks` | Open | Redirects to `/` |
| AUTH-010 | P1 | Sign out | Drawer → Sign out | Back to signed-out page; Back button does not reveal data |
| AUTH-011 | P1 | Create account page | From `/sign-in` → "Create an account" (`/auth/access?mode=signup`) | Sign-up form only, never the recovery form; 8-character minimum stated; Brand header; Back to sign-in link |
| AUTH-012 | P1 | Password recovery page | "Forgot password?" (`/auth/access`) | Recovery form; submitting an unknown email gives the same neutral message as a known one (no account enumeration) |
| AUTH-013 | P1 | Email confirmation link | Open `/auth/confirm` with no or a bad `token_hash` | Clear "link is invalid or expired" state with a way back to sign-in; no crash, no blank page |
| AUTH-014 | P1 | Connect Telegram from the web | From the bot's web sign-in button, open `/connect/telegram` signed out, then signed in | Signed out → sign-in card; signed in → confirm screen naming the Telegram account; Cancel → "cancelled"; Confirm → "connected" and the bot says so; reused link → "expired" |
| AUTH-015 | P1 | Telegram web sign-in | Open `/auth/telegram` with a bad or missing token | Error state with a link to `/sign-in`; with a fresh token from the bot (`/app` → Open in browser) the account opens signed in |

## ONB — welcome setup (new account, user signs up)

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| ONB-001 | P0 | Step 1 fields | Name "QA Tester", country Germany | Continue enabled; name and country kept when coming Back |
| ONB-002 | P1 | Country picks currency | Germany | EUR shown primary; no currency pre-suggested for everyone (AGENTS) |
| ONB-003 | P1 | Max two currencies | Click a third card (GBP) | Replaces the second, never three selected |
| ONB-004 | P1 | Make primary | "Make GBP primary" | Order swaps, label "GBP is primary" |
| ONB-005 | P2 | Currency search | Type "yen" | "JPY · Japanese Yen" offered |
| ONB-006 | P1 | Back keeps choices | Back from step 2 then Continue | Step 1 values and step 2 currencies unchanged |
| ONB-007 | P1 | Goal amount grouping | Type 50000.75 | Field shows "50,000.75" |
| ONB-008 | P1 | Goal date min | "Choose a date" | Today and earlier disabled; no Today preset; card says "Any day after today" `[bug 2026-10-02]` |
| ONB-009 | P1 | Telegram connect in setup | Connect to Telegram, send `/start CODE` | Setup card flips to "Connected @hoggish_finance_bot" without reload |
| ONB-010 | P0 | Tracking start saved | Choose "Start of this year", Finish | Dashboard "Tracking since 1 January <year>" `[bug 2026-10-02]` |
| ONB-011 | P1 | Finish | Finish setup → Open my workspace | "You're all set, QA Tester." then dashboard |
| ONB-012 | P2 | First greeting | Dashboard right after setup | "Welcome, QA Tester!" (not "Welcome back") `[bug 2026-10-02]` |
| ONB-013 | P2 | Skip setup / Skip this step | Use each | Lands in workspace with defaults; nothing half-saved |
| ONB-014 | P1 | Run setup again | Settings → Run setup again | Setup reopens with saved values |

## SHELL — drawer, top bar, shared dialogs

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| SHELL-001 | P0 | Every drawer link | Click each destination | Correct page, active state, title in top bar |
| SHELL-002 | P1 | Overdue badge | Create an overdue scheduled payment | Count on Recurring; includes overdue monthly loan instalments |
| SHELL-003 | P1 | Display currency | Top bar → EUR, then USD | All totals convert; per-currency goals stay in their currency; rates source and date shown |
| SHELL-004 | P1 | Refresh prices | Press refresh | Disabled in demo; otherwise updates or shows a clear error |
| SHELL-005 | P1 | Quick expense | Open from any page | Expense dialog; categories include custom ones |
| SHELL-006 | P1 | Theme toggle | Toggle twice | Dark then light; restored at end of run |
| SHELL-007 | P1 | Sidebar toggle | Collapse / expand; mobile width | Drawer opens as a sheet on mobile; links work |
| SHELL-008 | P2 | Discard guard | Type in a dialog, press Escape | "Discard unsaved changes?" with Keep editing / Discard |
| SHELL-009 | P1 | Record dialog validation | Save an empty expense | Native "Please fill in this field" on amount; nothing saved |

## DASH — dashboard

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| DASH-001 | P0 | Net worth | Read headline | Equals assets − debts computed from Accounts, Investments and Loans (convert EUR at shown rate) |
| DASH-002 | P1 | Period buttons | 30 / 90 / 365 / All history | Pressed state moves; chart window changes; no errors |
| DASH-003 | P1 | Benchmark toggles | Toggle BTC, SPY, deposit, main line | Each series appears / disappears (dot or line count changes) |
| DASH-004 | P1 | Main series label | Read legend + tooltip | Line is "Investments" (it plots investments, not net worth) `[bug 2026-10-02]` |
| DASH-005 | P1 | Tooltip | Hover / click a point | Date, each series value, BTC/SPY unit prices, "Total funding invested by this date" |
| DASH-006 | P0 | Invested totals agree | Compare "Money invested" (summary) with tooltip total funding for the same period | Equal; opening values without purchase + principal repaid both counted `[bug 2026-10-02]` |
| DASH-007 | P1 | Money invested details | Click "Money invested" | Popover lists every row; sum equals headline |
| DASH-008 | P1 | Expenses paid | Read | Spending definition (see XAPP-001) since tracking start |
| DASH-009 | P1 | Tracking since picker | Open | Any day from 2016-01-01 to today; presets Today / Start of this month / Start of this year / Clear date `[bug 2026-10-02]` |
| DASH-010 | P1 | Tracking start persists | Pick Start of this month; reload | Same date shown |
| DASH-011 | P2 | Settings text vs picker | Comparison settings with a chosen day before first investment | Explains comparisons start on the first investment day; never contradicts picker `[bug 2026-10-02]` |
| DASH-012 | P1 | Benchmark funding | Switch Excluding / Including expenses | Chart and summary recompute; choice remembered |
| DASH-013 | P0 | Spending card | Read | Equals Cash flow actual spending this month; last-month line correct |
| DASH-014 | P2 | Empty spending card | New account, no spending | Empty state, not a "$0–$1" axis `[bug 2026-10-02]` |
| DASH-015 | P1 | Budget card | Read | "spent of planned" equals Budget page totals; in Flex mode no per-category amounts for flexible categories `[bug 2026-10-02]` |
| DASH-016 | P1 | Monthly commitments | Read | Income − expenses − mortgage payments − loan/debt payments; loan line shown when > 0 `[bug 2026-10-02]` |
| DASH-017 | P1 | Asset allocation | Read | Categories sum to total; percentages sum to 100% |
| DASH-018 | P1 | Goals card | Read | First two goals in the user's order; net-worth goal shows current net worth; goals without a date included `[bug 2026-10-02]` |
| DASH-019 | P1 | Transactions card | Read | Five most recent, income "+" green, expenses ink |
| DASH-020 | P0 | Upcoming payments card | With loans that have monthly payments | Each loan shows its monthly payment ($350), never its balance ($7,650) `[bug 2026-10-02]` |
| DASH-021 | P1 | Income over time | 3 / 6 / 12 months | Recorded income equals Cash flow; forecast months beyond history are by design |
| DASH-022 | P1 | View all links | Each card's View all | Goes to Budget, Investments, Goals, Transactions, Recurring |
| DASH-023 | P1 | Customize | Toggle a card off, Reset to default | Card hides / returns; saved across reload |
| DASH-024 | P1 | Drag cards | Drag Goals into the left column; reload; Reset | New order saved; reset restores; handle named after the card title `[bug 2026-10-02]` |
| DASH-025 | P2 | Telegram nudge | Unlinked account | "Get reminders in Telegram" / "Not now" works and stays dismissed |
| DASH-026 | P1 | Lowest balance ahead | Read the card; View forecast | Lowest projected cash in the next 90 days with its date (per currency when rates are missing); link opens Cash flow on the Forecast tab |

## ACC — accounts

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| ACC-001 | P0 | Add cash account | Add account → name "QA Wallet", USD, opening 1,250.50 | Listed under Cash with $1,251 display; balance exact in edits |
| ACC-002 | P1 | Duplicate name hint | Add another "QA Wallet" | Hint "This name already exists"; pickers still distinguish by balance |
| ACC-003 | P0 | Edit / rename | ⋯ → Edit → rename "QA Wallet 2" | Name updates everywhere (pickers, bot) |
| ACC-004 | P1 | Adjust balance | Adjust balance → 50 | Balance 50; activity "Reconcile balance"; not income or spending |
| ACC-005 | P0 | Transfer same currency | $20 + $2 fee | Source −20, target +18, fee is an expense |
| ACC-006 | P1 | Transfer same account | Pick same From/To | Not offered |
| ACC-007 | P1 | Fee ≥ amount | Fee 25 on 20 | Visible message "The transfer fee must be less than the amount sent." `[bug 2026-10-02]` |
| ACC-008 | P0 | Transfer cross currency | $500 → €460 | Both sides saved with the entered amounts |
| ACC-009 | P1 | Delete linked account | ⋯ → Delete on an account with records | Blocked: "This account has linked transactions…" `[bug 2026-10-02]` |
| ACC-010 | P1 | Delete unused account | ⋯ → Delete on a fresh QA account | Confirm → Recently deleted → Restore brings it back |
| ACC-011 | P1 | Reorder | Drag an account within Cash; reload | Order kept (needs migration 089) `[bug 2026-10-02]` |
| ACC-012 | P1 | Keyboard reorder | Focus handle, Space, ↓, Space | Moves one place; announced |
| ACC-013 | P1 | Holdings without account | Assign AAPL to an investment account | Moves under that account |
| ACC-014 | P2 | Activity order | Same-day activities | Newest first; balance-after consistent with order |
| ACC-015 | P1 | Reconcile statement | Enter statement balance | Correction recorded; balance equals statement |
| ACC-016 | P1 | Delete a never-used account live | Create "QA Temp", ⋯ → Delete → confirm | Gone from Accounts and every picker; listed in Recently deleted; Restore brings it back with its balance |

## TX — transactions

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| TX-001 | P0 | Summary | This month | Transactions count, income, spending (XAPP-001), largest, net — all recomputed by hand |
| TX-002 | P1 | Period filter | Each period option | List and summary change; Last month shows September rows |
| TX-003 | P1 | Category filter | Pick a category | Only that category |
| TX-004 | P1 | Search | "lunch" | Only matching rows; clearing restores |
| TX-005 | P1 | Type switch | All / Income / Expenses | Correct subset |
| TX-006 | P1 | Inline category | Click a category chip → Other expense | Updates; toast offers "Create rule" |
| TX-007 | P1 | Create rule | From toast; name "QA" | Rule saved; shows in Rules; count of matching shown |
| TX-008 | P1 | Delete rule | Rules → trash | Confirmation; toast "Deleted" `[bug 2026-10-02]` |
| TX-009 | P1 | Edit multiple | Select 2 expenses → Living expense | "2 updated" |
| TX-010 | P1 | Mixed selection | Income + expense selected | "Select only income or only expenses…" |
| TX-011 | P0 | Add transaction | Add transaction | Menu Add income / Add expense; each opens the right form `[bug 2026-10-02]` |
| TX-012 | P1 | Details | Click a row | Details dialog; Edit opens record dialog |
| TX-013 | P1 | Mortgage row | A mortgage payment | Shows −interest, "Principal … · Interest …" `[bug 2026-10-02]` |
| TX-014 | P2 | Minus signs | Day header and row | Same true minus "−" `[bug 2026-10-02]` |
| TX-015 | P1 | Cross-currency expense | Expense USD from EUR account | Rate line "1 EUR = … USD · ECB · effective …"; account debited converted amount `[bug 2026-10-02]` |
| TX-016 | P1 | Rule conditions | Rules › Add rule › More conditions: exact name, account, category, business, amount range | The count of matching transactions follows each condition; a rule with no condition cannot be saved; an upper amount below the lower shows an error |
| TX-017 | P1 | Select all | Edit multiple › Select all, then Clear selection | Every listed transaction is selected, then none; more than 500 still update |
| TX-018 | P1 | Tag history | Settings › Tags; click a tag's count | Transactions open on Last 24 months filtered by the tag |

## CF — cash flow

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| CF-001 | P0 | KPIs | Income received / actual spending / net | Match Transactions summary for the month |
| CF-002 | P1 | Month / Quarter / Year | Switch | Totals for that span; savings rate = savings / income |
| CF-003 | P1 | Bars / Sankey | Switch | Sankey labels whole amounts (no "$12.8") `[bug 2026-10-02]` |
| CF-004 | P1 | Category / Merchant | Switch (Bars) | Groups change; totals equal |
| CF-005 | P1 | Income sources | Add "QA Freelance" ~1,200 | Listed with estimate $1,200 `[bug 2026-10-02]` |
| CF-006 | P1 | Record income | From source, 300.40 into EUR account | Converted at shown rate; income KPI rises by 300 |
| CF-007 | P1 | Record bonus / Edit / Archive | On a source | Each works; archive hides it |
| CF-008 | P1 | Split | Split a $3 expense $2 Living + $1 Charity | Built-in categories offered; saves; breakdown updates `[bug 2026-10-02]` |
| CF-009 | P1 | Split validation | One row, or rows ≠ total | Save disabled with the rule shown |
| CF-010 | P1 | Recent transactions | Header count | Equals rows listed `[bug 2026-10-02]` |
| CF-011 | P1 | Monthly mortgage payments | Record payment / Edit | Works; disabled after this month's payment |
| CF-012 | P1 | Spending watchlist | Add, save, remove | Works |
| CF-013 | P1 | Monthly review | Open dialog | Figures equal KPIs |
| CF-014 | P2 | Monthly estimate | Spending estimate | Expenses + mortgage + loan payments (cash-out forecast) |
| CF-015 | P1 | Split an income record | Split a $300 income into two built-in income categories | Built-in income categories offered (the list was empty); saves; totals unchanged `[bug 2026-10-02]` |
| CF-016 | P1 | No repeated figures | Read the month view | Income / spending / net shown once; no second Income / Expenses / Total savings row `[dr 2026-10-02]` |
| CF-017 | P0 | Forecast view | Cash flow → Forecast; switch 30 / 90 / 180 / 365 days | Chart, Cash today, Lowest balance (with date) and "In N days" update; one point per day; amounts whole; month picker and monthly review hidden on this tab |
| CF-018 | P1 | Forecast events and warning | Read "Cash movements ahead"; add a recurring expense on a cash account larger than its balance | Events grouped by month with signed month totals (currencies listed, never added without a rate); caution warning names the account and the first day below zero |
| CF-019 | P1 | Forecast what-if | Add "−500 every month" from next month, then remove it; reload | Projection and events update at once; the change survives reload in this browser only; no record is created |

## REP — reports and business tracking

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| REP-001 | P0 | Cash flow P&L | Reports › Cash flow › Profit & loss, this year | Total income = household income + each business's net income; net cash flow = total income − household expenses; equals the Net income tile |
| REP-002 | P1 | Business Sankey | Sankey with all businesses | A profitable business flows into household income; a loss leaves the household as "{name} net loss"; labels show whole amounts |
| REP-003 | P1 | Drill-down | Click a Sankey flow, a P&L row's receipt icon, a breakdown bar | Transactions below narrow to it with a removable chip; counts match |
| REP-004 | P1 | Business filter | Pick one business, then Household | Tiles, charts and P&L show only that selection |
| REP-005 | P1 | Trends | Trends › Grouped/Stacked, Monthly/Quarterly/Yearly; click a legend entry | Bars per interval; the series hides and returns |
| REP-006 | P1 | Spending / Income by business | Spending › Group by Business, Bars and Donut | One entry per business plus Household; totals equal the tab total |
| REP-007 | P0 | Tax prep | Business tax prep for a business, full year and Q3 | Categories sit on lines; net profit = mapped income − mapped expenses; manual lines say "Work out by hand"; disclaimer shown |
| REP-008 | P1 | Move a category | Move a category to another line, reload | Stays on the new line; "Not on the sheet" removes it from the export |
| REP-009 | P1 | Export | Preview export › CSV and PDF at each detail level | Ask the user before downloading; files list the lines; amounts unrounded in CSV, whole in PDF |
| REP-010 | P1 | Business setup | Dashboard › Business tracking › Set up; add "QA Shop" (LLC, colour, logo), assign a QA account | Business saved with its profile; the account and its transactions move to it; guidance matches the first answer |
| REP-011 | P1 | Account business | Accounts › Edit businesses; move a QA account back to Household | Toast names the transactions moved; those set by hand stay |
| REP-012 | P1 | Transaction business | Transactions › change a row's business; Create rule from the toast | Row updates; the rule (Both directions) applies to matching rows |
| REP-013 | P1 | Edit multiple | Select rows › Edit › category, business, add tag | Every field applies; mixed income/expense keeps category disabled |
| REP-014 | P1 | Tags | Settings › Tags add "QA Trip", tag a transaction, click the count | Transactions open filtered by the tag; delete removes it from rules too |
| REP-015 | P1 | Dashboard widget | Net income / Net assets, each link | Rows open Reports filtered to the business, the thumbnail opens Trends, View P&L opens the table, Net assets opens Accounts filtered |
| REP-016 | P1 | Report summary and CSV | Any report tab; click a chart part, then Download CSV (ask the user first) | Summary shows count, largest, average, totals, first and last date for the narrowed list; the file holds the same rows, spending negative |
| REP-017 | P1 | Open a report transaction | Click a row under a report | The transaction's details open; closing returns to the same report and filter |
| REP-018 | P1 | P&L sections fold | Profit & loss; click a business's chevron | Its gross income and expense lines hide and return; totals unchanged |
| REP-019 | P1 | Trends by business | Cash flow › Trends › Net by business | One series per business plus Household; a loss draws below zero |
| REP-020 | P1 | Setup guide | Settings › Businesses › Setup guide | Guide opens alone; each card's button goes to Transactions, Rules, tax prep or Tags |
| REP-021 | P1 | Setup accounts step | Add business › accounts step; Add account | Accounts grouped by type; the account form opens above the setup and the new account appears in the list |
| REP-022 | P1 | Tax tab without a business | Open /reports?tab=tax with no businesses | Cash flow shows, with its own tiles and chart |

## BUD — budget

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| BUD-001 | P0 | Plan a category | Living expense 200 | Remaining = 200 − actual; Left to budget updates |
| BUD-002 | P1 | No repayment rows | With loan repayments | No "Loan" spending row (principal is a transfer) `[bug 2026-10-02]` |
| BUD-003 | P1 | Year view | Switch | Monthly columns; row totals add up |
| BUD-004 | P1 | Flex mode | Settings → Flex → Save | Flexible group plan = bucket; categories show "—"; totals consistent; no "Unallocated −$200" `[bug 2026-10-02]` |
| BUD-005 | P1 | Apply to future months | Settings option | Later months carry the plan |
| BUD-006 | P1 | Recalculate | Settings → Recalculate | Plans from averages, whole amounts rounded up |
| BUD-007 | P1 | Contributions | With a goal monthly contribution | Listed; Left to budget subtracts it |
| BUD-008 | P2 | Prev / next / Today | Navigate months | Header and data follow |
| BUD-009 | P1 | Rollover is explained | A category with leftover from last month | "+$N rolled over" shown; remaining = plan + rollover − actual; group plan = sum of its rows `[dr 2026-10-02]` |

## REC — recurring

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| REC-001 | P0 | Monthly expense appears | Create $40 monthly expense | Listed today with Record payment |
| REC-002 | P1 | Record payment prefill | Record payment | Amount prefilled 40 (value, not placeholder) `[bug 2026-10-02]` |
| REC-003 | P0 | Overdraft refused | Pay from a $0 account | "Insufficient balance or invalid amount." nothing saved |
| REC-004 | P1 | Paid state | Pay from funded account | "Paid"; summary bars update |
| REC-005 | P1 | Future occurrence | Next month | Record payment disabled; "in N days" |
| REC-006 | P1 | Skip / Restore | Skip next month; restore from Skipped occurrences | Both work |
| REC-007 | P1 | Calendar view | Switch | Items on their days |
| REC-008 | P0 | Loan instalments | Loan with monthly payment | Appears monthly on its start day with its payment amount; Record payment opens repayment form `[bug 2026-10-02]` |
| REC-009 | P1 | Instalment paid | Repay in the month | Shows Paid |
| REC-010 | P1 | Reminders | Snooze until tomorrow / Dismiss | Hidden until tomorrow / gone |
| REC-011 | P1 | Calendar equals list | Calendar view for this month | Every list item, including debt repayments and loan instalments, is on its day `[dr 2026-10-02]` |
| REC-012 | P1 | Subscriptions detected | Sample workspace, Recurring | Subscriptions panel lists Netflix (Price went up, caution pill), Spotify and Daily News digital (Possibly cancelled); totals per currency leave Daily News out; no day-to-day purchases listed |
| REC-013 | P1 | Subscription decisions | ⋯ on a subscription: Not a subscription, Mark cancelled; then Restore under Hidden subscriptions | Row moves to Hidden with its reason and back; totals follow; survives reload on a signed-in account |
| REC-014 | P1 | Track as recurring | ⋯ → Track as recurring, save | Record form opens with the name, amount and next charge date; once saved the plan is listed and the subscription row is gone |

## INV — investments

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| INV-001 | P0 | Add stock | Add asset → Stock → AAPL → Fetch price → qty 2.5, buy 250 | Value = qty × price; gain = value − cost |
| INV-002 | P1 | Unit price precision | Read price | Up to 8 decimals, no trailing zeros |
| INV-003 | P0 | Sell | Sell 2 into a cash account for 990 | Holding 0.5; cash +990 |
| INV-004 | P1 | Oversell | Type 3 when 2.5 available | Message "Only 2.5 units available", value capped `[bug 2026-10-02]` |
| INV-005 | P2 | Crypto hint | Stock sale | No USDT/USDC note (only for crypto) `[bug 2026-10-02]` |
| INV-006 | P1 | Tracker | Open Tracker; Buy; value update | Works; history chart updates |
| INV-007 | P1 | Target allocation | 60 + 50 | "must add up to 100%", Save disabled; 60 + 40 saves |
| INV-008 | P1 | Category filter / view | Filter, card / compact | Works |
| INV-009 | P1 | Deposit / T-bill | Add each | Interest estimates appear |
| INV-010 | P0 | Crypto buy and sell | Add BTC → Fetch price → qty 0.015; sell 0.005 into a cash account | Price up to 8 decimals; value = qty × price (whole display); holding 0.01; cash rises by the entered proceeds |
| INV-011 | P2 | Stablecoin note | Sell crypto | The USDT/USDC note appears for crypto (and only there, see INV-005) |
| INV-012 | P1 | Target allocation default | Open Target allocation with holdings, no saved plan | Starts from the current mix, never 100% cash suggesting selling everything else `[dr 2026-10-02]` |

## LOAN — loans and debts

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| LOAN-001 | P0 | Totals | Owed to you / you owe / net | Sum of rows (converted) |
| LOAN-002 | P1 | Currency on new record | Add record | USD/EUR select for all kinds `[bug 2026-10-02]` |
| LOAN-003 | P1 | Category filter | Open | Only Money lent / Mortgage / Loan / Debt `[bug 2026-10-02]` |
| LOAN-004 | P0 | Record payment on loan | Car loan → Record payment | Debt payment flow; balance falls `[bug 2026-10-02]` |
| LOAN-005 | P2 | Plural | One lending record | "1 lending record" `[bug 2026-10-02]` |
| LOAN-006 | P1 | Payoff planner | Change method / extra payment | Debt-free date and interest recompute; Save plan |
| LOAN-007 | P1 | Mortgage payment dialog | Principal + interest | Balance falls by principal only |
| LOAN-008 | P1 | Money lent | Add QA Friend 150 | Owed to you +150 |

## GOAL — goals

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| GOAL-001 | P0 | Add goal currency | Add goal → Car → Targets | "Target amount (USD)" with currency select; default primary `[bug 2026-10-02]` |
| GOAL-002 | P1 | Validation | Continue without amount | "Enter a target amount." per goal |
| GOAL-003 | P1 | Contribution accounts | Contribution step | Only accounts in the goal's currency |
| GOAL-004 | P1 | Use this amount | Budget step | Whole amount, rounded up to meet the target |
| GOAL-005 | P0 | Order on create | Create two goals | Appended at the end in picked order `[bug 2026-10-02]` |
| GOAL-006 | P1 | Drag reorder | Drag a goal; reload | Kept |
| GOAL-007 | P1 | Edit / Delete / Restore | ⋯ → Edit goal → Delete goal → Recently deleted → Restore | Confirm dialogs; goal returns |
| GOAL-008 | P1 | Planner math | Net-worth goal | Left to save = target − current; monthly = left / months, rounded up |
| GOAL-009 | P2 | Archive | Archive a goal | Hidden from list and dashboard; Show archived |

## AST — assistant

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| AST-001 | P1 | Not configured | No server key | "The assistant isn't available yet", input disabled `[bug 2026-10-02]` |
| AST-002 | P1 | Configured | With key | Suggested question answered from the user's data; disclaimer shown |

## DEL — recently deleted

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| DEL-001 | P0 | Restore | Delete a QA goal, Restore | Confirm; item back with its activity |
| DEL-002 | P2 | Empty | Nothing deleted | Empty state, no pagination `[bug 2026-10-02]` |
| DEL-003 | P1 | Delete permanently | Only on QA items, with user OK | Confirm; gone |

## SET — settings

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| SET-001 | P1 | Language | Russian, then Arabic, then English | Saved instantly; RTL for Arabic; bot menu follows |
| SET-002 | P1 | Currencies | Add / remove / make primary | Max two; removing never changes records |
| SET-003 | P1 | Font | Inter / Onest | Applies and persists |
| SET-004 | P0 | Telegram connect / disconnect | Connect; toggles; Disconnect | Bot links / unlinks; toggles persist |
| SET-005 | P1 | Categories add | New expense "QA Coffee" | Appears in dialogs and bot |
| SET-006 | P1 | Duplicate category | "qa coffee", "charity" | "A category with this name already exists." `[bug 2026-10-02]` |
| SET-007 | P1 | Category reorder | Drag; reload | Kept (migration 089) |
| SET-008 | P1 | Delete category | Delete unused / used | Confirm; used one reassigns records |
| SET-009 | P1 | Benchmarks | Add stock, diversified portfolio | Total allocation validated; saved |
| SET-010 | P2 | Security | Change password form | 8-char minimum; never actually change it |
| SET-011 | P1 | Import & backup | With user OK only | PDF, backup, CSV download; CSV import mapping; Undo import |
| SET-012 | P0 | Delete a Telegram-made account | Only on a throwaway account the user creates in the bot, with user OK; Settings → Security → Delete | Confirm dialog naming the account; data gone; the chat is told and offered sign-up again; the real account untouched |

## I18N — languages, formats

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| I18N-001 | P1 | No English leaks | Switch to ru, de, ar; visit every page | No untranslated UI strings |
| I18N-002 | P1 | Latin digits | Arabic | Amounts use Latin digits |
| I18N-003 | P1 | Dates | Any language | "16 September 2026" style; timestamps 24 h Tashkent |
| I18N-004 | P2 | Long words | German | No overflow or clipped buttons |

## BOT — Telegram bot

| ID | P | Case | Steps | Expect |
|---|---|---|---|---|
| BOT-001 | P0 | Link with code | `/start CODE` | "Welcome, QA Tester! You are connected and will get…" (one sentence) `[bug 2026-10-02]` |
| BOT-002 | P1 | Expired code | `/start` old code | "This link has expired…" |
| BOT-003 | P1 | Menu | Open keyboard | Expense / Income / More actions |
| BOT-004 | P1 | Unknown text | "hello bot" | "Choose what to add." |
| BOT-005 | P1 | Localised labels | "Расход" | Opens the expense flow |
| BOT-006 | P1 | Sign up inside Telegram | New Telegram user (the user taps I agree and Share my number) | Welcome flow in the chat's language; currency list with search; first cash account created in the bot; never "do it in the app" |
| BOT-007 | P1 | Returning user by phone | Signed-out chat whose account has a phone (user shares the number) | Clear choice "number or web"; after sharing, the same account and balances return |
| BOT-010 | P0 | Expense happy path | Expense → category → account → 12.75 → name → Yesterday → Save | Saved; balance −12.75; app shows it |
| BOT-011 | P1 | Custom category | Expense → QA Coffee … Save | "Added QA Coffee" `[bug 2026-10-02]` |
| BOT-012 | P1 | Skip name | Skip | Name = category |
| BOT-013 | P1 | Date formats | 2026-09-15, 30.09.2026 | Accepted |
| BOT-014 | P1 | Future date | 15.10.2026 (future) | "Type a past or present date…" |
| BOT-015 | P1 | Invalid amount | abc, −50 | Error re-prompt keeps its buttons |
| BOT-016 | P0 | Overdraft | $100 from a $63 account | "Insufficient balance: QA Wallet 2 has $63." draft kept `[bug 2026-10-02]` |
| BOT-017 | P1 | Back from confirm | ‹ Back ×n | Each step returns in order; values kept |
| BOT-018 | P1 | Cancel | Cancel mid-flow, `/cancel` | "Cancelled.", menu back |
| BOT-020 | P0 | Income | Income → Salary → 2500 → Today → Save | Saved; Business income hidden without a business |
| BOT-021 | P1 | Business income | With a business set up: Income → Business income → pick business → 400 → Save | Asks for the business, saves, app shows it under that business (this flow always failed before 2026-10-01) |
| BOT-030 | P0 | Transfer one account | Transfer with one account | "Add a second cash account to continue." |
| BOT-031 | P0 | Cross-currency transfer | $500 → €460 | Asks received amount; saved |
| BOT-040 | P0 | Pay loan none | Pay loan or debt with none | "+ Add loan or debt" → flow resumes after adding |
| BOT-041 | P1 | Loan past due date | Add loan → due 2020-01-01 | "The due date cannot be in the past…" `[bug 2026-10-02]` |
| BOT-042 | P1 | Rate with % | "7,5 %" | Accepted; "abc" gives "Type the rate as a number like 7.5 or 7.5%, or 0." with 0 button `[bug 2026-10-02]` |
| BOT-043 | P1 | Only same-currency accounts | Pay a USD loan | Only USD accounts offered |
| BOT-044 | P1 | Mortgage dead end | Mortgage payment with none → add | Kind pre-filled; prompt "for example Home mortgage" `[bug 2026-10-02]` |
| BOT-045 | P0 | Mortgage payment | principal 700, interest 200 | Saved; mortgage −700; spending +200 |
| BOT-050 | P1 | Add cash account | Name, currency, 0 button | Saved, no confirm step |
| BOT-051 | P1 | Duplicate account name | " qa wallet " | "You already have a cash account named …" `[bug 2026-10-02]` |
| BOT-052 | P1 | Back from dead-end account | + Add cash account inside a flow, ‹ Back | Returns to the interrupted flow `[bug 2026-10-02]` |
| BOT-060 | P0 | Upcoming payments | More actions → Upcoming payments | Next 31 days incl. monthly loan instalments with their payment amounts `[bug 2026-10-02]` |
| BOT-061 | P0 | Stale Save | Tap an old Save again | No duplicate record |
| BOT-070 | P1 | /app | `/app` | "Your account also works on the web." with Open in browser |
| BOT-071 | P1 | /phone Cancel | `/phone` → Cancel | Menu restored; never share the number `[bug 2026-10-02]` |
| BOT-072 | P1 | Language follows Settings | Change app language | Bot re-sends menu in that language |
| BOT-073 | P1 | App action messages | Save in the app | Bot posts "Added …" with custom category names |
| BOT-074 | P0 | Sign out | More actions → Sign out | Warm message; keyboard removed; app shows Connect; stranger reply "Welcome back." |
| BOT-080 | P1 | Digest / recap / milestones | Only with user OK | Correct figures; spending per XAPP-001 |

## XAPP — cross-page consistency (run after money-moving actions)

| ID | P | Case | Expect |
|---|---|---|---|
| XAPP-001 | P0 | One spending definition | Cash flow, Transactions, Dashboard spending card, Budget actuals, bot digest all equal: expenses in full + mortgage interest; principal and loan repayments excluded `[bug 2026-10-02]` |
| XAPP-002 | P0 | Balances | Bot pickers, Accounts, Investments account cards equal (after conversion) |
| XAPP-003 | P0 | Net worth | Dashboard = Investments page "Net worth" = assets − debts |
| XAPP-004 | P1 | Upcoming | Bot upcoming = Dashboard card = Recurring list for the same window |
| XAPP-005 | P1 | Goal values | Goals page = Dashboard goals card |
| XAPP-006 | P1 | Category names | Same custom name in app list, bot buttons, bot confirmations, action messages |
| XAPP-007 | P1 | Rates | Same pair and date → same rate in every dialog; label names the source (ECB / CBU) |
