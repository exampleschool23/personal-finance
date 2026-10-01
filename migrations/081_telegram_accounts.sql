-- Accounts that start in Telegram. A person who shares their number with the
-- bot gets a workspace with the phone already confirmed, and the same number
-- signs them in on the web: the code is delivered to their Telegram chat by the
-- Send SMS hook instead of by SMS. The subscription row remembers who the
-- Telegram user is, and single-use tokens power the "Open in browser" button.
-- Owners may still change their own notification settings, but never the
-- identity columns: those are written only by the server.
-- Apply after 080.
BEGIN;
ALTER TABLE public.telegram_subscriptions
 ADD COLUMN IF NOT EXISTS telegram_user_id bigint UNIQUE,
 ADD COLUMN IF NOT EXISTS phone text UNIQUE CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
 ADD COLUMN IF NOT EXISTS first_name text CHECK (first_name IS NULL OR char_length(first_name) <= 80),
 ADD COLUMN IF NOT EXISTS consented_at timestamptz;

REVOKE INSERT, UPDATE ON public.telegram_subscriptions FROM authenticated;
GRANT INSERT (user_id, digest_enabled, actions_enabled, link_code, link_code_expires_at, chat_id, linked_at, updated_at) ON public.telegram_subscriptions TO authenticated;
GRANT UPDATE (digest_enabled, actions_enabled, link_code, link_code_expires_at, chat_id, linked_at, updated_at) ON public.telegram_subscriptions TO authenticated;

CREATE TABLE IF NOT EXISTS public.telegram_login_tokens (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_login_tokens_expires_at ON public.telegram_login_tokens (expires_at);
ALTER TABLE public.telegram_login_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_login_tokens FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_login_tokens TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
