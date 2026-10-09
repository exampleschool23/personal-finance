-- Apply after 128.
-- Which scheduled Telegram messages each owner has been sent: the morning digest
-- (one per day) and the weekly recap (one per week, keyed by its last day). The
-- cron routes claim a row before sending and remove it when the send fails, so a
-- retried or overlapping run never sends the same message twice. Personal and
-- server-only, like telegram_milestones. Re-runnable; no existing rows change.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_deliveries (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('digest','recap')),
 period date NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, kind, period)
);
ALTER TABLE public.telegram_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_deliveries FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT,INSERT,DELETE ON public.telegram_deliveries TO service_role;
END IF; END $$;
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',129,'record_revisions',true,'verified_restore',true)
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
