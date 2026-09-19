# Investment returns versus Bitcoin

The Benchmarks page (`/benchmarks`) compares the monetary value and profit of actual investments with buying Bitcoin using the same cash amounts on the same dates. Bitcoin is the default benchmark. Settings also offers SPY, HYG, assumed UZS and USD deposits, and a custom USD stock/ETF. Real investments—including livestock or cafés recorded as Businesses—belong in Assets & investments, with dated activity in Tracker.

## Capital and returns

There is no hypothetical net-worth starting balance. Cash accounts, debts, salary, recurring income estimates and everyday spending are excluded. Monthly income joins the comparison only when it is actually invested and recorded as a contribution.

- Each Tracker contribution funds both the actual holdings and each benchmark at that day's closing price.
- Each withdrawal removes the same cash amount on the same day. Same-day transactions use one daily price.
- Actual investment income and expenses count toward actual profit. Tracker-linked income/expense finance records are not counted again.
- Recorded valuations carry forward until updated. Today's value includes available current quotes. Business values reflect ownership; contribution amounts already represent the user's share.
- A holding with no known purchase starts from its first observed balance, with a visible notice that earlier profit is unknown. Backdated contributions before that observation replace the assumed opening capital. An automatic baseline and a same-day purchase never contribute twice.

Values equal remaining investment holdings plus distributed investment income minus investment expenses. Investment gain subtracts net contributions (contributions minus withdrawals). The chart, tooltip, headline and comparison table display whole monetary amounts in the selected currency while calculations retain precision. The table shows each benchmark's hypothetical value, gain, and how much actual investments are ahead or behind in money. Total invested counts gross contributions, including same-day purchases and sales.

Example: invest $1,000 when BTC costs $100, then $500 when BTC costs $200. The benchmark buys 12.5 units. At a final BTC price of $220, its value is $2,750 and gain is $1,250. If actual investments end at $1,700, their gain is $200 and they are behind Bitcoin by $1,050.

Record all purchases, sales and investment distributions for a complete result. Preserve sold holdings as zero-balance records; removed holdings are not included. Transfers/reinvestment entered as new contributions count again toward gross investments. Missing balances or required FX pause the calculation rather than silently presenting partial totals. A benchmark that cannot fund the same withdrawal stops instead of borrowing implicitly.

## Dates and preferences

Migration `016_investment_comparison.sql` must follow migration 015. It saves account activity and benchmark preferences with owner RLS. The first authenticated visit records an immutable app start date. Existing accounts use their earliest stored creation timestamp, with this fallback disclosed. Backdated transaction dates do not change the account start date.

The chart begins at the earliest investment activity, including purchases recorded before joining the app. The app start date is shown only as account context. The 30/90/365-day buttons zoom the same cumulative series, without changing investment dates, capital or return calculations. All history restores the full view. A first day is a point rather than an invented trend.

Previously captured net-worth baseline rows and their compatible API remain preserved, but this comparison neither captures nor reads them for its calculations. Changing benchmarks cannot reset investment history.

## Sources and limitations

- SPY, HYG and custom stocks/ETFs use Twelve Data daily history with `adjust=all`, USD validation and the server-only `TWELVE_DATA_API_KEY`.
- BTC uses Coinbase daily BTC/USD candles with automatic fallback to Bitfinex BTC/USD history if Coinbase fails or returns incomplete data. Requests are split into 299-day windows. A complete series comes from one exchange so fallback never mixes exchange prices. Bitcoin requests bypass the server fetch cache so retry can recover immediately; API responses containing errors are not cached. Interior missing days reject the feed. Today's comparison can use the latest completed candle when today's candle is unavailable, including on the first tracking day.
- Deposit assumptions are effective annual rates of 21% UZS and 8% USD, compounded daily on a 365-day basis before taxes/fees; these are the user's hypothetical rates, not bank offers.
- Historical CBU FX is sampled at up to 25 checkpoints, carrying preceding rates between them. Contribution conversions and daily valuations use those dated rates, so results are estimates. Dividend adjustments, daily closing prices and occasional carried-forward prices do not reproduce intraday execution.

Only selected market feeds are requested. Provider failures are named and retryable. If account comparison preferences cannot load, Benchmarks explicitly falls back to BTC; saving preferences and recovering the true app start date still require the migration.

References: [Twelve Data historical data](https://support.twelvedata.com/en/articles/5214728-getting-historical-data), [Coinbase candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles), [Bitfinex candles](https://docs.bitfinex.com/reference/rest-public-candles), [CBU FX](https://cbu.uz/ru/arkhiv-kursov-valyut/veb-masteram/).

## Deleting tracker corrections

Apply `053_delete_tracker_updates.sql` after migration 052. Business and Property trackers offer Delete update for valuations, contributions, and withdrawals, with a confirmation explaining the balance and cash reversal. Balance updates must be deleted newest first. Starting snapshots, income/expense entries, lending, security trades, and mortgage transactions are not deleted by this action.

The owner-scoped operation restores the previous full balance and ownership percentage and reverses any linked cash delta in its original currency and precision. It writes a current cash-balance observation, retains previous cash observations, and stores a private deletion audit receipt. Retries cannot refund twice or replay a deleted event ID. A missing/changed cash account or invalid resulting balance aborts the entire deletion. No existing records are deleted by applying the migration.
