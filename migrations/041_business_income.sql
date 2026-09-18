-- Explicit business income; existing linked Other income records remain valid.

BEGIN;

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;

ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_business_cashflow;

ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_business_cashflow CHECK (business_id IS NULL OR kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_end_date_check;

ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_end_date_check CHECK (
 end_date IS NULL OR (date IS NOT NULL AND end_date>=date AND frequency IN ('Monthly','Yearly') AND kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'))
);

ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_business_income_source CHECK (kind<>'Business income' OR business_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.finance_records_page(
 p_page integer DEFAULT 1,
 p_section text DEFAULT 'all',
 p_currency text DEFAULT NULL,
 p_summary boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb; total bigint; page_number integer; page_rows jsonb; summaries jsonb;
BEGIN
 IF p_page < 1 OR p_page > 1000000 OR p_section NOT IN ('all','assets','cashflow','debts') OR (p_currency IS NOT NULL AND p_currency NOT IN ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG')) THEN
  RAISE EXCEPTION 'Invalid pagination parameters';
 END IF;
 SELECT count(*) INTO total FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 10.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 10 OFFSET (page_number-1)*10
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',10);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   sum(CASE WHEN r.kind IN ('Business','Property') THEN r.estimated_monthly_income ELSE 0 END) AS estimated_monthly_income, sum(CASE WHEN r.kind='Mortgage' AND r.amount>0 THEN r.estimated_monthly_payment ELSE 0 END) AS estimated_monthly_payment, 0 AS rate, CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END AS date, r.end_date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,r.end_date,CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.apply_account_cashflow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; old_delta numeric:=0; new_delta numeric:=0; ids uuid[]; item uuid;
BEGIN
 -- Preserve the account-deletion cascade behavior introduced in migration 039.
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;
 IF TG_OP<>'INSERT' AND OLD.account_id IS NOT NULL THEN
  old_delta:=CASE WHEN OLD.kind IN ('Salary','Rent income','Business income','Other income') THEN OLD.amount ELSE -OLD.amount END / coalesce(OLD.account_exchange_rate,1);
  ids:=array_append(ids,OLD.account_id);
 END IF;
 IF TG_OP<>'DELETE' AND NEW.account_id IS NOT NULL THEN
  IF NEW.frequency<>'Once' OR NEW.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR NEW.date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Only actual income and expenses can update an account.'; END IF;
  new_delta:=CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN NEW.amount ELSE -NEW.amount END / coalesce(NEW.account_exchange_rate,1);
  ids:=array_append(ids,NEW.account_id);
 END IF;
 FOR item IN SELECT DISTINCT unnest(ids) ORDER BY 1 LOOP
  SELECT * INTO a FROM public.finance_records WHERE id=item FOR UPDATE;
  IF NOT FOUND OR a.kind<>'Cash' OR a.user_id<>coalesce(NEW.user_id,OLD.user_id) THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
  IF TG_OP<>'DELETE' AND item=NEW.account_id THEN
   IF a.currency<>NEW.currency AND (NEW.account_exchange_rate IS NULL OR NEW.account_rate_date IS NULL OR NEW.account_rate_date>NEW.date OR NEW.account_currency IS DISTINCT FROM a.currency) THEN RAISE EXCEPTION 'Check the dated exchange rate.'; END IF;
   IF a.currency=NEW.currency AND coalesce(NEW.account_exchange_rate,1)<>1 THEN RAISE EXCEPTION 'Check the dated exchange rate.'; END IF;
  END IF;
  UPDATE public.finance_records SET amount=amount
   -CASE WHEN TG_OP<>'INSERT' AND item=OLD.account_id THEN old_delta ELSE 0 END
   +CASE WHEN TG_OP<>'DELETE' AND item=NEW.account_id THEN new_delta ELSE 0 END WHERE id=item;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
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
  IF p_data->>'kind'='investment' THEN
   IF NOT (p_data ? 'investment_targets') THEN
    IF EXISTS(SELECT 1 FROM public.savings_goals WHERE id=item AND user_id=owner AND jsonb_array_length(investment_targets)>1) THEN
     RAISE EXCEPTION 'Reload this goal before saving its holdings.';
    END IF;
    p_data:=p_data||jsonb_build_object('investment_targets',jsonb_build_array(jsonb_build_object(
     'holding_account_id',p_data->'holding_account_id','asset_kind',p_data->'asset_kind','asset_symbol',p_data->'asset_symbol',
     'target',p_data->'target','monthly_contribution',p_data->'monthly_contribution')));
   END IF;
   IF jsonb_typeof(p_data->'investment_targets') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Check the investment targets.'; END IF;
   IF jsonb_array_length(p_data->'investment_targets') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Check the investment targets.'; END IF;
   p_data:=p_data||jsonb_build_object('holding_account_id',p_data->'investment_targets'->0->'holding_account_id',
    'asset_kind',p_data->'investment_targets'->0->'asset_kind','asset_symbol',p_data->'investment_targets'->0->'asset_symbol',
    'target',p_data->'investment_targets'->0->'target','monthly_contribution',p_data->'investment_targets'->0->'monthly_contribution');
  END IF;
  IF coalesce(p_data->>'kind','savings')='savings' THEN
   SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
   IF coalesce((p_data->>'archived')::boolean,false)=false AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;
  ELSIF p_data->>'kind'='investment' THEN
   SELECT currency INTO a.currency FROM public.holding_accounts WHERE id=(p_data->>'holding_account_id')::uuid AND user_id=owner AND kind=p_data->>'asset_kind' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your matching stock or crypto accounts.'; END IF;
  END IF;
  INSERT INTO public.savings_goals(id,user_id,name,account_id,target,allocated,target_date,archived,kind,currency,monthly_contribution,annual_return,holding_account_id,asset_kind,asset_symbol,investment_targets)
  VALUES(item,owner,trim(p_data->>'name'),aid,(p_data->>'target')::numeric,(p_data->>'allocated')::numeric,(p_data->>'target_date')::date,coalesce((p_data->>'archived')::boolean,false),coalesce(p_data->>'kind','savings'),coalesce(a.currency,p_data->>'currency'),(p_data->>'monthly_contribution')::numeric,coalesce((p_data->>'annual_return')::numeric,0),(p_data->>'holding_account_id')::uuid,p_data->>'asset_kind',p_data->>'asset_symbol',coalesce(p_data->'investment_targets','[]'::jsonb))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,account_id=excluded.account_id,target=excluded.target,allocated=excluded.allocated,target_date=excluded.target_date,archived=excluded.archived,kind=excluded.kind,currency=excluded.currency,monthly_contribution=excluded.monthly_contribution,annual_return=excluded.annual_return,holding_account_id=excluded.holding_account_id,asset_kind=excluded.asset_kind,asset_symbol=excluded.asset_symbol,investment_targets=excluded.investment_targets WHERE savings_goals.user_id=owner;
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
   IF r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date)) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
   IF aid IS NULL THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
   new_id:=item;
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id,account_exchange_rate,account_rate_date,account_currency)
   VALUES(new_id,owner,r.name,r.kind,r.currency,r.amount,day,'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency');
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

CREATE OR REPLACE FUNCTION public.classify_new_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT. BEFORE INSERT also runs
 -- for existing rows, so edits must not reclassify historical transactions.
 IF EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 IF coalesce(current_setting('finance.restore_transaction',true),'0')<>'1' AND NEW.custom_category_id IS NULL AND NEW.frequency='Once' AND NEW.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN
  SELECT category_id INTO NEW.custom_category_id FROM public.category_rules
  WHERE user_id=NEW.user_id AND enabled AND strpos(lower(NEW.name),lower(trim(pattern)))>0
   AND (direction='all' OR direction=CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END)
  ORDER BY priority,id LIMIT 1;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.save_transaction_splits(p_record uuid,p_splits jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records; part jsonb; n integer:=0; total numeric:=0;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.movement_id IS NOT NULL OR r.operation_id IS NOT NULL OR r.mortgage_payment_id IS NOT NULL OR r.history_event_id IS NOT NULL OR r.frequency<>'Once' OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose an actual transaction.'; END IF;
 IF jsonb_typeof(p_splits) IS DISTINCT FROM 'array' OR jsonb_array_length(p_splits)>50 OR jsonb_array_length(p_splits)=1 THEN RAISE EXCEPTION 'Use at least two split categories, or clear the split.'; END IF;
 DELETE FROM public.transaction_splits WHERE record_id=r.id AND user_id=owner;
 FOR part IN SELECT value FROM jsonb_array_elements(p_splits) LOOP
  IF (part->>'amount') IS NULL OR (part->>'amount')::numeric<=0 OR (part->>'amount')::numeric>1e15 THEN RAISE EXCEPTION 'Check the split amounts.'; END IF;
  INSERT INTO public.transaction_splits(record_id,user_id,position,category_id,amount) VALUES(r.id,owner,n,(part->>'category_id')::uuid,(part->>'amount')::numeric);
  total:=total+(part->>'amount')::numeric;n:=n+1;
 END LOOP;
 IF n>0 AND total<>r.amount THEN RAISE EXCEPTION 'Split amounts must equal the transaction amount.'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.save_forecast_assignment(p_record uuid,p_account uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.frequency='Once' OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose a recurring schedule.'; END IF;
 IF p_account IS NULL THEN DELETE FROM public.forecast_assignments WHERE record_id=p_record AND user_id=owner;
 ELSE
  PERFORM 1 FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash' AND currency=r.currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a cash account in the schedule currency.'; END IF;
  INSERT INTO public.forecast_assignments(record_id,user_id,account_id) VALUES(p_record,owner,p_account) ON CONFLICT(record_id) DO UPDATE SET account_id=EXCLUDED.account_id;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.record_goal_activity(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); g public.savings_goals; destination public.savings_goals; account public.finance_records; source public.finance_records;
 item uuid:=(p_data->>'id')::uuid; qty numeric:=(p_data->>'amount')::numeric; day date:=(p_data->>'date')::date; action text:=p_data->>'type';
 prior public.goal_operations; next_balance numeric; previous_context text;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL OR qty IS NULL OR qty<=0 OR qty>1e15 OR qty::text IN ('NaN','Infinity','-Infinity') OR action NOT IN ('contribution','withdrawal','transfer') OR action IS NULL OR day IS NULL OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(coalesce(p_data->>'notes',''))>2000 THEN RAISE EXCEPTION 'Check the goal activity.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.goal_operations WHERE id=item;
 IF FOUND THEN
 IF prior.user_id<>owner OR prior.payload<>p_data THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
 RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT * INTO g FROM public.savings_goals WHERE id=(p_data->>'goal_id')::uuid AND user_id=owner AND kind='savings' AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active savings goal.'; END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=g.account_id AND user_id=owner AND kind='Cash' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 IF p_data->>'source_id' IS NOT NULL THEN
 SELECT * INTO source FROM public.finance_records WHERE id=(p_data->>'source_id')::uuid AND user_id=owner AND account_id=g.account_id AND frequency='Once' AND currency=g.currency AND date<=day;
 IF NOT FOUND OR action<>'contribution' OR source.kind NOT IN ('Salary','Rent income','Business income','Other income') THEN RAISE EXCEPTION 'Choose an income transaction from the goal account.'; END IF;
 IF qty+(SELECT coalesce(sum(delta),0) FROM public.goal_events WHERE source_id=source.id AND user_id=owner)>source.amount THEN RAISE EXCEPTION 'This transaction is already allocated.'; END IF;
 END IF;
 IF action='transfer' THEN
 SELECT * INTO destination FROM public.savings_goals WHERE id=(p_data->>'target_id')::uuid AND user_id=owner AND kind='savings' AND NOT archived AND account_id=g.account_id AND id<>g.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose another savings goal in the same account.'; END IF;
 ELSIF p_data->>'target_id' IS NOT NULL THEN RAISE EXCEPTION 'Check the goal activity.'; END IF;
 next_balance:=g.allocated+CASE WHEN action='contribution' THEN qty ELSE -qty END;
 IF next_balance<0 OR next_balance>g.target OR (action='transfer' AND destination.allocated+qty>destination.target) THEN RAISE EXCEPTION 'The activity exceeds the goal balance or target.'; END IF;
 IF action='contribution' AND qty+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE account_id=g.account_id AND user_id=owner AND NOT archived)>account.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;
 INSERT INTO public.goal_operations(id,user_id,payload) VALUES(item,owner,p_data);
 previous_context:=coalesce(current_setting('finance.goal_event',true),'');
 PERFORM set_config('finance.goal_event',(p_data||jsonb_build_object('operation_id',item,'source_name',source.name))::text,true);
 UPDATE public.savings_goals SET allocated=next_balance WHERE id=g.id;
 IF action='transfer' THEN UPDATE public.savings_goals SET allocated=allocated+qty WHERE id=destination.id; END IF;
 PERFORM set_config('finance.goal_event',previous_context,true);
 RETURN jsonb_build_object('ok',true);
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
