-- Telegram at local time, and bot payments across currencies.
-- 1. user_preferences.timezone: the owner's IANA time zone, edited in Settings.
--    Empty means "derive it" (country, then language, then UTC), so existing
--    rows need no rewrite. Owner RLS already protects the row.
-- 2. telegram_subscriptions.digest_sent_on / recap_sent_on: the local day the
--    last digest and recap went out. The hourly crons claim the day before
--    sending, so nobody gets two in one day. Server-only: the column grants for
--    the app role (migration 081) do not include them.
-- 3. telegram_payment_with_fx: lets the bot pay a loan or mortgage from a cash
--    account in another currency through the app's own dated-rate functions,
--    as the linked owner, callable only by the service role.
-- Apply after 094.
BEGIN;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS timezone text
 CHECK (timezone IS NULL OR (length(timezone) BETWEEN 1 AND 64 AND timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$'));
ALTER TABLE public.telegram_subscriptions
 ADD COLUMN IF NOT EXISTS digest_sent_on date,
 ADD COLUMN IF NOT EXISTS recap_sent_on date;

CREATE OR REPLACE FUNCTION public.telegram_payment_with_fx(p_owner uuid,p_action text,p_data jsonb,p_rate numeric,p_rate_date date,p_account_currency text,p_record_currency text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE principal numeric:=(p_data->>'amount')::numeric; interest numeric:=coalesce((p_data->>'fee')::numeric,0);
BEGIN
 PERFORM public.telegram_owner_context(p_owner);
 IF p_action='repayment' THEN RETURN public.record_repayment_with_fx(p_data,p_rate,p_rate_date,p_account_currency,p_record_currency); END IF;
 IF p_action='mortgage' THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=(p_data->>'target_id')::uuid AND user_id=p_owner AND kind='Mortgage') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
  RETURN public.record_investment_with_fx((p_data->>'id')::uuid,(p_data->>'target_id')::uuid,'mortgage_payment',(p_data->>'date')::date,principal+interest,NULL,coalesce(p_data->>'notes',''),(p_data->>'account_id')::uuid,p_rate,p_rate_date,p_account_currency,p_record_currency,principal,interest);
 END IF;
 RAISE EXCEPTION 'Check the account fields.';
END $$;
REVOKE ALL ON FUNCTION public.telegram_payment_with_fx(uuid,text,jsonb,numeric,date,text,text) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.telegram_payment_with_fx(uuid,text,jsonb,numeric,date,text,text) TO service_role; END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
