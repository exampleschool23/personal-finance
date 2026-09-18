-- Reusable fixed/variable sources; receipts remain ordinary income transactions.
BEGIN;
CREATE TABLE public.income_sources (
 id uuid PRIMARY KEY, user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('Salary','Rent income','Business income','Other income')),
 currency text NOT NULL CHECK(currency IN ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG')), mode text NOT NULL CHECK(mode IN ('fixed','variable')), archived boolean NOT NULL DEFAULT false,
 amount numeric CHECK(amount>0 AND amount<=1e15), frequency text CHECK(frequency IN ('Monthly','Yearly')), start_date date,end_date date,
 linked_record_id uuid, schedule_id uuid,
 UNIQUE(user_id,id), UNIQUE(schedule_id),
 FOREIGN KEY(user_id,linked_record_id) REFERENCES public.finance_records(user_id,id),
 FOREIGN KEY(user_id,schedule_id) REFERENCES public.finance_records(user_id,id),
 CHECK((mode='variable' AND amount IS NULL AND frequency IS NULL AND start_date IS NULL AND end_date IS NULL) OR
       (mode='fixed' AND amount IS NOT NULL AND frequency IS NOT NULL AND start_date IS NOT NULL AND (end_date IS NULL OR end_date>=start_date)))
);
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY income_sources_owner ON public.income_sources FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.income_sources FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.income_sources TO authenticated;
ALTER TABLE public.finance_records
 ADD COLUMN earning_source_id uuid,
 ADD COLUMN earning_due_on date,
 ADD COLUMN payment_type text NOT NULL DEFAULT 'regular' CHECK(payment_type IN ('regular','bonus')),
 ADD COLUMN source_paused boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT finance_earning_source_owner FOREIGN KEY(user_id,earning_source_id) REFERENCES public.income_sources(user_id,id),
 ADD CONSTRAINT finance_earning_source_type CHECK(earning_source_id IS NULL OR (frequency='Once' AND kind IN ('Salary','Rent income','Business income','Other income'))),
 ADD CONSTRAINT finance_earning_due CHECK(earning_due_on IS NULL OR (earning_source_id IS NOT NULL AND payment_type='regular'));
CREATE INDEX finance_earning_source ON public.finance_records(user_id,earning_source_id) WHERE earning_source_id IS NOT NULL;
-- Existing schedules are reused, not copied, so forecasts are not doubled.
INSERT INTO public.income_sources(id,user_id,name,kind,currency,mode,amount,frequency,start_date,end_date,linked_record_id,schedule_id)
 SELECT id,user_id,name,kind,currency,'fixed',amount,frequency,date,end_date,
 CASE WHEN kind='Business income' THEN business_id WHEN kind='Rent income' THEN income_source_id ELSE NULL END,id
 FROM public.finance_records WHERE frequency IN ('Monthly','Yearly') AND amount>0 AND
 (kind IN ('Salary','Other income') OR (kind='Business income' AND business_id IS NOT NULL) OR (kind='Rent income' AND income_source_id IS NOT NULL));

CREATE FUNCTION public.save_income_source(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); item uuid:=(p_data->>'id')::uuid; old public.income_sources; saved public.income_sources; linked public.finance_records; schedule uuid; has_payments boolean; previous_write text;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO old FROM public.income_sources WHERE id=item FOR UPDATE;
 IF FOUND AND old.user_id<>owner THEN RAISE EXCEPTION 'Income source not found.'; END IF;
 saved:=jsonb_populate_record(NULL::public.income_sources,p_data||jsonb_build_object('user_id',owner,'archived',coalesce((p_data->>'archived')::boolean,false)));
 IF saved.name IS NULL OR saved.kind IS NULL OR saved.currency IS NULL OR saved.mode IS NULL THEN RAISE EXCEPTION 'Check the income source fields.'; END IF;
 IF saved.kind IN ('Rent income','Business income') THEN
  SELECT * INTO linked FROM public.finance_records WHERE user_id=owner AND id=saved.linked_record_id AND kind=CASE WHEN saved.kind='Rent income' THEN 'Property' ELSE 'Business' END FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
 ELSIF saved.linked_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=owner AND (earning_source_id=item OR income_source_id=old.schedule_id)) OR EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=owner AND record_id=old.schedule_id) INTO has_payments;
 IF old.id IS NOT NULL AND has_payments AND (saved.kind,saved.currency,saved.mode,saved.frequency,saved.start_date,saved.end_date,saved.linked_record_id) IS DISTINCT FROM (old.kind,old.currency,old.mode,old.frequency,old.start_date,old.end_date,old.linked_record_id) THEN
  RAISE EXCEPTION 'Keep the type, currency and schedule compatible with recorded payments.';
 END IF;
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 PERFORM set_config('finance.income_source_write','1',true);
 schedule:=old.schedule_id;
 IF saved.mode='fixed' THEN
  schedule:=coalesce(schedule,gen_random_uuid());
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,end_date,business_id,income_source_id,source_paused)
  VALUES(schedule,owner,saved.name,saved.kind,saved.currency,saved.amount,saved.start_date,saved.frequency,saved.end_date,CASE WHEN saved.kind='Business income' THEN saved.linked_record_id ELSE NULL END,CASE WHEN saved.kind='Rent income' THEN saved.linked_record_id ELSE NULL END,saved.archived)
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,currency=EXCLUDED.currency,amount=EXCLUDED.amount,date=EXCLUDED.date,frequency=EXCLUDED.frequency,end_date=EXCLUDED.end_date,business_id=EXCLUDED.business_id,income_source_id=EXCLUDED.income_source_id,source_paused=EXCLUDED.source_paused;
 ELSIF schedule IS NOT NULL THEN
  UPDATE public.finance_records SET source_paused=true WHERE id=schedule AND user_id=owner;
 END IF;
 saved.schedule_id:=schedule;
 INSERT INTO public.income_sources SELECT saved.* ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,currency=EXCLUDED.currency,mode=EXCLUDED.mode,archived=EXCLUDED.archived,amount=EXCLUDED.amount,frequency=EXCLUDED.frequency,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,linked_record_id=EXCLUDED.linked_record_id,schedule_id=EXCLUDED.schedule_id;
 PERFORM set_config('finance.income_source_write',previous_write,true);
 RETURN to_jsonb(saved)-'user_id';
END $$;
REVOKE ALL ON FUNCTION public.save_income_source(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_income_source(jsonb) TO authenticated;

CREATE FUNCTION public.validate_earning_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.income_sources; due date; month_start date;
BEGIN
 IF NEW.earning_source_id IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.user_id<>auth.uid() THEN RAISE EXCEPTION 'Choose an active income source.'; END IF;
 SELECT * INTO source FROM public.income_sources WHERE id=NEW.earning_source_id AND user_id=NEW.user_id FOR SHARE;
 IF NOT FOUND OR (source.archived AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id AND earning_source_id=source.id)) THEN RAISE EXCEPTION 'Choose an active income source.'; END IF;
 IF NEW.frequency<>'Once' THEN RAISE EXCEPTION 'Source payments must be one-time income.'; END IF;
 NEW.name:=source.name;
 NEW.kind:=CASE WHEN NEW.payment_type='bonus' THEN 'Other income' ELSE source.kind END;
 NEW.business_id:=CASE WHEN NEW.payment_type='regular' AND source.kind='Business income' THEN source.linked_record_id ELSE NULL END;
 NEW.income_source_id:=NULL;NEW.income_due_on:=NULL;
 IF source.mode='fixed' AND NEW.payment_type='regular' THEN
  due:=NEW.earning_due_on;month_start:=date_trunc('month',due)::date;
  IF due IS NULL OR due<source.start_date OR (source.end_date IS NOT NULL AND due>source.end_date) OR extract(day FROM due)<>least(extract(day FROM source.start_date),extract(day FROM (month_start+interval '1 month - 1 day'))) OR (source.frequency='Yearly' AND extract(month FROM due)<>extract(month FROM source.start_date)) THEN RAISE EXCEPTION 'Choose a scheduled payment date.'; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=NEW.user_id AND record_id=source.schedule_id AND due_on=due AND transaction_id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'This scheduled payment is already recorded.'; END IF;
 ELSIF NEW.earning_due_on IS NOT NULL THEN RAISE EXCEPTION 'Variable income and bonuses have no scheduled due date.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a0_earning_receipt BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.validate_earning_receipt();
CREATE FUNCTION public.sync_earning_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.income_sources;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.earning_source_id IS NOT NULL THEN
  DELETE FROM public.payment_occurrences WHERE user_id=OLD.user_id AND transaction_id=OLD.id;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.earning_source_id IS NOT NULL AND NEW.earning_due_on IS NOT NULL THEN
  SELECT * INTO source FROM public.income_sources WHERE id=NEW.earning_source_id AND user_id=NEW.user_id;
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id) VALUES(gen_random_uuid(),NEW.user_id,source.schedule_id,NEW.earning_due_on,'paid',NEW.id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER sync_earning_receipt AFTER INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.sync_earning_receipt();
CREATE TRIGGER remove_earning_receipt BEFORE DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.sync_earning_receipt();
REVOKE ALL ON FUNCTION public.validate_earning_receipt(),public.sync_earning_receipt() FROM PUBLIC,anon,authenticated;
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
 SELECT count(*) INTO total FROM public.finance_records r WHERE r.user_id=auth.uid() AND NOT r.source_paused
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 10.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid() AND NOT r.source_paused
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 10 OFFSET (page_number-1)*10
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',10);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,r.business_id,r.income_source_id,r.source_paused,r.payment_type,r.ownership_percentage,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   sum(CASE WHEN r.kind IN ('Business','Property') THEN r.estimated_monthly_income ELSE 0 END) AS estimated_monthly_income, sum(CASE WHEN r.kind='Mortgage' AND r.amount>0 THEN r.estimated_monthly_payment ELSE 0 END) AS estimated_monthly_payment, 0 AS rate, CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END AS date, r.end_date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid() AND NOT r.source_paused
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,r.income_source_id,r.source_paused,r.payment_type,r.ownership_percentage,r.end_date,CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END,CASE WHEN r.kind IN ('Business','Property') THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
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
   IF r.source_paused OR r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date)) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
   IF aid IS NULL THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
   new_id:=item;
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id,account_exchange_rate,account_rate_date,account_currency)
   VALUES(new_id,owner,r.name,r.kind,r.currency,r.amount,day,'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency');
   INSERT INTO public.payment_occurrences VALUES(item,owner,bid,day,'paid',new_id) ON CONFLICT(user_id,record_id,due_on) DO UPDATE SET id=EXCLUDED.id WHERE payment_occurrences.transaction_id=EXCLUDED.transaction_id;
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
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_income_sources;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 RETURN public.export_finance_backup_before_income_sources()||jsonb_build_object('income_sources',(SELECT coalesce(jsonb_agg(to_jsonb(source)),'[]'::jsonb) FROM public.income_sources source WHERE user_id=auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
CREATE FUNCTION public.protect_income_schedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND NEW.kind<>OLD.kind AND EXISTS(SELECT 1 FROM public.income_sources WHERE linked_record_id=OLD.id AND user_id=OLD.user_id) THEN RAISE EXCEPTION 'This income source has linked records.'; END IF;
 IF EXISTS(SELECT 1 FROM public.income_sources WHERE schedule_id=OLD.id AND user_id=OLD.user_id) AND coalesce(current_setting('finance.income_source_write',true),'0')<>'1' THEN
  IF TG_OP='DELETE' OR (NEW.name,NEW.kind,NEW.currency,NEW.amount,NEW.frequency,NEW.date,NEW.end_date,NEW.source_paused,NEW.business_id,NEW.income_source_id) IS DISTINCT FROM (OLD.name,OLD.kind,OLD.currency,OLD.amount,OLD.frequency,OLD.date,OLD.end_date,OLD.source_paused,OLD.business_id,OLD.income_source_id) THEN RAISE EXCEPTION 'Edit this schedule in Income sources.'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER a00_income_schedule BEFORE UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.protect_income_schedule();
REVOKE ALL ON FUNCTION public.protect_income_schedule() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
