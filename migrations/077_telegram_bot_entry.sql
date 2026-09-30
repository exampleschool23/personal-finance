-- The Telegram bot adds records with buttons. Its half-finished entry lives in
-- telegram_drafts until the owner saves or cancels. Saving goes through the
-- same functions the app uses, run as the linked owner: the wrappers below set
-- the owner claim for the transaction and hand off, so validation, revisions
-- and undo behave exactly as in the app. Only the service role may call them,
-- and only for an owner whose chat is linked.
-- Apply after 076. No existing rows are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_drafts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 step text NOT NULL CHECK (char_length(step) <= 40),
 data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data)='object' AND pg_column_size(data) <= 16384),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_drafts FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_drafts TO service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_subscriptions TO service_role;
END IF; END $$;

CREATE OR REPLACE FUNCTION public.telegram_owner_context(p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM public.telegram_subscriptions WHERE user_id=p_owner AND chat_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Telegram is not connected.';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',p_owner::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',p_owner,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
END $$;
REVOKE ALL ON FUNCTION public.telegram_owner_context(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.telegram_save_finance_record(p_owner uuid,p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.telegram_owner_context(p_owner);
 RETURN public.save_finance_record(p_record,NULL);
END $$;
REVOKE ALL ON FUNCTION public.telegram_save_finance_record(uuid,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.telegram_save_finance_record(uuid,jsonb) TO service_role; END IF; END $$;

CREATE OR REPLACE FUNCTION public.telegram_planning_action(p_owner uuid,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.telegram_owner_context(p_owner);
 IF p_action='occurrence' THEN RETURN public.planning_action_with_actual_amount(p_action,p_data); END IF;
 RETURN public.planning_action(p_action,p_data);
END $$;
REVOKE ALL ON FUNCTION public.telegram_planning_action(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.telegram_planning_action(uuid,text,jsonb) TO service_role; END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
