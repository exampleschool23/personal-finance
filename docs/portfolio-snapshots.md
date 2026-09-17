# Portfolio history and live prices

Overview always draws its chart. A single observation uses a short horizontal marker and one date tick; it does not fabricate another balance or an earlier return. Current values still update with the existing market refresh, normally every five minutes while the app is visible.

Migration `017_portfolio_snapshots.sql` adds durable daily snapshots. Apply it after migration 016 (fresh databases use `database/setup.sql`). Until it is applied, the current chart continues to work and explains that daily history cannot be saved.

The signed-in workspace captures a snapshot after market refreshes and record changes on any page. The server reads all owner-scoped holdings, applies ownership and quantities, and uses the fetched market prices and explicit FX rates. Missing prices for nonzero stock/crypto positions, or missing required FX, prevent an incomplete snapshot from replacing a good one. The original investment records and Tracker entries are not changed.

The snapshot contains assets and debts valued in USD plus the observed exchange rates. The database determines the date in Asia/Tashkent and updates only today's row. Each user's prior days remain unchanged; snapshot reads enforce owner RLS and direct table writes are disabled. The authenticated capture function cannot accept a target owner or historical date.

The chart prefers stored market snapshots over reconstructed manual balances on matching dates, then uses live values for today. Snapshot FX is retained for later currency conversion. Earlier manual history retains its existing current-FX approximation. Old snapshots also retain the portfolio as it existed before later holdings were added or removed.

Snapshots are observations, not historical market backfills. When the daily background job is configured, samples also arrive while the app is closed. Otherwise, only open-app observations are collected. The line connects the days actually observed. See `docs/planning-upgrade.md` for server configuration. Same-day refreshes replace today's observation rather than creating an intraday trading chart. Manual asset values change when updated in the app; quoted stock and crypto values change automatically when prices refresh.
