BEGIN;
CREATE TABLE public.investment_account_links (
 id uuid PRIMARY KEY REFERENCES public.investment_history(id),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES public.finance_records(id),amount numeric NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.investment_account_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.investment_account_links FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.investment_account_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.investment_account_links TO authenticated;
CREATE FUNCTION public.record_investment_with_account(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r public.finance_records; prior public.investment_account_links; result jsonb; delta numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 PERFORM id FROM public.finance_records WHERE id IN(p_account,p_record_id) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=auth.uid() AND kind='Cash';
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid() AND kind IN ('Stock','Crypto','Deposit','Property','Business');
 IF a.id IS NULL OR r.id IS NULL OR a.currency<>r.currency OR p_type='valuation' THEN RAISE EXCEPTION 'Choose an account in the investment currency.'; END IF;
 delta:=CASE WHEN p_type IN ('income','withdrawal') THEN p_amount ELSE -p_amount END;
 SELECT * INTO prior FROM public.investment_account_links WHERE id=p_id;
 IF FOUND THEN
  IF prior.user_id<>auth.uid() OR prior.account_id<>p_account OR prior.amount<>delta THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 END IF;
 IF EXISTS(SELECT 1 FROM public.investment_history WHERE id=p_id) THEN RAISE EXCEPTION 'This update was already saved without an account.'; END IF;
 result:=public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 UPDATE public.finance_records SET amount=amount+delta WHERE id=p_account;
 INSERT INTO public.investment_account_links(id,user_id,account_id,amount) VALUES(p_id,auth.uid(),p_account,delta);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) TO authenticated;
-- Supabase's service role is used exclusively by the authenticated cron endpoint.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT ON public.finance_records TO service_role;
 GRANT SELECT,INSERT,UPDATE ON public.portfolio_snapshots TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
