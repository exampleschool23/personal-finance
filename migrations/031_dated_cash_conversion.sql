-- Preserve the date, rate, and currencies used for cross-currency cash payments.
BEGIN;
ALTER TABLE public.investment_account_links ADD COLUMN exchange_rate numeric CHECK(exchange_rate>0 AND exchange_rate<=1e15);
ALTER TABLE public.investment_account_links ADD COLUMN rate_date date;
ALTER TABLE public.investment_account_links ADD COLUMN account_currency text;
ALTER TABLE public.investment_account_links ADD COLUMN record_currency text;
CREATE FUNCTION public.record_investment_with_fx(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text,p_account uuid,p_rate numeric,p_rate_date date,p_account_currency text,p_record_currency text,p_principal numeric DEFAULT 0,p_interest numeric DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r public.finance_records; prior public.investment_account_links; result jsonb; delta numeric; lending boolean; last_day date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 PERFORM id FROM public.finance_records WHERE id IN(p_account,p_record_id) AND user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=auth.uid() AND kind='Cash';
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid()
  AND kind IN ('Stock','Crypto','Deposit','Property','Business','Debt','Loan','Money lent','Mortgage');
 IF a.id IS NULL OR r.id IS NULL OR p_type='valuation' THEN RAISE EXCEPTION 'Choose a cash account in the record currency.'; END IF;
 IF p_rate IS NULL OR p_rate<=0 OR p_rate>1e15 OR p_rate::text IN ('NaN','Infinity','-Infinity') OR p_rate_date IS NULL OR p_rate_date>p_date
 OR p_account_currency IS DISTINCT FROM a.currency OR p_record_currency IS DISTINCT FROM r.currency
 OR (a.currency=r.currency AND p_rate<>1) THEN RAISE EXCEPTION 'Check the dated exchange rate.'; END IF;
 IF p_type='mortgage_payment' AND (r.kind<>'Mortgage' OR p_balance IS NOT NULL OR p_principal IS NULL OR p_interest IS NULL OR p_amount IS DISTINCT FROM p_principal+p_interest) THEN RAISE EXCEPTION 'Check the payment fields.'; END IF;
 lending:=r.kind IN ('Debt','Loan','Money lent','Mortgage');
 delta:=CASE
  WHEN r.kind IN ('Debt','Loan','Mortgage') THEN CASE WHEN p_type='contribution' THEN p_amount ELSE -p_amount END
  WHEN p_type IN ('income','withdrawal') THEN p_amount ELSE -p_amount END;
 delta:=delta/p_rate;
 SELECT * INTO prior FROM public.investment_account_links WHERE id=p_id;
 IF FOUND THEN
  IF prior.user_id<>auth.uid() OR prior.account_id<>p_account OR prior.amount<>delta OR prior.exchange_rate IS DISTINCT FROM p_rate OR prior.rate_date IS DISTINCT FROM p_rate_date OR prior.account_currency IS DISTINCT FROM p_account_currency OR prior.record_currency IS DISTINCT FROM p_record_currency THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  -- Check all original event details before returning. Do not reapply either balance.
  IF p_type='mortgage_payment' THEN RETURN public.record_mortgage_payment(p_id,p_record_id,p_principal,p_interest,p_date,p_notes); END IF;
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
 IF p_type='mortgage_payment' THEN result:=public.record_mortgage_payment(p_id,p_record_id,p_principal,p_interest,p_date,p_notes);
 ELSE result:=public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes); END IF;
 IF lending THEN PERFORM set_config('finance.history_write','1',true); END IF;
 UPDATE public.finance_records SET amount=amount+delta WHERE id=p_account;
 IF lending THEN
  PERFORM set_config('finance.history_write','0',true);
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
  VALUES(auth.uid(),a.id,CASE WHEN delta<0 THEN 'withdrawal' ELSE 'contribution' END,p_date,abs(delta),a.amount+delta,p_notes);
 END IF;
 INSERT INTO public.investment_account_links(id,user_id,account_id,amount,exchange_rate,rate_date,account_currency,record_currency) VALUES(p_id,auth.uid(),p_account,delta,p_rate,p_rate_date,a.currency,r.currency);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric) TO authenticated;
ALTER TABLE public.asset_movements ADD COLUMN exchange_rate numeric CHECK(exchange_rate>0 AND exchange_rate<=1e15);
ALTER TABLE public.asset_movements ADD COLUMN rate_date date;
CREATE FUNCTION public.record_transfer_with_fx(p_data jsonb,p_rate numeric,p_rate_date date,p_source_currency text,p_target_currency text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; b public.finance_records; prior public.asset_movements; result jsonb; received numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 PERFORM id FROM public.finance_records WHERE id IN((p_data->>'source_id')::uuid,(p_data->>'target_id')::uuid) AND user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=(p_data->>'source_id')::uuid AND user_id=auth.uid();
 SELECT * INTO b FROM public.finance_records WHERE id=(p_data->>'target_id')::uuid AND user_id=auth.uid();
 IF a.id IS NULL OR b.id IS NULL OR p_data->>'kind' IS DISTINCT FROM 'transfer' THEN RAISE EXCEPTION 'Choose your own source and destination.'; END IF;
 IF p_rate IS NULL OR p_rate<=0 OR p_rate>1e15 OR p_rate::text IN ('NaN','Infinity','-Infinity') OR p_rate_date IS NULL OR p_rate_date>(p_data->>'date')::date
 OR p_source_currency IS DISTINCT FROM a.currency OR p_target_currency IS DISTINCT FROM b.currency OR (a.currency=b.currency AND p_rate<>1) THEN RAISE EXCEPTION 'Check the dated exchange rate.'; END IF;
 SELECT * INTO prior FROM public.asset_movements WHERE id=(p_data->>'id')::uuid;
 IF FOUND AND (prior.user_id<>auth.uid() OR prior.exchange_rate IS DISTINCT FROM p_rate OR prior.rate_date IS DISTINCT FROM p_rate_date) THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
 -- The destination amount is calculated here, never taken from an editable field.
 received:=((p_data->>'sent')::numeric-(p_data->>'fee')::numeric)*p_rate;
 p_data:=p_data||jsonb_build_object('received',received,'source_value',(p_data->>'sent')::numeric,'target_value',received);
 result:=public.record_asset_movement(p_data);
 UPDATE public.asset_movements SET exchange_rate=p_rate,rate_date=p_rate_date WHERE id=(p_data->>'id')::uuid;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_transfer_with_fx(jsonb,numeric,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_transfer_with_fx(jsonb,numeric,date,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
