# Sending account emails with Resend

Sign-up confirmation and password recovery emails are sent by Supabase Auth.
Supabase's built-in sender allows two emails per hour and only to members of
your Supabase organization, so a real launch sends them through Resend over SMTP.
No application code changes: this is all configuration.

## 1. Resend

1. Create a Resend account and add your domain (for example `mail.yourdomain.com`).
2. Add the DNS records Resend shows (SPF, DKIM) and wait until the domain is **Verified**.
3. Create an API key with sending access. It is the SMTP password.
4. The free plan allows 100 emails a day and 3,000 a month. Upgrade to a paid plan
   before launch so a busy day of sign-ups cannot stop confirmation emails.

## 2. Supabase SMTP

Authentication → Emails → SMTP Settings → enable custom SMTP:

| Field | Value |
| --- | --- |
| Sender email | `noreply@mail.yourdomain.com` (an address on the verified domain) |
| Sender name | Hoggish |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the Resend API key |

Then open Authentication → Rate Limits and raise the email limit from the starting
30 per hour to about 300.

## 3. Email templates (required)

This app verifies a token hash on its own `/auth/confirm` page. Supabase's default
template link does not work with it, so paste the files in `docs/email-templates/`
into Authentication → Emails → Templates:

| Template | Subject | File |
| --- | --- | --- |
| Confirm signup | Confirm your Hoggish account | `confirm-signup.html` |
| Reset password | Reset your Hoggish password | `reset-password.html` |

The links use `{{ .RedirectTo }}`, which the app sets to `APP_ORIGIN/auth/confirm`
when it requests the email. The same template therefore works on localhost and in
production. `tests/email-templates.mjs` keeps the link format in step with the page.

## 4. Redirects and variables

- Authentication → URL Configuration: Site URL is your production `https` domain.
  Redirect URLs include `https://your-domain/**` and, for local testing, `http://localhost:5000/**`.
- Vercel: `APP_ORIGIN=https://your-domain`, `PUBLIC_SIGNUP_ENABLED=true`.
- Keep **Confirm email** on in Authentication → Sign In / Providers → Email.

## 5. Check before announcing

Sign up with a Gmail and an Outlook address that are not on your team. Confirm the
email arrives in the inbox, the link opens the confirm page, pressing the button
signs you in, and "Forgot password" delivers a working reset link. Look in spam too.
