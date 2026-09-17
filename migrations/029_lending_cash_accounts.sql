-- Link borrowing and principal repayments to their actual cash account.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_investment_with_account(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r public.finance_records; prior public.investment_account_links; result jsonb; delta numeric; lending boolean; last_day date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 PERFORM id FROM public.finance_records WHERE id IN(p_account,p_record_id) AND user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=auth.uid() AND kind='Cash';
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid()
  AND kind IN ('Stock','Crypto','Deposit','Property','Business','Debt','Loan','Money lent','Mortgage');
 IF a.id IS NULL OR r.id IS NULL OR a.currency<>r.currency OR p_type='valuation' THEN RAISE EXCEPTION 'Choose a cash account in the record currency.'; END IF;
 lending:=r.kind IN ('Debt','Loan','Money lent','Mortgage');
 delta:=CASE
  WHEN r.kind IN ('Debt','Loan','Mortgage') THEN CASE WHEN p_type='contribution' THEN p_amount ELSE -p_amount END
  WHEN p_type IN ('income','withdrawal') THEN p_amount ELSE -p_amount END;
 SELECT * INTO prior FROM public.investment_account_links WHERE id=p_id;
 IF FOUND THEN
  IF prior.user_id<>auth.uid() OR prior.account_id<>p_account OR prior.amount<>delta THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  -- Check all original event details before returning. Do not reapply either balance.
  RETURN public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 END IF;
 IF EXISTS(SELECT 1 FROM public.investment_history WHERE id=p_id) THEN RAISE EXCEPTION 'This update was already saved without an account.'; END IF;
 IF a.amount+delta<0 THEN RAISE EXCEPTION 'Not enough money in the selected cash account.'; END IF;
 IF a.amount+delta>1e15 THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 IF lending THEN
  SELECT max(occurred_on) INTO last_day FROM public.investment_history WHERE record_id=a.id AND balance IS NOT NULL;
  IF p_date<last_day THEN RAISE EXCEPTION 'Enter transactions on or after the latest cash balance date.'; END IF;
 END IF;
 -- This validates type, date, principal, owner, and debt balance before writing.
 -- All writes roll back together if either side fails.
 result:=public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 IF lending THEN PERFORM set_config('finance.history_write','1',true); END IF;
 UPDATE public.finance_records SET amount=amount+delta WHERE id=p_account;
 IF lending THEN
  PERFORM set_config('finance.history_write','0',true);
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
  VALUES(auth.uid(),a.id,CASE WHEN delta<0 THEN 'withdrawal' ELSE 'contribution' END,p_date,abs(delta),a.amount+delta,p_notes);
 END IF;
 INSERT INTO public.investment_account_links(id,user_id,account_id,amount) VALUES(p_id,auth.uid(),p_account,delta);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
