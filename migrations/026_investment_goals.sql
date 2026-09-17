-- Goals for units of a stock or coin in an investment account; no assets are reserved or created.
BEGIN;
SET LOCAL lock_timeout = '500ms';
-- Fail promptly if these tables are busy, before making any schema changes.
LOCK TABLE public.savings_goals IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.holding_accounts IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.finance_records IN ACCESS SHARE MODE NOWAIT;
ALTER TABLE public.savings_goals DROP CONSTRAINT savings_goals_kind_check;
ALTER TABLE public.savings_goals DROP CONSTRAINT savings_goals_account_kind_check;
ALTER TABLE public.savings_goals
 ADD COLUMN holding_account_id uuid,
 ADD COLUMN asset_kind text,
 ADD COLUMN asset_symbol text,
 ADD CONSTRAINT savings_goals_kind_check CHECK(kind IN ('savings','net_worth','investment')),
 ADD CONSTRAINT savings_goals_investment_owner FOREIGN KEY(holding_account_id,user_id) REFERENCES public.holding_accounts(id,user_id),
 ADD CONSTRAINT savings_goals_account_kind_check CHECK(
  (kind='savings' AND account_id IS NOT NULL AND holding_account_id IS NULL AND asset_kind IS NULL AND asset_symbol IS NULL) OR
  (kind='net_worth' AND account_id IS NULL AND allocated=0 AND target_date IS NOT NULL AND holding_account_id IS NULL AND asset_kind IS NULL AND asset_symbol IS NULL) OR
  (kind='investment' AND account_id IS NULL AND allocated=0 AND holding_account_id IS NOT NULL AND asset_kind IS NOT NULL AND asset_kind IN ('Stock','Crypto') AND asset_symbol IS NOT NULL AND asset_symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$' AND annual_return=0 AND target<=1e12 AND (monthly_contribution IS NULL OR monthly_contribution<=1e12))
 );
CREATE OR REPLACE FUNCTION public.guard_holding_account_kind() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind<>OLD.kind AND EXISTS(SELECT 1 FROM public.finance_records WHERE holding_account_id=OLD.id) THEN
  RAISE EXCEPTION 'Move the holdings before changing this account type.';
 END IF;
 IF NEW.kind<>OLD.kind AND EXISTS(SELECT 1 FROM public.savings_goals WHERE holding_account_id=OLD.id) THEN
  RAISE EXCEPTION 'Update the investment goals before changing this account type.';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.planning_action(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=auth.uid(); a public.finance_records; b public.finance_records; r public.finance_records;
 item uuid:=(p_data->>'id')::uuid; aid uuid:=(p_data->>'account_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 amount numeric:=(p_data->>'amount')::numeric; received numeric:=coalesce((p_data->>'received')::numeric,0); fee numeric:=coalesce((p_data->>'fee')::numeric,0);
 day date:=(p_data->>'date')::date; memo text:=coalesce(p_data->>'notes',''); prior public.account_activity; balance_before numeric; occurrence public.payment_occurrences; new_id uuid;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL THEN RAISE EXCEPTION 'An identifier is required.'; END IF;
 -- Serialize account operations per owner, including duplicate retries.
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 IF p_action='category' THEN
  INSERT INTO public.custom_categories(id,user_id,name) VALUES(item,owner,trim(p_data->>'name'))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name WHERE custom_categories.user_id=owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action='goal' THEN
  IF coalesce(p_data->>'kind','savings')='savings' THEN
   SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
   IF coalesce((p_data->>'archived')::boolean,false)=false AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;
  ELSIF p_data->>'kind'='investment' THEN
   SELECT currency INTO a.currency FROM public.holding_accounts WHERE id=(p_data->>'holding_account_id')::uuid AND user_id=owner AND kind=p_data->>'asset_kind' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your matching stock or crypto accounts.'; END IF;
  END IF;
  INSERT INTO public.savings_goals(id,user_id,name,account_id,target,allocated,target_date,archived,kind,currency,monthly_contribution,annual_return,holding_account_id,asset_kind,asset_symbol)
  VALUES(item,owner,trim(p_data->>'name'),aid,(p_data->>'target')::numeric,(p_data->>'allocated')::numeric,(p_data->>'target_date')::date,coalesce((p_data->>'archived')::boolean,false),coalesce(p_data->>'kind','savings'),coalesce(a.currency,p_data->>'currency'),(p_data->>'monthly_contribution')::numeric,coalesce((p_data->>'annual_return')::numeric,0),(p_data->>'holding_account_id')::uuid,p_data->>'asset_kind',p_data->>'asset_symbol')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,account_id=excluded.account_id,target=excluded.target,allocated=excluded.allocated,target_date=excluded.target_date,archived=excluded.archived,kind=excluded.kind,currency=excluded.currency,monthly_contribution=excluded.monthly_contribution,annual_return=excluded.annual_return,holding_account_id=excluded.holding_account_id,asset_kind=excluded.asset_kind,asset_symbol=excluded.asset_symbol WHERE savings_goals.user_id=owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF day IS NULL OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the payment date.'; END IF;
 IF p_action IN ('occurrence','dismiss') THEN
  SELECT * INTO r FROM public.finance_records WHERE id=bid AND user_id=owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found.'; END IF;
  SELECT * INTO occurrence FROM public.payment_occurrences WHERE user_id=owner AND record_id=bid AND due_on=day;
  IF FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
  IF p_action='dismiss' THEN
   IF r.kind<>'Deposit' OR r.date<>day THEN RAISE EXCEPTION 'Only deposit maturity reminders can be dismissed.'; END IF;
   INSERT INTO public.payment_occurrences VALUES(item,owner,bid,day,'dismissed',NULL);
  ELSE
   IF r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date)) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
   IF aid IS NULL THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
   new_id:=item;
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id)
   VALUES(new_id,owner,r.name,r.kind,r.currency,r.amount,day,'Once',memo,aid,r.business_id,r.custom_category_id);
   INSERT INTO public.payment_occurrences VALUES(item,owner,bid,day,'paid',new_id);
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action NOT IN ('transfer','reconcile','repayment','mortgage') OR amount IS NULL OR amount<0 OR amount>1e15 OR received<0 OR received>1e15 OR fee<0 OR fee>1e15 THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 SELECT * INTO prior FROM public.account_activity WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.action<>p_action OR prior.account_id<>aid OR prior.target_id IS DISTINCT FROM bid OR prior.amount<>amount OR prior.received<>received OR prior.fee<>fee OR prior.occurred_on<>day OR prior.notes<>memo THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 PERFORM id FROM public.finance_records WHERE id IN (aid,bid) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash';
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 balance_before:=a.amount;
 IF p_action='reconcile' THEN
  IF bid IS NOT NULL OR fee<>0 OR received<>0 OR day<>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Reconcile the current balance today.'; END IF;
  UPDATE public.finance_records SET amount=(p_data->>'amount')::numeric WHERE id=aid;
 ELSE
  SELECT * INTO b FROM public.finance_records WHERE id=bid AND user_id=owner;
  IF NOT FOUND OR aid=bid OR (p_action<>'mortgage' AND amount<=0) OR (p_action='mortgage' AND amount+fee<=0) THEN RAISE EXCEPTION 'Choose a different destination.'; END IF;
  IF p_action='transfer' THEN
   IF b.kind<>'Cash' OR received<=0 OR (a.currency=b.currency AND received<>amount) THEN RAISE EXCEPTION 'Check the transfer amounts.'; END IF;
   UPDATE public.finance_records SET amount=finance_records.amount-(p_data->>'amount')::numeric WHERE id=aid;
   UPDATE public.finance_records SET amount=finance_records.amount+received WHERE id=bid;
  ELSE
   IF a.currency<>b.currency OR b.kind NOT IN ('Money lent','Loan','Debt','Mortgage') OR amount>b.amount OR received<>0 THEN RAISE EXCEPTION 'Check the repayment and account currency.'; END IF;
   IF p_action='mortgage' AND b.kind<>'Mortgage' THEN RAISE EXCEPTION 'Mortgage not found.'; END IF;
   IF b.kind='Mortgage' THEN
    IF p_action<>'mortgage' THEN RAISE EXCEPTION 'Use Record payment for mortgage payments.'; END IF;
    IF EXISTS(SELECT 1 FROM public.mortgage_payments WHERE id=item) THEN RAISE EXCEPTION 'This payment was already saved without an account.'; END IF;
    PERFORM public.record_mortgage_payment(item,bid,amount,fee,day,memo);
    UPDATE public.finance_records SET amount=finance_records.amount-amount-fee WHERE id=aid;
   ELSE
    UPDATE public.finance_records SET amount=finance_records.amount-(p_data->>'amount')::numeric WHERE id=bid;
    UPDATE public.finance_records SET amount=finance_records.amount+CASE WHEN b.kind='Money lent' THEN amount ELSE -amount END WHERE id=aid;
   END IF;
  END IF;
  IF fee>0 AND p_action<>'mortgage' THEN
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,operation_id)
   VALUES(gen_random_uuid(),owner,CASE WHEN p_action='transfer' THEN 'Transfer fee' ELSE b.name END,CASE WHEN b.kind='Money lent' AND p_action='repayment' THEN 'Other income' ELSE 'Other expense' END,a.currency,fee,day,'Once',memo,aid,item);
  END IF;
 END IF;
 INSERT INTO public.account_activity(id,user_id,action,account_id,target_id,amount,received,fee,occurred_on,notes,before_balance,after_balance)
 SELECT item,owner,p_action,aid,bid,amount,received,fee,day,memo,balance_before,account_row.amount FROM public.finance_records account_row WHERE account_row.id=aid;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.planning_action(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.planning_action(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
