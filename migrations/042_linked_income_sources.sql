-- Income receipts select owned properties or existing salary schedules.
BEGIN;
ALTER TABLE public.finance_records
 ADD COLUMN income_source_id uuid,
 ADD COLUMN income_due_on date,
 ADD CONSTRAINT finance_income_source_owner FOREIGN KEY(user_id,income_source_id) REFERENCES public.finance_records(user_id,id),
 ADD CONSTRAINT finance_income_source_type CHECK(income_source_id IS NULL OR (income_source_id<>id AND (kind='Rent income' OR (kind='Salary' AND frequency='Once')))),
 ADD CONSTRAINT finance_income_due_date CHECK(income_due_on IS NULL OR (income_source_id IS NOT NULL AND kind='Salary'));
CREATE INDEX finance_income_source ON public.finance_records(user_id,income_source_id) WHERE income_source_id IS NOT NULL;

CREATE FUNCTION public.validate_income_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.finance_records; due date; month_start date;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.frequency IS DISTINCT FROM OLD.frequency) AND EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=OLD.user_id AND income_source_id=OLD.id) THEN
  RAISE EXCEPTION 'This income source has linked records.';
 END IF;
 IF NEW.income_source_id IS NOT NULL THEN
  SELECT * INTO source FROM public.finance_records WHERE user_id=NEW.user_id AND id=NEW.income_source_id FOR SHARE;
  IF NOT FOUND OR source.id=NEW.id OR NOT ((NEW.kind='Rent income' AND source.kind='Property') OR (NEW.kind='Salary' AND NEW.frequency='Once' AND source.kind='Salary' AND source.frequency IN ('Monthly','Yearly') AND source.income_source_id IS NULL)) THEN
   RAISE EXCEPTION 'Choose a matching income source.';
  END IF;
  NEW.name:=source.name;
  NEW.business_id:=CASE WHEN NEW.kind='Salary' THEN source.business_id ELSE NULL END;
  IF NEW.kind='Salary' THEN
   due:=coalesce(NEW.income_due_on,NEW.date);
   month_start:=date_trunc('month',due)::date;
   IF due<source.date OR (source.end_date IS NOT NULL AND due>source.end_date) OR
    extract(day FROM due)<>least(extract(day FROM source.date),extract(day FROM (month_start+interval '1 month - 1 day'))) OR
    (source.frequency='Yearly' AND extract(month FROM due)<>extract(month FROM source.date)) THEN
    RAISE EXCEPTION 'Choose a scheduled salary date.';
   END IF;
   NEW.income_due_on:=due;
   IF EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=NEW.user_id AND record_id=source.id AND due_on=due AND transaction_id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'This salary payment is already recorded.';
   END IF;
  END IF;
 ELSIF NEW.kind='Business income' AND NEW.business_id IS NOT NULL THEN
  SELECT * INTO source FROM public.finance_records WHERE user_id=NEW.user_id AND id=NEW.business_id AND kind='Business';
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
  NEW.name:=source.name;
 END IF;
 RETURN NEW;
END $$;
-- Source naming runs before category rules examine the transaction name.
CREATE TRIGGER a_income_source BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.validate_income_source();

CREATE FUNCTION public.sync_salary_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.kind='Salary' AND OLD.income_source_id IS NOT NULL THEN
  DELETE FROM public.payment_occurrences WHERE user_id=OLD.user_id AND transaction_id=OLD.id AND record_id=OLD.income_source_id;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.kind='Salary' AND NEW.income_source_id IS NOT NULL THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
  VALUES(gen_random_uuid(),NEW.user_id,NEW.income_source_id,NEW.income_due_on,'paid',NEW.id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_salary_receipt AFTER INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.sync_salary_receipt();
CREATE TRIGGER remove_salary_receipt BEFORE DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.sync_salary_receipt();
REVOKE ALL ON FUNCTION public.validate_income_source(),public.sync_salary_receipt() FROM PUBLIC,anon,authenticated;
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
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,r.business_id,r.income_source_id,r.ownership_percentage,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   sum(CASE WHEN r.kind IN ('Business','Property') THEN r.estimated_monthly_income ELSE 0 END) AS estimated_monthly_income, sum(CASE WHEN r.kind='Mortgage' AND r.amount>0 THEN r.estimated_monthly_payment ELSE 0 END) AS estimated_monthly_payment, 0 AS rate, CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END AS date, r.end_date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,r.income_source_id,r.ownership_percentage,r.end_date,CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END,CASE WHEN r.kind IN ('Business','Property') THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
