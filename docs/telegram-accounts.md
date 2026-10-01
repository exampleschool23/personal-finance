# Accounts that start in Telegram

A person can create an account entirely in the bot, and sign in on the web with
the same phone number. Telegram verifies the number for free, and the sign-in
code travels through the Telegram chat instead of SMS, so no SMS provider is
needed.

## How it works

1. **Bot sign-up.** `/start` greets (clearing any number button left from an
   earlier visit) and offers **Create an account** or **I already have an
   account**, with the terms and privacy links below. Creating shows a
   **Share my number** button. Someone who signed out of an account made in
   the bot gets the same layout in that account's language: **Sign in with my
   number** or **Sign in on the web**, never sign-up. Only the person's own contact is accepted
   (Telegram reports the contact's user, which must equal the sender).
2. **Account.** The server creates a Supabase user with the phone already
   confirmed, a preferences row, and a linked Telegram chat. Its password is
   derived from `TELEGRAM_WEBHOOK_SECRET` and the Telegram user id, never stored
   or shown.
3. **Setup in the chat.** Language, main currency, then a first cash account
   (name and balance). Finishing marks the account as set up, so the web welcome
   setup is skipped.
4. **Open the web app.** The bot sends **Open app** (a Telegram Mini App) and
   **Open in browser** (a single-use link valid for five minutes). Both sign the
   person in with the derived password.
5. **Sign in with the phone.** The sign-in page offers **Continue with phone**.
   Supabase makes the code and calls our Send SMS hook, which delivers it to the
   Telegram chat linked to that account.

## Connecting an existing account from the bot

The welcome message also offers **I already have an account**. The bot answers
with a **Sign in** button: a single-use link, valid for 15 minutes, tied to that
chat and Telegram user (`lib/telegram-connect.ts`, table
`telegram_connect_requests` from migration 084).

1. The link (`/api/telegram/connect?c=…`) keeps the token in an httpOnly cookie
   and opens `/connect/telegram`.
2. A signed-out visitor is sent to the normal sign-in page. Any sign-in method
   works: after signing in, `/api/auth` sees the cookie and returns them to the
   confirmation page, so new methods (Google, Facebook, phone) need no extra work.
3. The page shows the Telegram name and the account, warns to continue only if
   they pressed **Sign in** in the bot themselves, and offers one **Connect**
   button. After connecting, the page returns straight to the Telegram chat.
4. **Connect** spends the request atomically, links the chat (an earlier owner
   of the chat is signed out first), and the bot sends "Connected" with the menu.

Nothing is linked without that confirmation, so a link someone else sends cannot
silently attach a victim's account to the sender's chat. The link opens in a
normal browser rather than the Mini App, because Google refuses sign-in inside
embedded web views.

Existing email accounts can also connect from Settings, and can send `/phone` to the bot from a linked chat
to add a number to an email account. An account created with a phone number can
add an email and password in Settings, which also unlocks changing the password
and deleting the account.

## Signing out

The bot's menu has a **Sign out** button (`/signout` and `/stop` do the same). It
unlinks the chat, drops any half-finished entry and removes the keyboard, and the
app's Settings then shows Telegram as not connected.

- An account that signs in with its number keeps its Telegram identity, so
  sharing the same number in the chat signs back in.
- An account linked from the app has no number, so its Telegram identity is
  released. The same person can then share a number to start a new account, or
  connect any web account from its Settings.

## Setup

1. Apply `migrations/081_telegram_accounts.sql` after 080, and
   `migrations/084_telegram_connect_requests.sql` after 083.
2. In Supabase, open Authentication, then Sign In / Providers, and enable
   **Phone**. Keep phone confirmation on. No SMS provider is required because the
   hook below replaces SMS.
3. In Authentication, then Hooks, create a **Send SMS** hook of type HTTPS with
   the address `https://<your-domain>/api/auth/send-sms-hook`. Generate its
   secret, which looks like `v1,whsec_...`. Check that your Supabase plan includes
   Auth hooks.
4. In Vercel, add `SEND_SMS_HOOK_SECRET` with that secret. The other variables
   the feature needs are already used by Telegram: `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` and `APP_ORIGIN`. Redeploy.
5. Write your terms of use and privacy policy. The bot's agreement text refers to
   them, and phone numbers are personal data.

Without `SEND_SMS_HOOK_SECRET` the sign-in page hides **Continue with phone**.
Without the service key or `TELEGRAM_WEBHOOK_SECRET` the bot says registration is
not available yet.

## Security notes

- A code is only sent to the Telegram chat linked to the account, never to the
  phone network, so a recycled phone number cannot receive it.
- Asking for a code never creates an account and answers the same for known and
  unknown numbers. Supabase rate-limits code requests and attempts.
- Single-use sign-in links store only a SHA-256 hash and are spent atomically.
- Owners cannot edit `telegram_user_id`, `phone` or `consented_at` on their own
  row: those columns are written only by the server.
- Telegram bot chats are not end-to-end encrypted. Say so in your privacy policy.
- If the derived password stops working (the person set their own), one-tap
  links fall back to the phone code.
- Rotating `TELEGRAM_WEBHOOK_SECRET` also changes every derived password, so
  one-tap sign-in stops until people sign in once with a code.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Code never arrives | The account has no linked chat, or the hook secret on Vercel differs from Supabase. Check the hook's delivery log. |
| Hook answers 401 | `SEND_SMS_HOOK_SECRET` does not match the secret Supabase generated. |
| "Phone sign-ups are disabled" | Phone provider is off in Supabase. |
| Bot says registration is unavailable | `SUPABASE_SERVICE_ROLE_KEY` or `TELEGRAM_WEBHOOK_SECRET` missing on Vercel. |
| "Could not connect Telegram" on the connect page | Migration 084 is not applied, or `SUPABASE_SERVICE_ROLE_KEY` is missing. |
| Open app asks to sign in | The account was not created in Telegram, or its password was changed. |
