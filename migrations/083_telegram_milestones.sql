-- One-time Telegram celebrations: a first record, savings goals passing 25, 50,
-- 75 and 100 percent, and a new net-worth high. A row is written before the
-- message is sent, so a retry or a second device never repeats one. `value`
-- holds the last celebrated net worth. Server-only, like telegram_drafts.
-- Apply after 082. No existing rows are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_milestones (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 80),
 value numeric CHECK (value IS NULL OR abs(value) < 1e30),
 achieved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, key)
);
ALTER TABLE public.telegram_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_milestones FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_milestones TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
