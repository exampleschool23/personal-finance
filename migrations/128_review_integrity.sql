-- Review integrity from the 2026-10-09 code review. Apply after 127.
-- 1. Saving a goal no longer overwrites its allocation with the form's stale copy. A save that names the
--    allocation it loaded (expected_allocated) keeps the stored amount when the form left it alone, so a
--    contribution recorded meanwhile in another tab survives; one that changed it on purpose is refused when the
--    stored amount moved on. Saves without the field behave as before.
-- 2. The records summary groups one-time income and spending by kind and currency instead of by name, so it stays
--    small however many transactions there are.
-- 3. set_budget_amounts saves a month's budget amounts together: one request, all or nothing.
BEGIN;

-- Re-running is a no-op: a patch whose new text is already present is skipped.
CREATE OR REPLACE FUNCTION pg_temp.patch_review(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: % (% of 1 matches)',fn,found; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

SELECT pg_temp.patch_review(fn,
 $old$ IF p_action='goal' THEN
  IF p_data->>'kind'='investment' THEN$old$,
 $new$ IF p_action='goal' THEN
  -- The allocation the form loaded: left as it was, the stored amount stays; changed, it must still be current.
  IF p_data ? 'expected_allocated' AND EXISTS(SELECT 1 FROM public.savings_goals WHERE id=item AND user_id=owner) THEN
   IF (p_data->>'allocated')::numeric=(p_data->>'expected_allocated')::numeric THEN
    p_data:=p_data||jsonb_build_object('allocated',(SELECT allocated FROM public.savings_goals WHERE id=item AND user_id=owner));
   ELSIF (SELECT allocated FROM public.savings_goals WHERE id=item AND user_id=owner)<>(p_data->>'expected_allocated')::numeric THEN
    RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
   END IF;
  END IF;
  IF p_data->>'kind'='investment' THEN$new$)
FROM unnest(ARRAY['public.planning_action(text,jsonb)','public.planning_action_with_actual_amount(text,jsonb)']::regprocedure[]) fn;

-- One-time income and spending is summarised per kind and currency, not per name.
CREATE OR REPLACE FUNCTION public.finance_records_page(p_page integer DEFAULT 1, p_section text DEFAULT 'all'::text, p_currency text DEFAULT NULL::text, p_summary boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE result jsonb; total bigint; page_number integer; page_rows jsonb; summaries jsonb;
BEGIN
 IF p_page < 1 OR p_page > 1000000 OR p_section NOT IN ('all','assets','cashflow','debts') OR (p_currency IS NOT NULL AND p_currency NOT IN ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG')) THEN
  RAISE EXCEPTION 'Invalid pagination parameters';
 END IF;
 SELECT count(*) INTO total FROM public.finance_records r WHERE r.user_id=public.active_owner() AND NOT r.source_paused
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 10.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.created_at DESC, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=public.active_owner() AND NOT r.source_paused
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.created_at DESC, r.id DESC LIMIT 10 OFFSET (page_number-1)*10
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',10);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated. One-time income and
  -- spending is grouped by kind and currency only: grouped by name it grew by a row per distinct transaction name, and
  -- no reader needs those names (totals and quotes use holdings and debts; cash flow and Transactions read their own rows).
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,r.recurrence_days,r.business_id,r.income_source_id,r.source_paused,r.payment_type,r.ownership_percentage,
   CASE WHEN r.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   sum(CASE WHEN r.kind IN ('Business','Property') THEN r.estimated_monthly_income ELSE 0 END) AS estimated_monthly_income, sum(CASE WHEN r.kind='Mortgage' AND r.amount>0 THEN r.estimated_monthly_payment ELSE 0 END) AS estimated_monthly_payment, 0 AS rate, CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END AS date, r.end_date, '' AS notes, min(r.metal) AS metal, min(r.metal_unit) AS metal_unit, min(r.metal_purity) AS metal_purity, count(*) AS record_count
   FROM (SELECT f.id,CASE WHEN o.one_off THEN f.kind ELSE f.name END AS name,f.kind,f.currency,f.frequency,f.recurrence_days,
     CASE WHEN o.one_off THEN NULL ELSE f.business_id END AS business_id,CASE WHEN o.one_off THEN NULL ELSE f.income_source_id END AS income_source_id,
     f.source_paused,CASE WHEN o.one_off THEN NULL ELSE f.payment_type END AS payment_type,f.ownership_percentage,f.amount,f.quantity,f.cost,
     f.estimated_monthly_income,f.estimated_monthly_payment,f.date,f.end_date,f.metal,f.metal_unit,f.metal_purity
    FROM public.finance_records f CROSS JOIN LATERAL (SELECT f.frequency='Once' AND f.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') AS one_off) o
    WHERE f.user_id=public.active_owner() AND NOT f.source_paused) r
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.recurrence_days,r.business_id,r.income_source_id,r.source_paused,r.payment_type,r.ownership_percentage,r.end_date,CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END,CASE WHEN r.kind IN ('Business','Property','Valuables','Vehicle','Retirement account','Precious metals') THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=public.active_owner() AND kind='Business'));
 END IF;
 RETURN result;
END $$
;

-- Recalculate sets every category's amount for a month at once; a refused item leaves the budget as it was.
CREATE OR REPLACE FUNCTION public.set_budget_amounts(p_month date,p_currency text,p_items jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); item jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_month IS NULL OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Check the budget fields.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item->'category_key') IS DISTINCT FROM 'string' OR length(item->>'category_key') NOT BETWEEN 1 AND 80
   OR (CASE WHEN jsonb_typeof(item->'amount')='number' THEN (item->>'amount')::numeric NOT BETWEEN 0 AND 1e15 ELSE true END)
   OR jsonb_typeof(item->'applies_forward') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Check the budget fields.'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'category_key') FROM jsonb_array_elements(p_items))<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'Check the budget fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  PERFORM public.set_budget_amount(item->>'category_key',p_month,(item->>'amount')::numeric,p_currency,(item->>'applies_forward')::boolean);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.set_budget_amounts(date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_budget_amounts(date,text,jsonb) TO authenticated;

-- The capability version moves to 127, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',128,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
