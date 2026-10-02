# Vercel deployment

Import `exampleschool23/personal-finance` in Vercel with the **Next.js** preset.
The Vercel build command is `npx next build --webpack`, with the default `.next`
output directory. `vercel.json` records these overrides; the existing
`npm run dev` command still runs the local Vinext preview on port 5000.

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
   `http://localhost:5000`. If Google is in Testing mode, add your Google account
   to its test users.
3. Enable Google in Supabase and enter the Google client ID and secret there.
4. In Supabase Authentication URL Configuration, allow exactly:
   - `https://personal-finance-eta-nine.vercel.app/auth/callback`
   - `http://localhost:5000/auth/callback`
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
stores the account default. One or two preferred currencies are required.
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
no proration. Migration 019 adds optional positive-balance carryover. Forecast expenses include the greater of planned and
spent per plan, plus existing recurring expenses and mortgage estimates. Plans
do not create transactions or affect asset balances. Remove a replaced recurring
expense yourself to avoid budgeting the same expense twice. With migration 019, amount and rollover changes apply from the selected forecast
month, preserving earlier budget versions. Missing exchange rates exclude that plan from converted forecasts with
an explicit message; failed plan reads leave projected totals unavailable.

## Accounts, goals and data tools

After migration 017, apply migrations 018–022 in numeric order. These enable
linked cash accounts, transfers and repayments, in-app payment reminders,
versioned budgets, goals, statement imports, and consistent complete backups.
See [the upgrade guide](docs/planning-upgrade.md) for behavior and migration order.

For daily portfolio capture while the app is closed, configure server-only
`CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`, then deploy. The daily schedule
is already declared in `vercel.json`; missing prices leave prior observations
intact and cause a failure response for monitoring.

## Telegram notifications and bot entry

Apply `migrations/075_telegram_subscriptions.sql` and
`migrations/077_telegram_bot_entry.sql` after 076. Then create a bot
with [@BotFather](https://t.me/BotFather) (`/newbot`), and set three server-only
variables on Vercel: `TELEGRAM_BOT_TOKEN` (from BotFather),
`TELEGRAM_BOT_USERNAME` (the bot's handle without `@`) and
`TELEGRAM_WEBHOOK_SECRET` (any long random string). Deploy, then register the
webhook once, substituting your values:

```bash
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" -d "url=https://<your-domain>/api/telegram/webhook" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d "allowed_updates=[\"message\",\"callback_query\"]"
```

Owners connect from **Settings → Profile & preferences → Telegram
notifications**: Connect opens the bot with a code that works for ten minutes,
and pressing Start in Telegram links the chat. `/stop` in the chat or
Disconnect in Settings unlinks it. Chat links are not part of backups. Without
the three variables, the Settings panel reports that Telegram is awaiting server
setup and nothing is sent.

The morning digest arrives at each owner's local morning. `vercel.json` runs
`/api/cron/telegram-digest` every hour, protected by the same `CRON_SECRET`;
each run sends to owners whose local time is between 08:00 and 12:00 and who
have not had today's digest. The local day is claimed in
`telegram_subscriptions.digest_sent_on` before sending (migration 095), so
nobody gets two digests a day and a failed send is retried the next hour. The
time zone is `user_preferences.timezone`, set in **Settings → About you**
(filled from the browser the first time Settings opens); without one it is
derived from the country, then from a language spoken mainly in one country,
then UTC. Hourly cron jobs need a Vercel plan that allows them (Hobby runs cron
jobs at most once a day). The digest
opens with a greeting by the name saved in Settings and one line of
encouragement, then lists what is overdue or due in each owner's reminder window
(snoozes from the Upcoming page apply), yesterday's net-worth change and the
last seven days' spending against the seven before. It is sent every morning,
and answers 503 when any owner could not be reached so monitoring notices.
`/api/cron/telegram-recap` (also hourly) sends a weekly recap on Sunday between 18:00 and 22:00 local time, once per Sunday (`recap_sent_on`): money
saved, the top spending category and the goals that received contributions, with
a share button that carries no amounts. Celebrations (first record, a savings
goal passing 25/50/75/100 percent, a new net-worth high found by the daily
snapshot cron) are sent once each and recorded in `telegram_milestones`
(migration 083). Digest and recap follow the digest switch; celebrations follow
the action-message switch. A message after every saved action is sent from
the write routes themselves, after the response, and never delays or fails a
save.

Once linked, the bot's keyboard adds records with buttons: Expense, Income,
Transfer, Pay loan or debt, Mortgage payment and Upcoming payments. An entry
can also be typed as one message, read by fixed rules in
`lib/telegram-entry.ts` (no AI): "coffee 4.5", "taxi 25 000 uzs", "+1500
salary", "lunch 12 eur yesterday", "groceries 30 card". The amount, an optional
currency from the owner's preferred currencies, a sign for income, today or
yesterday (in any app language) or a typed date, and a cash account's name are
recognised; the category comes from the owner's transaction rules, then their
last record with the same name, then a keyword table. The bot shows a
confirmation card with Save, Change category, Change account (and Change
business) and Cancel; nothing is saved before Save. Text it cannot read gets the
menu and an example. When the owner has businesses, expenses and income may name
one (business income must). Expenses and income may be entered in another
preferred currency than their account, and loans and mortgages may be paid from
an account in another currency: the bot converts with the app's dated rates
(ECB, then the Central Bank of Uzbekistan) and, when no rate exists for the day,
asks for the converted amount or the rate instead of guessing. Transfers across
currencies ask for the amount received. Saving goes through
`telegram_save_finance_record`, `telegram_planning_action` and
`telegram_payment_with_fx` (migration 095), which run the
app's own save functions as the linked owner and are callable only by the
service role, so validation, revisions, undo and Recently deleted behave as in
the app. A half-finished entry lives in `telegram_drafts` for thirty minutes.
