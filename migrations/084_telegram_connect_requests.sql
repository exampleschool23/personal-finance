-- Connecting a Telegram chat by signing in on the web. The bot's "I already
-- have an account" button creates a single-use request tied to the chat; the
-- person signs in on the website with any method and confirms, and the server
-- links the chat to that account. Only the token's hash is stored, and only the
-- server reads or writes these rows.
-- Apply after 083.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_connect_requests (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 chat_id bigint NOT NULL,
 telegram_user_id bigint NOT NULL,
 first_name text CHECK (first_name IS NULL OR char_length(first_name) <= 80),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_connect_requests_chat_id ON public.telegram_connect_requests (chat_id);
CREATE INDEX IF NOT EXISTS telegram_connect_requests_expires_at ON public.telegram_connect_requests (expires_at);
ALTER TABLE public.telegram_connect_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_connect_requests FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_connect_requests TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
