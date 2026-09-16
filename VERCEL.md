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
