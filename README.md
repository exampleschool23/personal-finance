# Hoggish Personal Finance

A private, multilingual personal-finance workspace built with React, Next.js and Supabase PostgreSQL. English, Russian and Uzbek share consistent money and Tashkent date formatting.

## Features

- Assets, investments, deposits, property, business ownership and investment activity.
- Cash accounts linked to actual income/expenses, atomic transfers with explicit received amounts and fees, balance reconciliation, and linked investment cash movements.
- Lending, loans, mortgage principal/interest payments and an upcoming-payments view. Recurring schedules require an explicit payment; reminders never move money automatically.
- Monthly budgets with dated allowance versions, optional positive-balance rollover, actual spending and over-budget notices.
- Savings goals with shared funding priorities, reservation activity, pause/refill behavior, and saved inflation/missed-contribution scenarios.
- Record search with per-page filters, categories, date filters, sorting and quick expense entry.
- Transaction categorization rules, atomic category splits, account balance forecasts, monthly actuals review, and guided setup.
- Bank CSV import with saved mappings, optional stable source IDs, batch history and atomic undo; CSV exports and verified JSON backups with previewed in-account restoration and automatic recovery copies.
- Debt payoff comparisons, allocation targets and drift, spending watchlists, recurring-pattern suggestions and duplicate notices.
- Portfolio history, income history, market quotes and investment benchmarks. Daily background portfolio capture is available on Vercel.
- Custom categories, preferences, light/dark themes, Google/email sign-in, optional verified signup, account recovery and password-confirmed account deletion.
- Installable web-app shell with an offline explanation; financial data remains network-only.

See [implementation status and remaining work](docs/roadmap-implementation.md). The current schema includes migrations through 059. Apply only unapplied migrations in order; live migration status is not inferred from repository files. See [record reliability and restoration](docs/reliability-and-restore.md) for the new upgrade and restore limits.

## Local setup

Use Node.js 24 (minimum supported version: 22.13). Run `npm ci`, copy `.env.example` to `.env.local`, and configure your own Supabase URL and publishable key. Enable the desired sign-in providers in Supabase. Never commit credentials.

For a fresh database, run `database/setup.sql` once in Supabase. For an existing database, apply only unapplied schema migrations from `migrations/` in ascending numeric order. Migration `033_correct_four_plan_start_dates.sql` is an installation-specific data repair, not a schema prerequisite: run it only for the original owner's explicitly requested correction. It deliberately fails when those four plans are absent; skip it for other installations. Do not run the fresh setup over an existing installation. See [the planning upgrade](docs/planning-upgrade.md) for migrations 018–023.

- `npm run dev`: portable Vinext development server on localhost.
- `npm run build:production`: production Next.js build used by Vercel.
- `npm run build`: alternative Sites/Vinext build.
- `npm test`: calculation, validation, API and isolated PostgreSQL tests; no live database is used.
- `npm run typecheck`: TypeScript check (run after production build to generate route types).
- `npm run test:integration`: local HTTP auth integration test; requires a production build and permission to bind loopback ports. This does not use a browser or real account.
- `npm run lint`: repository lint check.

GitHub Actions runs the test suite, production build, type check and auth integration check for pushes and pull requests. PGlite is a development dependency used for isolated SQL tests.

## Runtime configuration

`APP_ORIGIN` is required for auth email links; `PUBLIC_SIGNUP_ENABLED` defaults to disabled. Configure the Supabase token-hash email templates documented in [the setup notes](docs/roadmap-implementation.md#authentication-setup). Server-side account deletion also requires `SUPABASE_SERVICE_ROLE_KEY`.

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are required for account data. `TWELVE_DATA_API_KEY` enables stock prices and benchmark feeds. Market requests preserve saved values when prices are unavailable.

Background capture additionally requires server-only `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. The Vercel schedule invokes `/api/cron/portfolio-snapshots` daily at 18:00 UTC (23:00 Tashkent). It cannot run while developing locally without an external scheduler. Missing quotes or FX prevent incomplete totals from overwriting snapshots; failed captures return a non-success status for monitoring. No historical prices are invented.

See [the competitive feature research](docs/competitive-feature-research.md), [the public-launch audit](docs/public-launch-audit.md), [workspace improvements and migration 035](docs/workspace-improvements.md), [Vercel setup](VERCEL.md), [currency handling](docs/currencies.md), [portfolio history](docs/portfolio-snapshots.md) and [benchmark calculations](docs/investment-comparison.md). Project conventions are in [AGENTS.md](AGENTS.md).
