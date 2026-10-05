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

Crypto spot prices use Coinbase's public feed, and Kraken's public ticker for the
coins Coinbase does not price (`krakenCoins` in `lib/server-market.ts`); USD/UZS uses the CBU official
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
`TELEGRAM_WEBHOOK_SECRET` (any long random string). Also set
`TELEGRAM_LOGIN_SECRET`, another long random string: it keys the derived
passwords of accounts created in Telegram, so the webhook secret, which Telegram
sends in a header on every call, is not also a password key. Without it the
webhook secret is used as before; once it is set, accounts made earlier move to
it on their next one-tap or Mini App sign-in. In BotFather, send `/setjoingroups`
and choose **Disable**, so the bot cannot be added to groups (it ignores group
chats anyway). Deploy, then register the webhook once, substituting your values:

```bash
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" -d "url=https://<your-domain>/api/telegram/webhook" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d "allowed_updates=[\"message\",\"callback_query\"]"
```

Owners connect from **Settings → Profile & preferences → Telegram
notifications**: Connect opens the bot with a code that works for ten minutes,
and pressing Start in Telegram links the chat. `/stop` in the chat or
Disconnect in Settings unlinks it. Chat links are not part of backups. Without
the three variables, the Settings panel reports that Telegram is awaiting server
setup and nothing is sent.

The morning digest runs from `vercel.json` at 04:00 UTC (09:00 in Tashkent)
through `/api/cron/telegram-digest`, protected by the same `CRON_SECRET`. The digest
opens with a greeting by the name saved in Settings and one line of
encouragement, then lists what is overdue or due in each owner's reminder window
(snoozes from the Upcoming page apply), yesterday's net-worth change and the
last seven days' spending against the seven before. It is sent every morning,
and answers 503 when any owner could not be reached so monitoring notices.
`/api/cron/telegram-recap` sends a weekly recap on Sundays at 15:00 UTC: money
saved, the top spending category and the goals that received contributions, with
a share button that carries no amounts. Celebrations (first record, a savings
goal passing 25/50/75/100 percent, a new net-worth high found by the daily
snapshot cron) are sent once each and recorded in `telegram_milestones`
(migration 083). Digest and recap follow the digest switch; celebrations follow
the milestone switch, checked by the write routes after the response, so they
never delay or fail a save. Saves made in the app are not announced one by
one in Telegram; only the bot replies to entries made in the bot.

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

## Rate limits and security headers

Apply `migrations/106_rate_limits.sql` in the Supabase SQL Editor after 105.
It adds `public.rate_limits` (row security on, no policies, no grants to
`anon` or `authenticated`) and `public.hit_rate_limit(bucket, max_hits,
window_seconds)`, a fixed-window counter callable only by the service role.
`lib/rate-limit.ts` counts with `SUPABASE_SERVICE_ROLE_KEY`; nothing new needs
configuring. Keys are the visitor's address (`x-real-ip`, set by Vercel) and,
where it applies, the email, phone number or user id, hashed with that key
before they reach the database. The limits (`limits` in that file) cover
password sign-in, phone code sending and checking (separately), sign-up,
recovery and credential changes, the Assistant (per person, 30 an hour and 100
a day), comparison loads, and market prices for visitors who are not signed in.
Over a limit the answer is 429 "Too many attempts. Please try again later."
Without the service key, or before the migration is applied, requests are let
through and the server logs "Rate limit unavailable" with a status only.

Supabase Auth still sees every sign-in from the server's address, so its own
per-address limits apply to the app as a whole; the app's limits above are what
separate one visitor from another.

Production responses send `Strict-Transport-Security: max-age=63072000;
includeSubDomains`. The Content Security Policy is still report-only (nothing
is blocked; violations appear in the browser console) and allows
`connect-src` to the `SUPABASE_URL` origin read at build time, because
attachment uploads go straight to Supabase Storage.

## Monitoring and alerts

Nothing new needs to be installed. `lib/monitoring.ts` writes every server
failure as one JSON line on stderr (`{"level":"error","source":…,"message":…,
"name":…,"stack":…,"route":…,"status":…,"release":…,"at":…}`), so it shows in
Vercel › Project › Logs; filter by level Error or search for `"level":"error"`.
`release` is `VERCEL_GIT_COMMIT_SHA`. Before anything is written, messages
and stacks are scrubbed of emails, phone numbers and long numbers (amounts),
ids, bearer tokens, JWTs, API keys and URL query strings. Request bodies,
balances, cookies and raw user ids are never included; a user id appears only
as `userIdHash`, an HMAC keyed with `SUPABASE_SERVICE_ROLE_KEY`.

What is reported: failed or partial cron runs (portfolio snapshots, Telegram
digest and recap, with their sent/failed or captured/skipped counts), Telegram
webhook processing failures, the Send SMS hook failing to deliver a sign-in
code, unexpected Assistant errors, database failures that answer 5xx through
`postgrestFailure` (`lib/api-route.ts`), and browser errors.

Browser errors: `ErrorReporter` (root layout) sends uncaught errors and
unhandled promise rejections, at most five per page load, to
`POST /api/client-errors` (same origin, 10 a minute and 100 a day per address,
8 KB at most, only the message, stack, page path without query and Next's
digest). The error boundaries `app/error.tsx` and `app/global-error.tsx` show a
retry and report the digest, which matches the server log line of the same
failure.

Optional variables (Production environment), then redeploy:

- `SENTRY_DSN`: a Sentry project's DSN (Project settings › Client Keys). Each
  report is also posted to Sentry's envelope endpoint, with a two-second
  timeout; a Sentry outage never affects a request. Sentry's free Developer
  plan is enough.
- `TELEGRAM_ALERT_CHAT_ID`: your own chat with the bot (or a private group the
  bot is in). Send the bot any message, open
  `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates` and copy
  `"chat":{"id":…}`. While the webhook is set getUpdates returns nothing, so
  read it before registering the webhook, or call `deleteWebhook`, read it and
  register the webhook again. Alerts go out for cron failures and partial runs,
  webhook and sign-in code failures and a rejected Assistant key at once, and
  for repeated failures (more than five in ten minutes: database 5xx,
  Assistant errors) once they keep happening. Each failure alerts at most once
  an hour and all alerts together at most twenty an hour, counted with the
  rate limiter of migration 106 (per server instance when the database cannot
  count). An alert names the source, the scrubbed error, route, status and
  commit, with the time written as `5 October 2026 09:30`.

### Uptime monitor

`GET /api/health` answers `{"ok":true,"db":true}` with 200 while the app runs
and its database answers, and `{"ok":false,"db":false}` with 503 otherwise
(also without `SUPABASE_SERVICE_ROLE_KEY`). It needs no sign-in, returns no
data, is never cached and allows 30 checks a minute per address. Point a free
monitor at it, for example UptimeRobot (New monitor › HTTP(s), URL
`https://<your-domain>/api/health`, every 5 minutes, alert contact: email or
Telegram) or Better Stack Uptime (Monitors › Create, "URL becomes unavailable",
3-minute checks). Both treat any status other than 2xx as down.

### Cron failures in Vercel

A cron route answers 503 when its run failed or was partial, so Vercel marks
the invocation as failed: Vercel › Project › Settings › Cron Jobs lists each
job with **View logs**, and Logs can be filtered by the cron paths
(`/api/cron/…`). Vercel does not notify about failed cron invocations itself;
the Telegram alert above (or a Sentry alert rule on `source:cron:*`) is the
notification.
