-- One-off TEST DATA seed, not a schema migration.
-- Run the entire file in the personal-finance project's Supabase SQL Editor.
-- Requires the current application schema (database/setup.sql / migrations through 067).
-- Creates synthetic history, NOT actual historical market prices or personal transactions.
-- Never changes the reference owner. Refuses non-empty targets and repeat runs.
BEGIN;
DO $seed$
DECLARE
 target_owner uuid := '84cae6f3-0494-4aa8-ab5a-5f673dfdae61';
 reference_owner uuid := '60e06991-ac41-4df9-a09b-7ca9619b8b25';
 expected_email text := 'hoggish@gmail.com';
 start_day date := DATE '2020-01-01';
 end_day date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
 memo text := 'TEST DATA: synthetic history from 2020; not actual transactions or market prices.';
 currencies text[]; language_code text; currency_code text; tbl text; occupied boolean;
 months integer; month_index integer; month_start date; day date;
 a record; c record; p record; item uuid; container_id uuid;
 salary numeric; opening numeric; closing numeric; repayment numeric; receipt numeric; progress numeric;
BEGIN
 IF target_owner=reference_owner THEN RAISE EXCEPTION 'Test and reference owners must differ.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target_owner AND lower(email)=expected_email) THEN
  RAISE EXCEPTION 'Test UID must belong to %. Check Authentication > Users.',expected_email;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=reference_owner) OR NOT EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=reference_owner) THEN
  RAISE EXCEPTION 'Reference account not found or has no financial records.';
 END IF;
 IF end_day<start_day THEN RAISE EXCEPTION 'History end precedes its start.'; END IF;
 -- Same lock used by normal application writes. No shared triggers/RLS are disabled.
 PERFORM pg_advisory_xact_lock(hashtextextended(target_owner::text,0));
 FOREACH tbl IN ARRAY ARRAY['finance_records','investment_history','holding_accounts','income_sources','expense_plans','savings_goals','transaction_categories','deleted_items','portfolio_snapshots'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE user_id=$1)',tbl) INTO occupied USING target_owner;
  IF occupied THEN RAISE EXCEPTION 'Test account already contains data (%). Nothing was added; repeat runs are intentionally refused.',tbl; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',target_owner::text,true);
 -- Explicit dated snapshots below replace automatic snapshots stamped with today's date.
 PERFORM set_config('finance.history_write','1',true);
 SELECT language INTO language_code FROM public.user_preferences WHERE user_id=reference_owner;
 SELECT array_agg(currency ORDER BY currency) INTO currencies FROM (
  SELECT unnest(up.currencies) AS currency FROM public.user_preferences up WHERE up.user_id=reference_owner
  UNION SELECT currency FROM public.finance_records WHERE user_id=reference_owner
 ) currency_list;
 -- Keep the reference primary currency first, also retaining currencies used by its records.
 SELECT ARRAY(SELECT currency FROM unnest(currencies) x(currency)
  ORDER BY CASE WHEN currency=(SELECT up.currencies[1] FROM public.user_preferences up WHERE up.user_id=reference_owner) THEN 0 ELSE 1 END,currency) INTO currencies;
 INSERT INTO public.user_preferences(user_id,language,currencies,display_name)
 VALUES(target_owner,coalesce(language_code,'en'),currencies,'Test account — history from 2020')
 ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,currencies=excluded.currencies,display_name=excluded.display_name;
 months := (extract(year FROM end_day)::integer-2020)*12+extract(month FROM end_day)::integer;
 CREATE TEMP TABLE seed_assets ON COMMIT DROP AS
 SELECT gen_random_uuid() AS new_id,kind,currency,
  CASE WHEN kind IN ('Stock','Crypto') THEN name ELSE 'Sample '||lower(kind) END AS name,
  amount,CASE WHEN kind IN ('Stock','Crypto') THEN quantity ELSE 1 END AS quantity,
  rate,ownership_percentage,estimated_monthly_income
 FROM (SELECT DISTINCT ON (kind,currency,CASE WHEN kind IN ('Stock','Crypto') THEN name ELSE kind END) *
  FROM public.finance_records WHERE user_id=reference_owner AND amount>0 AND quantity>0
  AND kind IN ('Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt')
  ORDER BY kind,currency,CASE WHEN kind IN ('Stock','Crypto') THEN name ELSE kind END,amount DESC,id) source_assets;
 CREATE TEMP TABLE seed_cash(currency text PRIMARY KEY,id uuid,source_id uuid,salary numeric) ON COMMIT DROP;
 CREATE TEMP TABLE seed_plans(id uuid,currency text,share numeric) ON COMMIT DROP;
 FOREACH currency_code IN ARRAY currencies LOOP
  -- Scale illustrative pay to the reference account in this currency, without any FX assumptions.
  SELECT greatest(10,round(coalesce(
   (SELECT max(amount/CASE WHEN frequency='Yearly' THEN 12 ELSE 1 END) FROM public.income_sources WHERE user_id=reference_owner AND currency=currency_code AND kind='Salary'),
   (SELECT max(amount/CASE WHEN frequency='Yearly' THEN 12 ELSE 1 END) FROM public.finance_records WHERE user_id=reference_owner AND currency=currency_code AND kind='Salary'),
   (SELECT max(amount*CASE WHEN kind IN ('Stock','Crypto') THEN quantity ELSE 1 END)/20 FROM public.finance_records WHERE user_id=reference_owner AND currency=currency_code),1000))) INTO salary;
  item:=gen_random_uuid();
  INSERT INTO seed_cash VALUES(currency_code,item,gen_random_uuid(),salary);
  -- Opening reserves cover sample debt service; no historical purchases are charged twice.
  SELECT salary*3+coalesce(sum(ceil(amount*.4/months)*months*1.2),0) INTO opening FROM seed_assets
   WHERE currency=currency_code AND kind IN ('Debt','Loan','Mortgage');
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,opened_on,notes)
   VALUES(item,target_owner,'Sample cash '||currency_code,'Cash',currency_code,ceil(opening),start_day,start_day,memo);
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,notes)
   VALUES(target_owner,item,'baseline',start_day,ceil(opening),memo);
  INSERT INTO public.income_sources(id,user_id,name,kind,currency,mode)
   SELECT source_id,target_owner,'Sample salary '||currency_code,'Salary',currency_code,'variable' FROM seed_cash WHERE currency=currency_code;
  FOR p IN SELECT * FROM (VALUES ('Groceries',.25),('Family support',.15),('Household',.10),('Other',.05)) v(category,share) LOOP
   item:=gen_random_uuid();
   INSERT INTO public.expense_plans(id,user_id,name,category,currency,amount,start_date)
    VALUES(item,target_owner,'Sample '||p.category,p.category,currency_code,greatest(1,round(salary*p.share)),start_day);
   INSERT INTO seed_plans VALUES(item,currency_code,p.share);
  END LOOP;
 END LOOP;
 FOR a IN SELECT * FROM seed_assets ORDER BY new_id LOOP
  container_id:=NULL;
  IF a.kind IN ('Stock','Crypto') THEN
   SELECT id INTO container_id FROM public.holding_accounts WHERE user_id=target_owner AND kind=a.kind AND currency=a.currency;
   IF container_id IS NULL THEN
    container_id:=gen_random_uuid();
    INSERT INTO public.holding_accounts(id,user_id,name,kind,currency)
     VALUES(container_id,target_owner,'Sample '||a.kind||' account '||a.currency,a.kind,a.currency);
   END IF;
  END IF;
  opening:=CASE WHEN a.kind IN ('Debt','Loan','Mortgage','Money lent') THEN a.amount+ceil(a.amount*.4/months)*months
   WHEN a.kind='Deposit' THEN a.amount ELSE a.amount*.65 END;
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,quantity,cost,rate,date,lent_date,opened_on,notes,ownership_percentage,holding_account_id,deposit_compounding)
  VALUES(a.new_id,target_owner,a.name,a.kind,a.currency,opening,a.quantity,
   CASE WHEN a.kind IN ('Stock','Crypto') THEN opening ELSE 0 END,a.rate,
   CASE WHEN a.kind IN ('Deposit','Debt','Loan','Mortgage','Money lent') THEN (end_day+interval '2 years')::date ELSE start_day END,
   CASE WHEN a.kind='Money lent' THEN start_day END,
   CASE WHEN a.kind IN ('Stock','Crypto','Deposit','Debt','Loan','Mortgage') THEN start_day END,
   memo,a.ownership_percentage,container_id,'none');
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage,notes)
   VALUES(target_owner,a.new_id,'baseline',start_day,opening*a.quantity,a.ownership_percentage,memo);
 END LOOP;
 FOR month_index IN 1..months LOOP
  month_start:=(start_day+make_interval(months=>month_index-1))::date;
  day:=least((month_start+interval '1 month - 1 day')::date,end_day);
  progress:=month_index::numeric/months;
  FOR c IN SELECT * FROM seed_cash ORDER BY currency LOOP
   PERFORM set_config('finance.history_write','1',true);
   receipt:=greatest(1,round(c.salary*(.65+.35*progress)));
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,earning_source_id)
    VALUES(gen_random_uuid(),target_owner,'Sample salary '||c.currency,'Salary',c.currency,receipt,day,'Once',memo,c.id,c.source_id);
   FOR p IN SELECT s.*,e.name FROM seed_plans s JOIN public.expense_plans e ON e.id=s.id WHERE s.currency=c.currency LOOP
    INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,expense_plan_id)
     VALUES(gen_random_uuid(),target_owner,p.name,'Living expense',c.currency,greatest(1,round(receipt*p.share)),day,'Once',memo,c.id,p.id);
   END LOOP;
  END LOOP;
  FOR a IN SELECT s.*,cash_map.id AS cash_id FROM seed_assets s JOIN seed_cash cash_map USING(currency) ORDER BY s.new_id LOOP
   PERFORM set_config('finance.history_write','1',true);
   IF a.kind IN ('Debt','Loan','Mortgage','Money lent') THEN
    repayment:=ceil(a.amount*.4/months);
    PERFORM public.record_investment_with_fx(gen_random_uuid(),a.new_id,
     CASE WHEN a.kind='Mortgage' THEN 'mortgage_payment' ELSE 'withdrawal' END,day,
     repayment+CASE WHEN a.kind='Mortgage' THEN round(repayment*.1) ELSE 0 END,NULL,memo,a.cash_id,1,day,a.currency,a.currency,
     CASE WHEN a.kind='Mortgage' THEN repayment ELSE 0 END,CASE WHEN a.kind='Mortgage' THEN round(repayment*.1) ELSE 0 END);
   ELSE
    -- Illustrative fluctuating values. The final unit value and quantity match the reference.
    closing:=a.amount*a.quantity*CASE WHEN a.kind='Deposit' THEN 1
     ELSE .65+.35*progress+sin(month_index*1.7)::numeric*.06*(1-progress) END;
    PERFORM public.record_investment_event(gen_random_uuid(),a.new_id,'valuation',day,0,closing,memo);
    PERFORM set_config('finance.history_write','1',true);
    receipt:=CASE WHEN a.kind='Deposit' THEN round(a.amount*least(a.rate,100)/1200)
     WHEN a.kind IN ('Business','Property') THEN round(coalesce(nullif(a.estimated_monthly_income,0),a.amount*.004)*(.8+.2*progress))
     WHEN a.kind='Stock' AND month_index%3=0 THEN round(closing*.003) ELSE 0 END;
    IF receipt>0 THEN
     PERFORM public.record_investment_with_fx(gen_random_uuid(),a.new_id,'income',day,receipt,NULL,memo,a.cash_id,1,day,a.currency,a.currency);
    END IF;
   END IF;
  END LOOP;
  -- Account snapshots follow all that month's actual cash movements.
  FOR c IN SELECT f.* FROM public.finance_records f JOIN seed_cash s ON s.id=f.id LOOP
   PERFORM public.record_investment_event(gen_random_uuid(),c.id,'valuation',day,0,c.amount,memo);
  END LOOP;
 END LOOP;
 -- Verify cash accounting before committing to the live database.
 IF EXISTS(SELECT 1 FROM public.finance_records cash_row JOIN seed_cash cash_map ON cash_map.id=cash_row.id
  WHERE abs(cash_row.amount-(
   (SELECT balance FROM public.investment_history WHERE record_id=cash_row.id AND event_type='baseline')+
   coalesce((SELECT sum(CASE WHEN kind IN ('Salary','Rent income','Business income','Other income') THEN amount ELSE -amount END)
    FROM public.finance_records WHERE user_id=target_owner AND account_id=cash_row.id),0)+
   coalesce((SELECT sum(amount) FROM public.investment_account_links WHERE user_id=target_owner AND account_id=cash_row.id),0)))>.000000001) THEN
  RAISE EXCEPTION 'Sample cash balances did not reconcile; all changes rolled back.';
 END IF;
 PERFORM set_config('finance.history_write','0',true);
 RAISE NOTICE 'Sample data ready from % through %. Original account unchanged.',start_day,end_day;
END $seed$;
COMMIT;
-- Read-only completion summary. Dates remain ISO data, ready for app formatting.
SELECT 'Test data created' AS status,
 (SELECT count(*) FROM public.finance_records WHERE user_id='84cae6f3-0494-4aa8-ab5a-5f673dfdae61') AS financial_records,
 count(*) AS history_events,min(occurred_on) AS history_from,max(occurred_on) AS history_through
FROM public.investment_history WHERE user_id='84cae6f3-0494-4aa8-ab5a-5f673dfdae61';
