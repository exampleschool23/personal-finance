-- Type-specific tracker actions; debt principal movements calculate balances atomically.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_investment_event(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.investment_history; last_date date; lending boolean; next_balance numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_id IS NULL OR p_record_id IS NULL OR p_type IS NULL OR p_date IS NULL OR p_amount IS NULL OR p_notes IS NULL
 OR p_type NOT IN ('valuation','contribution','withdrawal','income','expense') OR p_amount<0 OR p_amount>1e15
 OR p_date>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(p_notes)>2000
 OR (p_balance IS NOT NULL AND (p_balance<0 OR p_balance>1e15))
 OR (p_type='valuation' AND p_balance IS NULL)
 OR (p_type IN ('income','expense') AND p_balance IS NOT NULL) OR (p_type<>'valuation' AND p_amount<=0)
 OR (p_type='valuation' AND p_amount<>0) THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.kind NOT IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt') THEN RAISE EXCEPTION 'Investment not found.'; END IF;
 lending:=r.kind IN ('Debt','Loan','Money lent','Mortgage');
 SELECT * INTO existing FROM public.investment_history WHERE id=p_id;
 IF FOUND THEN
  IF existing.user_id<>auth.uid() OR existing.record_id<>p_record_id OR existing.event_type<>p_type OR existing.occurred_on<>p_date OR existing.amount<>p_amount OR (NOT (lending AND p_type IN ('contribution','withdrawal') AND p_balance IS NULL) AND existing.balance IS DISTINCT FROM p_balance) OR existing.notes<>p_notes THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 -- Validate against the record under the same lock that protects its balance.
 IF (lending AND p_type NOT IN ('contribution','withdrawal')) OR (r.kind='Cash' AND p_type<>'valuation') THEN
  RAISE EXCEPTION 'This update type is not available for this record.';
 END IF;
 IF r.kind='Mortgage' AND p_type='withdrawal' THEN RAISE EXCEPTION 'Use Record payment for mortgage payments.'; END IF;
 SELECT max(occurred_on) INTO last_date FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL;
 next_balance:=p_balance;
 IF lending THEN
  IF p_balance IS NOT NULL THEN RAISE EXCEPTION 'Enter debt additions and repayments without a balance override.'; END IF;
  IF p_date<last_date THEN RAISE EXCEPTION 'Enter updates on or after the latest balance date.'; END IF;
  next_balance:=r.amount+CASE WHEN p_type='contribution' THEN p_amount ELSE -p_amount END;
  IF next_balance<0 THEN RAISE EXCEPTION 'Repayment cannot exceed the outstanding balance.'; END IF;
  IF next_balance>1e15 THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 ELSIF p_type IN ('contribution','withdrawal') AND p_balance IS NULL THEN
  RAISE EXCEPTION 'Check the tracker fields.';
 END IF;
 INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,ownership_percentage,notes)
 VALUES(p_id,auth.uid(),r.id,p_type,p_date,p_amount,next_balance,CASE WHEN r.kind='Business' THEN r.ownership_percentage ELSE 100 END,p_notes);
 IF next_balance IS NOT NULL AND (last_date IS NULL OR p_date>=last_date) THEN
  IF r.kind IN ('Stock','Crypto') AND r.quantity=0 THEN RAISE EXCEPTION 'Set a quantity before recording a valuation.'; END IF;
  PERFORM set_config('finance.history_write','1',true);
  UPDATE public.finance_records SET amount=next_balance/CASE WHEN r.kind IN ('Stock','Crypto') THEN r.quantity ELSE 1 END WHERE id=r.id;
  PERFORM set_config('finance.history_write','0',true);
 END IF;
 IF p_type IN ('income','expense') THEN
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,business_id,history_event_id)
  VALUES(p_id,auth.uid(),r.name,CASE WHEN p_type='expense' THEN 'Other expense' WHEN r.kind='Property' THEN 'Rent income' ELSE 'Other income' END,r.currency,p_amount,p_date,'Once',p_notes,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END,p_id);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
