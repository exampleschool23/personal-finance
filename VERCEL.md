# Vercel deployment

Import `exampleschool23/personal-finance` in Vercel with the **Next.js** preset.
The Vercel build command is `npx next build --webpack`, with the default `.next`
output directory. `vercel.json` records these overrides; the existing
`npm run dev` command still runs the local Vinext preview on port 5173.

Set these environment variables in Vercel for Production and Preview:

- `SUPABASE_URL`: the existing Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: the existing Supabase publishable key.

Do not upload `.env`, add account passwords to source, or use a service-role key.
The app's Supabase authentication and record-level access policies remain in use.
Sites-specific hosting access controls do not apply to Vercel deployments.

## Google sign-in

Vercel hosts the app; Supabase handles Google authentication. The login page
posts to `/api/auth/google`, which starts a PKCE flow. `/auth/callback`
exchanges the one-time code and establishes the existing HTTP-only session
cookies. The short-lived verifier is also HTTP-only and cleared on callback.

1. Create a Google OAuth Web application client.
2. Set its authorized redirect URI to
   `https://hnwxybhsvnutcsqwscul.supabase.co/auth/v1/callback`.
   Add JavaScript origins `https://personal-finance-eta-nine.vercel.app` and
   `http://localhost:5173`. If Google is in Testing mode, add your Google account
   to its test users.
3. Enable Google in Supabase and enter the Google client ID and secret there.
4. In Supabase Authentication URL Configuration, allow exactly:
   - `https://personal-finance-eta-nine.vercel.app/auth/callback`
   - `http://localhost:5173/auth/callback`
   Set Site URL to `https://personal-finance-eta-nine.vercel.app`.
5. Preserve the intended invitation-only account policy when enabling Google.

See https://supabase.com/docs/guides/auth/social-login/auth-google.

Google credentials belong in Supabase, not the repository or Vercel. No new
Vercel environment variables are needed. Existing email/password sign-in remains.
When the provider is disabled, the button returns a setup message instead of a
raw provider error. Real Google sign-in can only be verified after provider setup.

## Validation

Run `npx next build --webpack`, then `node --test tests/google-auth.mjs`.
The test runs Next.js on localhost:5189 against an isolated mock Supabase server;
it covers disabled providers, cross-origin rejection, PKCE binding, cancellation,
missing verifier, failed exchanges, secure cookies, and redirect confinement.

## Market prices

Set `TWELVE_DATA_API_KEY` in Vercel Production (and Preview if needed), then
redeploy. For local stock quotes, set it in `.env` and restart the dev server.
The server-only key is never returned to the browser. Stock requests require
sign-in and support USD-listed ticker symbols. Provider plan limits and quote
delays apply; up to 20 unique stock tickers are requested per refresh.

Crypto spot prices use Coinbase's public feed; USD/UZS uses the CBU official
rate and displays its effective date. The app refreshes every five minutes
while visible, with upstream caching (five minutes for quotes, one hour for FX).
Saved values are used when a quote fails. Without FX, only records in the
selected currency are included. Display conversion never rewrites stored
currency, purchase cost, or balances. Coin/ticker identity uses the record name,
so this feature needs no database migration.

Code checks: `node --experimental-strip-types --test tests/market*.mjs`.

## Record pagination

Before deploying pagination, run `migrations/003_record_pagination.sql`
in Supabase SQL Editor (after `migrations/001_lending_dates.sql` and `migrations/002_charity.sql`). It adds an
RLS-protected, invoker-rights RPC and a date-sort index. The API requests 10 records
per page, filtered by section and, when FX is unavailable, display currency.
Money lent sorts by lending date (falling back to the legacy due date); other
records sort by their date. UUID breaks equal-date ties. Newest dates come first.
Grouped summaries load once per workspace session and after record mutations,
so totals, fetched valuations, chart groups, and name suggestions span all pages.
Summary responses omit transaction notes and dates. Pagination cannot run until
the SQL function is installed; there is no unbounded-fetch fallback.

## Settings and fiat currencies

Run `migrations/004_settings_and_fiat_currencies.sql` after migration 003 before
deploying Settings. This creates owner-only account preferences and broadens
record/RPC currency validation. The language switcher is temporary; Settings
stores the account default. At least one preferred currency is required.
See `docs/currencies.md` for ISO catalogue provenance and rate-provider rules.

## Business assets

Run `migrations/005_business_assets.sql` after migration 004 before deploying.
Business assets store current ownership value. Income and expense records may
reference a business through `business_id`; this does not change asset values.
The database enforces same-owner links to Business records. Linked businesses
cannot be deleted or recategorized until their income/expense links are cleared.
The paginated summary includes a lightweight list of all owned businesses, so
link selectors work even when a business is on another record page.

Run `migrations/007_estimated_asset_income.sql`, then `migrations/008_ten_records_per_page.sql` to enable estimates and the 10-record page limit.

## Monthly expense plans

Before deploying monthly plans, run `migrations/013_monthly_expense_plans.sql`
in the Supabase SQL Editor after migrations 009–012. For a fresh database,
`database/setup.sql` includes these changes. The migration adds owner-protected
plans and links one-time expense records to them; existing records are unchanged.

In **Income & expenses → Monthly expense plans**, add a name, category, preferred
currency, monthly amount, start date and optional end date. Use **Record spending**
or select a monthly plan in the expense form to link an actual payment. Linked
payments must use the plan currency and fall within its dates. Payments remain
editable and deletable in the regular records table. Plans with spending cannot
be deleted; their currency and dates must remain compatible with those payments.

The current month (Asia/Tashkent) shows planned, spent and remaining amounts per
plan. A full monthly budget applies in every overlapping start/end month, with
no proration or carryover. Forecast expenses include the greater of planned and
spent per plan, plus existing recurring expenses and mortgage estimates. Plans
do not create transactions or affect asset balances. Remove a replaced recurring
expense yourself to avoid budgeting the same expense twice. Editing a plan
changes its current monthly budget; this feature does not store historical budget
versions. Missing exchange rates exclude that plan from converted forecasts with
an explicit message; failed plan reads leave projected totals unavailable.
