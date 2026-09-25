-- Generated TEST-ACCOUNT allocation. No real brokerage orders are placed.
-- Run after seed-test-account.sql. Existing history is retained.
-- Uses retrieved, dated exchange rates and quotes embedded by the generator.
-- Whole cash budgets: businesses 60%, crypto 15%, S&P 500 15%; retain at least 10%.
BEGIN;
CREATE TEMP TABLE allocation_market(data jsonb) ON COMMIT DROP;
INSERT INTO allocation_market VALUES (__MARKET_JSON__::jsonb);
DO $allocate$
DECLARE
 target_owner uuid := '84cae6f3-0494-4aa8-ab5a-5f673dfdae61';
 reference_owner uuid := '60e06991-ac41-4df9-a09b-7ca9619b8b25';
 batch_key text := 'sample-investment-allocation-v1';
 memo text := 'TEST DATA: sample-investment-allocation-v1; simulated investment using retrieved rates and quotes.';
 market jsonb; trade_day date; fx_day date; fx numeric; cash_usd numeric; total_weight numeric;
 c record; b record; instrument record; destination uuid; settlement uuid; container_id uuid;
 business_budget numeric; business_remaining numeric; business_part numeric; converted numeric;
 stock_budget numeric; crypto_budget numeric; purchase_budget numeric; units numeric; owned_value numeric;
 before_value numeric; after_value numeric; remaining_count integer;
BEGIN
 SELECT data INTO market FROM allocation_market;
 trade_day:=(market->>'day')::date;
 IF trade_day IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Tashkent')::date THEN
  RAISE EXCEPTION 'Generate a fresh script for today before running it.';
 END IF;
 IF target_owner=reference_owner OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target_owner AND lower(email)='hoggish@gmail.com') THEN
  RAISE EXCEPTION 'Test UID/email mismatch. No changes made.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.investment_history WHERE user_id=target_owner AND occurred_on='2020-01-01') THEN
  RAISE EXCEPTION 'Run the original test-account seed first.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target_owner::text,0));
 PERFORM set_config('request.jwt.claim.sub',target_owner::text,true);
 IF EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=target_owner AND import_key LIKE batch_key||'%')
 OR EXISTS(SELECT 1 FROM public.investment_history WHERE user_id=target_owner AND notes=memo) THEN
  RAISE EXCEPTION 'This allocation was already applied. Nothing was spent again.';
 END IF;
 CREATE TEMP TABLE allocation_rates ON COMMIT DROP AS
  SELECT key AS currency,(value->>'rate')::numeric AS rate,(value->>'date')::date AS rate_date
  FROM jsonb_each(market->'rates');
 IF EXISTS(SELECT 1 FROM allocation_rates WHERE rate IS NULL OR rate<=0 OR rate::text IN ('NaN','Infinity','-Infinity') OR rate_date IS NULL OR rate_date>trade_day OR rate_date<trade_day-7)
 OR NOT EXISTS(SELECT 1 FROM allocation_rates WHERE currency='USD' AND rate=1) THEN
  RAISE EXCEPTION 'Invalid or stale exchange rates. Regenerate the script.';
 END IF;
 CREATE TEMP TABLE allocation_cash ON COMMIT DROP AS
  SELECT id,currency,amount FROM public.finance_records WHERE user_id=target_owner AND kind='Cash' AND amount>=10;
 CREATE TEMP TABLE allocation_businesses ON COMMIT DROP AS
  SELECT id,name,currency,amount,ownership_percentage,estimated_monthly_income
  FROM public.finance_records WHERE user_id=reference_owner AND kind='Business' AND amount>0 AND ownership_percentage>0;
 IF NOT EXISTS(SELECT 1 FROM allocation_businesses) THEN RAISE EXCEPTION 'Reference account has no funded businesses to model.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM allocation_cash) THEN RAISE EXCEPTION 'No test cash balance is large enough to allocate.'; END IF;
 IF EXISTS(SELECT 1 FROM (SELECT currency FROM allocation_cash UNION SELECT currency FROM allocation_businesses) required
  LEFT JOIN allocation_rates rates USING(currency) WHERE rates.currency IS NULL) THEN
  RAISE EXCEPTION 'A cash/business currency has no retrieved exchange rate. No balances changed.';
 END IF;
 CREATE TEMP TABLE allocation_quotes ON COMMIT DROP AS
  SELECT key AS symbol,value->>'kind' AS kind,(value->>'usd')::numeric AS price FROM jsonb_each(market->'quotes');
 IF (SELECT count(*) FROM allocation_quotes WHERE (symbol IN ('BTC','ETH') AND kind='Crypto') OR (symbol='SPY' AND kind='Stock'))<>3
 OR EXISTS(SELECT 1 FROM allocation_quotes WHERE price IS NULL OR price<=0 OR price::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'Missing or invalid BTC, ETH, or SPY quote. Regenerate the script.';
 END IF;
 -- Compare invested value + cash before/after at the SAME captured rates.
 SELECT sum(f.amount*CASE WHEN f.kind IN ('Stock','Crypto') THEN f.quantity ELSE 1 END*
  CASE WHEN f.kind='Business' THEN f.ownership_percentage/100 ELSE 1 END/r.rate)
 INTO before_value FROM public.finance_records f JOIN allocation_rates r USING(currency)
 WHERE f.user_id=target_owner AND f.kind IN ('Cash','Business','Stock','Crypto');
 SELECT sum(business.amount*business.ownership_percentage/100/r.rate) INTO total_weight
 FROM allocation_businesses business JOIN allocation_rates r USING(currency);
 -- One sample business per reference business, retaining its ownership share and currency.
 ALTER TABLE allocation_businesses ADD COLUMN new_id uuid;
 FOR b IN SELECT * FROM allocation_businesses ORDER BY id LOOP
  destination:=gen_random_uuid();
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,ownership_percentage,notes,import_key)
   VALUES(destination,target_owner,left('Sample '||b.name,120),'Business',b.currency,0,trade_day,b.ownership_percentage,memo,batch_key||':business:'||b.id);
  UPDATE allocation_businesses SET new_id=destination WHERE id=b.id;
 END LOOP;
 -- A separate settlement account makes every FX conversion visible and auditable.
 settlement:=gen_random_uuid();
 INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,opened_on,notes,import_key)
  VALUES(settlement,target_owner,'Sample investment settlement','Cash','USD',0,trade_day,trade_day,memo,batch_key||':settlement');
 ALTER TABLE allocation_quotes ADD COLUMN new_id uuid;
 FOR instrument IN SELECT * FROM allocation_quotes ORDER BY symbol LOOP
  SELECT id INTO container_id FROM public.holding_accounts WHERE user_id=target_owner AND kind=instrument.kind AND currency='USD' ORDER BY id LIMIT 1;
  IF container_id IS NULL THEN
   container_id:=gen_random_uuid();
   INSERT INTO public.holding_accounts(id,user_id,name,kind,currency) VALUES(container_id,target_owner,'Sample '||instrument.kind||' investments',instrument.kind,'USD');
  END IF;
  destination:=gen_random_uuid();
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,quantity,cost,date,opened_on,holding_account_id,notes,import_key)
   VALUES(destination,target_owner,instrument.symbol,instrument.kind,'USD',instrument.price,0,0,trade_day,trade_day,container_id,memo,batch_key||':'||instrument.symbol);
  UPDATE allocation_quotes SET new_id=destination WHERE symbol=instrument.symbol;
 END LOOP;
 FOR c IN SELECT * FROM allocation_cash ORDER BY id LOOP
  business_budget:=floor(c.amount*.60); crypto_budget:=floor(c.amount*.15); stock_budget:=floor(c.amount*.15);
  business_remaining:=business_budget;
  SELECT count(*) INTO remaining_count FROM allocation_businesses;
  SELECT rate INTO cash_usd FROM allocation_rates WHERE currency=c.currency;
  FOR b IN SELECT business.*,r.rate,r.rate_date FROM allocation_businesses business JOIN allocation_rates r USING(currency) ORDER BY business.id LOOP
   business_part:=CASE WHEN remaining_count=1 THEN business_remaining ELSE
    floor(business_budget*(b.amount*b.ownership_percentage/100/b.rate)/total_weight) END;
   business_remaining:=business_remaining-business_part; remaining_count:=remaining_count-1;
   IF business_part<=0 THEN CONTINUE; END IF;
   fx:=b.rate/cash_usd;
   SELECT least(b.rate_date,r.rate_date) INTO fx_day FROM allocation_rates r WHERE currency=c.currency;
   converted:=business_part*fx;
   SELECT amount INTO owned_value FROM public.finance_records WHERE id=b.new_id;
   PERFORM public.record_investment_with_fx(gen_random_uuid(),b.new_id,'contribution',trade_day,converted,
    owned_value+converted*100/b.ownership_percentage,memo,c.id,fx,fx_day,c.currency,b.currency);
  END LOOP;
  -- Convert only the market-purchase budget to USD using the retrieved pair.
  fx:=1/cash_usd;
  SELECT rate_date INTO fx_day FROM allocation_rates WHERE currency=c.currency;
  PERFORM public.record_transfer_with_fx(jsonb_build_object('id',gen_random_uuid(),'kind','transfer','source_id',c.id,'target_id',settlement,
   'sent',crypto_budget+stock_budget,'received',(crypto_budget+stock_budget)*fx,'source_value',crypto_budget+stock_budget,
   'target_value',(crypto_budget+stock_budget)*fx,'fee',0,'date',trade_day,'notes',memo),fx,fx_day,c.currency,'USD');
  FOR instrument IN SELECT * FROM allocation_quotes ORDER BY symbol LOOP
   purchase_budget:=CASE WHEN instrument.symbol='SPY' THEN stock_budget ELSE crypto_budget/2 END*fx;
   units:=purchase_budget/instrument.price;
   PERFORM public.record_asset_movement(jsonb_build_object('id',gen_random_uuid(),'kind','buy','source_id',settlement,'target_id',instrument.new_id,
    'sent',purchase_budget,'received',units,'source_value',purchase_budget,'target_value',purchase_budget,'fee',0,'date',trade_day,'notes',memo));
  END LOOP;
 END LOOP;
 -- Retain the reference business's estimated income yield for the simulated stake.
 UPDATE public.finance_records f SET estimated_monthly_income=round(f.amount*f.ownership_percentage/100*
  coalesce(reference_business.estimated_monthly_income,0)/(reference_business.amount*reference_business.ownership_percentage/100))
 FROM allocation_businesses reference_business WHERE f.id=reference_business.new_id AND f.user_id=target_owner;
 -- Allow the new USD holdings to appear in the test account's currency dropdowns.
 UPDATE public.user_preferences SET currencies=array_append(currencies,'USD') WHERE user_id=target_owner AND NOT ('USD'=ANY(currencies));
 IF EXISTS(SELECT 1 FROM allocation_cash original JOIN public.finance_records current_cash ON current_cash.id=original.id
  WHERE abs(current_cash.amount-(original.amount-floor(original.amount*.60)-2*floor(original.amount*.15)))>.00000001) THEN
  RAISE EXCEPTION 'Cash allocation failed reconciliation; all changes rolled back.';
 END IF;
 SELECT sum(f.amount*CASE WHEN f.kind IN ('Stock','Crypto') THEN f.quantity ELSE 1 END*
  CASE WHEN f.kind='Business' THEN f.ownership_percentage/100 ELSE 1 END/r.rate)
 INTO after_value FROM public.finance_records f JOIN allocation_rates r USING(currency)
 WHERE f.user_id=target_owner AND f.kind IN ('Cash','Business','Stock','Crypto');
 IF abs(after_value-before_value)>.000001 THEN RAISE EXCEPTION 'Investment allocation changed total value unexpectedly; all changes rolled back.'; END IF;
END $allocate$;
COMMIT;
SELECT name,kind,currency,amount,quantity,ownership_percentage FROM public.finance_records
WHERE user_id='84cae6f3-0494-4aa8-ab5a-5f673dfdae61' AND (kind='Cash' OR import_key LIKE 'sample-investment-allocation-v1%') ORDER BY kind,currency,name;
