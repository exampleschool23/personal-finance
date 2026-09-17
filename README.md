# Hoggish Personal Finance

A private, multilingual personal-finance workspace built with React, Next.js and Supabase PostgreSQL. English, Russian and Uzbek share consistent money and Tashkent date formatting.

## Features

- Assets, investments, deposits, property, business ownership and investment activity.
- Cash accounts linked to actual income/expenses, atomic transfers with explicit received amounts and fees, balance reconciliation, and linked investment cash movements.
- Lending, loans, mortgage principal/interest payments and an upcoming-payments view. Recurring schedules require an explicit payment; reminders never move money automatically.
- Monthly budgets with dated allowance versions, optional positive-balance rollover, actual spending and over-budget notices.
- Savings goals allocating existing cash, with progress, target dates and monthly contribution estimates.
- Record search, categories, date filters, sorting and quick expense entry.
- Bank CSV import with column/date/decimal mapping, row selection, review and repeat-import duplicate detection; CSV exports and complete JSON backups.
- Portfolio history, income history, market quotes and investment benchmarks. Daily background portfolio capture is available on Vercel.
- Custom categories with stable colors, preferences, light/dark themes, Google/email sign-in and recoverable deletion.

## Local setup

Use Node.js 24 (minimum supported version: 22.13). Run `npm ci`, copy `.env.example` to `.env.local`, and configure your own Supabase URL and publishable key. Enable the desired sign-in providers in Supabase. Never commit credentials.

For a fresh database, run `database/setup.sql` once in Supabase. For an existing database, apply only unapplied files from `migrations/` in ascending numeric order. Do not run the fresh setup over an existing installation. See [the planning upgrade](docs/planning-upgrade.md) for migrations 018–023.

- `npm run dev`: portable Vinext development server on localhost.
- `npm run build:production`: production Next.js build used by Vercel.
- `npm run build`: alternative Sites/Vinext build.
- `npm test`: calculation, validation, API and isolated PostgreSQL tests; no live database is used.
- `npm run typecheck`: TypeScript check (run after production build to generate route types).
- `npm run test:integration`: local HTTP auth integration test; requires a production build and permission to bind loopback ports. This does not use a browser or real account.
- `npm run lint`: repository lint check.

GitHub Actions runs the test suite, production build, type check and auth integration check for pushes and pull requests. PGlite is a development dependency used for isolated SQL tests.

## Runtime configuration

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are required for account data. `TWELVE_DATA_API_KEY` enables stock prices and benchmark feeds. Market requests preserve saved values when prices are unavailable.

Background capture additionally requires server-only `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. The Vercel schedule invokes `/api/cron/portfolio-snapshots` daily at 18:00 UTC (23:00 Tashkent). It cannot run while developing locally without an external scheduler. Missing quotes or FX prevent incomplete totals from overwriting snapshots; failed captures return a non-success status for monitoring. No historical prices are invented.

See [Vercel setup](VERCEL.md), [currency handling](docs/currencies.md), [portfolio history](docs/portfolio-snapshots.md) and [benchmark calculations](docs/investment-comparison.md). Project conventions are in [AGENTS.md](AGENTS.md).
