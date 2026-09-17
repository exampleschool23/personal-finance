-- Run once in your Supabase project's SQL Editor.
create table if not exists public.finance_records (
 id uuid primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 120),
 kind text not null check (kind in ('Cash','Stock','Crypto','Deposit','Property','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')),
 currency text not null check (currency in ('USD','UZS')),
 amount numeric not null check (amount>=0),
 quantity numeric not null default 1 check(quantity>=0),
 cost numeric not null default 0 check(cost>=0),
 rate numeric not null default 0 check(rate>=0),
 date date not null,
 frequency text not null default 'Once' check(frequency in ('Once','Monthly','Yearly')),
 notes text not null default '',
 created_at timestamptz not null default now()
);
alter table public.finance_records enable row level security;
create policy "Owners read their records" on public.finance_records for select to authenticated using ((select auth.uid())=user_id);
create policy "Owners create their records" on public.finance_records for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Owners update their records" on public.finance_records for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Owners delete their records" on public.finance_records for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.finance_records from anon;
grant select,insert,update,delete on public.finance_records to authenticated;
create index finance_records_user_date on public.finance_records(user_id,date desc);

-- Support separate lending dates and optional due dates.
alter table public.finance_records add column if not exists lent_date date;
alter table public.finance_records alter column date drop not null;
alter table public.finance_records add constraint finance_records_required_date check (kind = 'Money lent' or date is not null);

-- Run after the lending-date and charity migrations.
-- SECURITY INVOKER preserves owner RLS; auth.uid() also scopes all operations.
CREATE OR REPLACE FUNCTION public.finance_records_page(
 p_page integer DEFAULT 1,
 p_section text DEFAULT 'all',
 p_currency text DEFAULT NULL,
 p_summary boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb; total bigint; page_number integer; page_rows jsonb; summaries jsonb;
BEGIN
 IF p_page < 1 OR p_page > 1000000 OR p_section NOT IN ('all','assets','cashflow','debts') OR (p_currency IS NOT NULL AND p_currency NOT IN ('USD','UZS')) THEN
  RAISE EXCEPTION 'Invalid pagination parameters';
 END IF;
 SELECT count(*) INTO total FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 20.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 20 OFFSET (page_number-1)*20
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',20);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency
  ) g;
  result := result || jsonb_build_object('summary',summaries);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';

-- Run after 003_record_pagination.sql. Existing records remain unchanged.
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_currency_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_currency_check CHECK (currency IN ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG'));
CREATE TABLE IF NOT EXISTS public.user_preferences (
 user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','ru','uz')),
 currencies text[] NOT NULL DEFAULT ARRAY['USD','UZS'] CHECK (cardinality(currencies) >= 1 AND currencies <@ ARRAY['AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG']::text[])
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read preferences" ON public.user_preferences;
CREATE POLICY "Owners read preferences" ON public.user_preferences FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS "Owners create preferences" ON public.user_preferences;
CREATE POLICY "Owners create preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS "Owners update preferences" ON public.user_preferences;
CREATE POLICY "Owners update preferences" ON public.user_preferences FOR UPDATE TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.user_preferences FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.user_preferences TO authenticated;

-- Run after the lending-date and charity migrations.
-- SECURITY INVOKER preserves owner RLS; auth.uid() also scopes all operations.
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
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 20.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 20 OFFSET (page_number-1)*20
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',20);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency
  ) g;
  result := result || jsonb_build_object('summary',summaries);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';

-- Run after 004_settings_and_fiat_currencies.sql.
BEGIN;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'));
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS business_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS finance_records_owner_id ON public.finance_records(user_id,id);
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_business_owner;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_business_owner FOREIGN KEY(user_id,business_id) REFERENCES public.finance_records(user_id,id) ON DELETE RESTRICT;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_business_cashflow;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_business_cashflow CHECK (business_id IS NULL OR kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'));
CREATE OR REPLACE FUNCTION public.validate_finance_business() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.business_id IS NOT NULL THEN
  PERFORM 1 FROM public.finance_records WHERE id=NEW.business_id AND user_id=NEW.user_id AND kind='Business' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked record must be your business' USING ERRCODE='23503'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.kind='Business' AND NEW.kind<>'Business' AND EXISTS(SELECT 1 FROM public.finance_records WHERE business_id=OLD.id AND user_id=OLD.user_id) THEN
   RAISE EXCEPTION 'Business has linked records' USING ERRCODE='23503';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finance_business_validation ON public.finance_records;
CREATE TRIGGER finance_business_validation BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.validate_finance_business();
CREATE INDEX IF NOT EXISTS finance_records_business_id ON public.finance_records(user_id,business_id) WHERE business_id IS NOT NULL;
COMMIT;

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
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 20.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 20 OFFSET (page_number-1)*20
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',20);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,r.business_id,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';

-- Run after 005_business_assets.sql. Existing values remain unchanged at 100%.
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS ownership_percentage numeric NOT NULL DEFAULT 100;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_ownership_percentage_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_ownership_percentage_check CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100);

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
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 20.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 20 OFFSET (page_number-1)*20
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',20);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';

-- Run after 006_business_ownership.sql. Estimates do not alter asset balances.
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS estimated_monthly_income numeric NOT NULL DEFAULT 0;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_estimated_income_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_estimated_income_check CHECK (estimated_monthly_income >= 0 AND estimated_monthly_income <= 1000000000000000);

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
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 20.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 20 OFFSET (page_number-1)*20
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',20);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   sum(CASE WHEN r.kind IN ('Business','Property') THEN r.estimated_monthly_income ELSE 0 END) AS estimated_monthly_income, 0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';

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
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 10.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
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
   sum(CASE WHEN r.kind IN ('Business','Property') THEN r.estimated_monthly_income ELSE 0 END) AS estimated_monthly_income, 0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';
-- Atomic, idempotent mortgage payments. Run after 008_ten_records_per_page.sql.
CREATE TABLE public.mortgage_payments (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 mortgage_id uuid NOT NULL REFERENCES public.finance_records(id) ON DELETE RESTRICT,
 principal numeric NOT NULL CHECK (principal >= 0 AND principal <= 1e15),
 interest numeric NOT NULL CHECK (interest >= 0 AND interest <= 1e15),
 paid_on date NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
 CHECK (principal + interest > 0 AND principal + interest <= 1e15)
);
ALTER TABLE public.mortgage_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read mortgage payments" ON public.mortgage_payments FOR SELECT TO authenticated USING (user_id=auth.uid());
REVOKE ALL ON public.mortgage_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mortgage_payments TO authenticated;
ALTER TABLE public.finance_records ADD COLUMN mortgage_payment_id uuid UNIQUE REFERENCES public.mortgage_payments(id) ON DELETE RESTRICT;
ALTER TABLE public.finance_records ADD COLUMN payment_principal numeric, ADD COLUMN payment_interest numeric;
CREATE INDEX mortgage_payments_mortgage ON public.mortgage_payments(mortgage_id);

-- Payment records are immutable: generic record edits/deletes must not detach the
-- cash outflow from the principal reduction. Only the RPC can create their ledger row.
CREATE FUNCTION public.guard_mortgage_payment_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.mortgage_payment_id IS NOT NULL THEN
  RAISE EXCEPTION 'Payment records cannot be edited or deleted.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.kind<>OLD.kind OR NEW.currency<>OLD.currency)
    AND EXISTS(SELECT 1 FROM public.mortgage_payments WHERE mortgage_id=OLD.id) THEN
  RAISE EXCEPTION 'A mortgage with payments must keep its category and currency.';
 END IF;
 IF NEW.mortgage_payment_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.mortgage_payments p JOIN public.finance_records m ON m.id=p.mortgage_id
  WHERE p.id=NEW.mortgage_payment_id AND NEW.id=p.id AND p.user_id=NEW.user_id
  AND m.user_id=NEW.user_id AND NEW.kind='Other expense' AND NEW.currency=m.currency
  AND NEW.payment_principal=p.principal AND NEW.payment_interest=p.interest AND NEW.amount=p.principal+p.interest AND NEW.date=p.paid_on AND NEW.frequency='Once'
 ) THEN RAISE EXCEPTION 'Invalid mortgage payment record'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_mortgage_payment_record BEFORE INSERT OR UPDATE OR DELETE ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.guard_mortgage_payment_record();

CREATE FUNCTION public.record_mortgage_payment(p_id uuid,p_mortgage_id uuid,p_principal numeric,p_interest numeric,p_date date,p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mortgage public.finance_records; existing public.mortgage_payments;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_id IS NULL OR p_mortgage_id IS NULL OR p_principal IS NULL OR p_interest IS NULL OR p_date IS NULL OR p_notes IS NULL
 OR p_principal<0 OR p_interest<0 OR p_principal+p_interest<=0 OR p_principal+p_interest>1e15
 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Check the payment fields.'; END IF;
 SELECT * INTO mortgage FROM public.finance_records WHERE id=p_mortgage_id AND user_id=auth.uid() AND kind='Mortgage' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mortgage not found.'; END IF;
 SELECT * INTO existing FROM public.mortgage_payments WHERE id=p_id;
 IF FOUND THEN
  IF existing.user_id<>auth.uid() OR existing.mortgage_id<>p_mortgage_id OR existing.principal<>p_principal OR existing.interest<>p_interest OR existing.paid_on<>p_date OR existing.notes<>p_notes THEN
   RAISE EXCEPTION 'This payment was already saved with different details.';
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_principal>mortgage.amount THEN RAISE EXCEPTION 'Principal exceeds the outstanding balance.'; END IF;
 INSERT INTO public.mortgage_payments(id,user_id,mortgage_id,principal,interest,paid_on,notes)
 VALUES(p_id,auth.uid(),p_mortgage_id,p_principal,p_interest,p_date,p_notes);
 UPDATE public.finance_records SET amount=amount-p_principal WHERE id=mortgage.id;
 INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,mortgage_payment_id,payment_principal,payment_interest)
 VALUES(p_id,auth.uid(),mortgage.name,'Other expense',mortgage.currency,p_principal+p_interest,p_date,'Once',p_notes,p_id,p_principal,p_interest);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_mortgage_payment(uuid,uuid,numeric,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_mortgage_payment(uuid,uuid,numeric,numeric,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Run after 009_mortgage_payments.sql. Bank-schedule estimates are planning only.
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS estimated_monthly_payment numeric NOT NULL DEFAULT 0 CHECK (estimated_monthly_payment >= 0 AND estimated_monthly_payment <= 1e15);
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
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 10.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
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
   sum(CASE WHEN r.kind IN ('Business','Property') THEN r.estimated_monthly_income ELSE 0 END) AS estimated_monthly_income, sum(CASE WHEN r.kind='Mortgage' AND r.amount>0 THEN r.estimated_monthly_payment ELSE 0 END) AS estimated_monthly_payment, 0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency,r.business_id,r.ownership_percentage,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END
  ) g;
  result := result || jsonb_build_object('summary',summaries,'businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb) FROM public.finance_records WHERE user_id=auth.uid() AND kind='Business'));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';
-- Run after migrations 009, 010 and 011, in that order.
BEGIN;
DO $$
BEGIN
 IF to_regclass('public.mortgage_payments') IS NULL THEN
  RAISE EXCEPTION 'Migration 009 is missing. Run 009_mortgage_payments.sql, 010_estimated_mortgage_payments.sql and 011_money_lent_in_loans_and_debts.sql before retrying 012.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_records' AND column_name='estimated_monthly_payment') THEN
  RAISE EXCEPTION 'Migration 010 is missing. Run 010_estimated_mortgage_payments.sql and 011_money_lent_in_loans_and_debts.sql before retrying 012.';
 END IF;
END $$;

-- Dated valuations and actual cash movements, kept independently of forecasts.
CREATE TABLE public.investment_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL REFERENCES public.finance_records(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN ('baseline','valuation','contribution','withdrawal','income','expense','mortgage_payment')),
 occurred_on date NOT NULL,
 amount numeric NOT NULL DEFAULT 0 CHECK(amount>=0 AND amount<=1e15),
 balance numeric CHECK(balance>=0 AND balance<=1e27),
 ownership_percentage numeric NOT NULL DEFAULT 100 CHECK(ownership_percentage>=0 AND ownership_percentage<=100),
 principal numeric NOT NULL DEFAULT 0 CHECK(principal>=0),
 interest numeric NOT NULL DEFAULT 0 CHECK(interest>=0),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.investment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read investment history" ON public.investment_history FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.investment_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.investment_history TO authenticated;
CREATE INDEX investment_history_record_date ON public.investment_history(record_id,occurred_on,created_at);
ALTER TABLE public.finance_records ADD COLUMN history_event_id uuid UNIQUE REFERENCES public.investment_history(id) ON DELETE RESTRICT;

CREATE FUNCTION public.capture_investment_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind NOT IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt') THEN RETURN NEW; END IF;
 IF current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.amount=OLD.amount AND NEW.quantity=OLD.quantity AND NEW.ownership_percentage=OLD.ownership_percentage THEN RETURN NEW; END IF;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage,notes)
 VALUES(NEW.user_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'baseline' ELSE 'valuation' END,
 (now() AT TIME ZONE 'Asia/Tashkent')::date,
 NEW.amount*CASE WHEN NEW.kind IN ('Stock','Crypto') THEN NEW.quantity ELSE 1 END,
 CASE WHEN NEW.kind='Business' THEN NEW.ownership_percentage ELSE 100 END,'');
 RETURN NEW;
END $$;
CREATE TRIGGER capture_investment_balance AFTER INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.capture_investment_balance();

CREATE FUNCTION public.guard_investment_history_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.history_event_id IS NOT NULL THEN RAISE EXCEPTION 'Tracked cash movements cannot be edited or deleted.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.kind<>OLD.kind OR NEW.currency<>OLD.currency) AND EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=OLD.id) THEN
  IF OLD.kind='Mortgage' THEN RAISE EXCEPTION 'A mortgage with payments must keep its category and currency.'; END IF;
  RAISE EXCEPTION 'Tracked records must keep their category and currency.';
 END IF;
 IF NEW.history_event_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.investment_history h JOIN public.finance_records r ON r.id=h.record_id
  WHERE h.id=NEW.history_event_id AND NEW.id=h.id AND h.user_id=NEW.user_id AND r.user_id=NEW.user_id
  AND NEW.amount=h.amount AND NEW.currency=r.currency AND NEW.date=h.occurred_on AND NEW.frequency='Once'
  AND ((h.event_type='income' AND NEW.kind=CASE WHEN r.kind='Property' THEN 'Rent income' ELSE 'Other income' END) OR (h.event_type='expense' AND NEW.kind='Other expense'))
 ) THEN RAISE EXCEPTION 'Invalid tracked cash movement.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_investment_history_record BEFORE INSERT OR UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_investment_history_record();

-- Existing balances are observed today, not invented historical purchase values.
INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage)
 SELECT user_id,id,'baseline',(now() AT TIME ZONE 'Asia/Tashkent')::date,
 amount*CASE WHEN kind IN ('Stock','Crypto') THEN quantity ELSE 1 END,
 CASE WHEN kind='Business' THEN ownership_percentage ELSE 100 END
 FROM public.finance_records WHERE kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt');

CREATE FUNCTION public.record_investment_event(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.investment_history; last_date date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_id IS NULL OR p_record_id IS NULL OR p_type IS NULL OR p_date IS NULL OR p_amount IS NULL OR p_notes IS NULL
 OR p_type NOT IN ('valuation','contribution','withdrawal','income','expense') OR p_amount<0 OR p_amount>1e15
 OR p_date>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(p_notes)>2000
 OR (p_type IN ('valuation','contribution','withdrawal') AND (p_balance IS NULL OR p_balance<0 OR p_balance>1e15))
 OR (p_type IN ('income','expense') AND p_balance IS NOT NULL) OR (p_type<>'valuation' AND p_amount<=0)
 OR (p_type='valuation' AND p_amount<>0) THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.kind NOT IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt') THEN RAISE EXCEPTION 'Investment not found.'; END IF;
 IF r.kind='Mortgage' AND p_type<>'valuation' THEN RAISE EXCEPTION 'Use Record payment for mortgage payments.'; END IF;
 SELECT * INTO existing FROM public.investment_history WHERE id=p_id;
 IF FOUND THEN
  IF existing.user_id<>auth.uid() OR existing.record_id<>p_record_id OR existing.event_type<>p_type OR existing.occurred_on<>p_date OR existing.amount<>p_amount OR existing.balance IS DISTINCT FROM p_balance OR existing.notes<>p_notes THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT max(occurred_on) INTO last_date FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL;
 INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,ownership_percentage,notes)
 VALUES(p_id,auth.uid(),r.id,p_type,p_date,p_amount,p_balance,CASE WHEN r.kind='Business' THEN r.ownership_percentage ELSE 100 END,p_notes);
 IF p_balance IS NOT NULL AND (last_date IS NULL OR p_date>=last_date) THEN
  IF r.kind IN ('Stock','Crypto') AND r.quantity=0 THEN RAISE EXCEPTION 'Set a quantity before recording a valuation.'; END IF;
  PERFORM set_config('finance.history_write','1',true);
  UPDATE public.finance_records SET amount=p_balance/CASE WHEN r.kind IN ('Stock','Crypto') THEN r.quantity ELSE 1 END WHERE id=r.id;
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

-- Capture the exact payment date and breakdown using the existing atomic payment flow.
CREATE FUNCTION public.capture_mortgage_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records;
BEGIN
 SELECT * INTO r FROM public.finance_records WHERE id=NEW.mortgage_id;
 INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,principal,interest,notes)
 VALUES(NEW.id,NEW.user_id,NEW.mortgage_id,'mortgage_payment',NEW.paid_on,NEW.principal+NEW.interest,CASE WHEN NEW.paid_on>=(SELECT max(occurred_on) FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL) THEN r.amount-NEW.principal ELSE NULL END,NEW.principal,NEW.interest,NEW.notes);
 -- The following balance update also records today's confirmed outstanding balance.
 RETURN NEW;
END $$;
CREATE TRIGGER capture_mortgage_history AFTER INSERT ON public.mortgage_payments FOR EACH ROW EXECUTE FUNCTION public.capture_mortgage_history();
INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,principal,interest,notes)
 SELECT id,user_id,mortgage_id,'mortgage_payment',paid_on,principal+interest,principal,interest,notes FROM public.mortgage_payments;
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Monthly budgets are plans; linked finance records are actual one-time spending.
CREATE TABLE public.expense_plans (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 category text NOT NULL CHECK(category IN ('Groceries','Family support','Household','Other')),
 currency text NOT NULL CHECK(currency IN ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG')),
 amount numeric NOT NULL CHECK(amount>0 AND amount<=1e15),
 start_date date NOT NULL,
 end_date date CHECK(end_date IS NULL OR end_date>=start_date),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id)
);
ALTER TABLE public.expense_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage expense plans" ON public.expense_plans FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
REVOKE ALL ON public.expense_plans FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.expense_plans TO authenticated;
ALTER TABLE public.finance_records ADD COLUMN expense_plan_id uuid;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_expense_plan_owner_fk
 FOREIGN KEY(expense_plan_id,user_id) REFERENCES public.expense_plans(id,user_id) ON DELETE RESTRICT;
CREATE INDEX finance_records_plan_month ON public.finance_records(user_id,expense_plan_id,date);

CREATE FUNCTION public.guard_expense_plan_spending() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE plan public.expense_plans;
BEGIN
 IF NEW.expense_plan_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO plan FROM public.expense_plans WHERE id=NEW.expense_plan_id AND user_id=NEW.user_id FOR SHARE;
 IF NOT FOUND OR NEW.kind NOT IN ('Rent expense','Living expense','Charity','Other expense')
 OR NEW.frequency<>'Once' OR NEW.currency<>plan.currency OR NEW.business_id IS NOT NULL
 OR NEW.history_event_id IS NOT NULL OR NEW.mortgage_payment_id IS NOT NULL
 OR NEW.date IS NULL OR NEW.date<plan.start_date OR (plan.end_date IS NOT NULL AND NEW.date>plan.end_date)
 THEN RAISE EXCEPTION 'Check the expense plan, currency and spending date.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_expense_plan_spending BEFORE INSERT OR UPDATE ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.guard_expense_plan_spending();

CREATE FUNCTION public.guard_expense_plan_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.finance_records r WHERE r.expense_plan_id=OLD.id
 AND (r.currency<>NEW.currency OR r.date<NEW.start_date OR (NEW.end_date IS NOT NULL AND r.date>NEW.end_date)))
 THEN RAISE EXCEPTION 'Keep the currency and dates compatible with recorded spending.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_expense_plan_changes BEFORE UPDATE ON public.expense_plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_expense_plan_changes();

-- JSON aggregation avoids truncating plans or payments at PostgREST's row limit.
CREATE FUNCTION public.expense_plan_month(p_month date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.category,p.name,p.id),'[]'::jsonb) FROM (
 SELECT ep.id,ep.name,ep.category,ep.currency,ep.amount,ep.start_date,ep.end_date,
 coalesce((SELECT sum(r.amount) FROM public.finance_records r WHERE r.expense_plan_id=ep.id AND r.user_id=auth.uid()
 AND r.date>=date_trunc('month',p_month)::date AND r.date<(date_trunc('month',p_month)+interval '1 month')::date),0) AS spent
 FROM public.expense_plans ep WHERE ep.user_id=auth.uid()
 ) p;
$$;
REVOKE ALL ON FUNCTION public.expense_plan_month(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.expense_plan_month(date) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- Preserve recurring records and their historical planning interval when stopped.
ALTER TABLE public.finance_records ADD COLUMN end_date date;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_end_date_check CHECK (
 end_date IS NULL OR (date IS NOT NULL AND end_date>=date AND frequency IN ('Monthly','Yearly') AND kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'))
);
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
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 10.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Business')) OR (p_section='debts' AND r.kind IN ('Money lent','Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
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
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';
-- Keep a private, durable copy of each successful deletion. Existing relationship
-- and history guards still apply; a failed deletion never creates an archive row.
CREATE TABLE public.deleted_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source text NOT NULL CHECK(source IN ('finance_records','expense_plans')),
 data jsonb NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deleted_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read deleted items" ON public.deleted_items FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.deleted_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.deleted_items TO authenticated;
CREATE INDEX deleted_items_owner_date ON public.deleted_items(user_id,deleted_at DESC,id);

CREATE FUNCTION public.archive_deleted_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- Do not archive account deletion cascades or privileged maintenance.
 IF OLD.user_id=auth.uid() AND EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
  INSERT INTO public.deleted_items(user_id,source,data) VALUES(OLD.user_id,TG_TABLE_NAME,to_jsonb(OLD));
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.archive_deleted_item() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER archive_deleted_record AFTER DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_item();
CREATE TRIGGER archive_deleted_plan AFTER DELETE ON public.expense_plans FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_item();

CREATE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 -- Retrying an already successful restoration is safe and does not duplicate it.
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' THEN
  INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 ELSE
  INSERT INTO public.expense_plans SELECT (jsonb_populate_record(NULL::public.expense_plans,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 END IF;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.restore_deleted_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid) TO authenticated;
-- APIs call this function so removal fails safely until this migration is installed.
CREATE FUNCTION public.move_item_to_deleted(p_id uuid,p_source text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_source='finance_records' THEN
  DELETE FROM public.finance_records WHERE id=p_id AND user_id=auth.uid();
 ELSIF p_source='expense_plans' THEN
  DELETE FROM public.expense_plans WHERE id=p_id AND user_id=auth.uid();
 ELSE RAISE EXCEPTION 'Check the record fields.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.move_item_to_deleted(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_item_to_deleted(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- First app activity and an owner-private, fixed starting capital for comparisons.
BEGIN;
CREATE TABLE public.user_app_activity (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL CHECK(source IN ('first_visit','earliest_record')) DEFAULT 'first_visit'
);
ALTER TABLE public.user_app_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read app activity" ON public.user_app_activity FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.user_app_activity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.user_app_activity TO authenticated;
-- Recorded-at timestamps are evidence of app use; backdated financial dates are not.
INSERT INTO public.user_app_activity(user_id,started_at,source)
 SELECT user_id,min(created_at),'earliest_record' FROM (
  SELECT user_id,created_at FROM public.finance_records
  UNION ALL SELECT user_id,created_at FROM public.expense_plans
  UNION ALL SELECT user_id,created_at FROM public.investment_history
 ) activity GROUP BY user_id;
CREATE FUNCTION public.mark_app_started() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.user_app_activity;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 INSERT INTO public.user_app_activity(user_id) VALUES(auth.uid()) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO result FROM public.user_app_activity WHERE user_id=auth.uid();
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.mark_app_started() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_app_started() TO authenticated;

CREATE TABLE public.investment_comparison_baselines (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 starting_amount numeric NOT NULL CHECK(starting_amount>=0 AND starting_amount<=1e27),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 capital_as_of timestamptz NOT NULL DEFAULT now(),
 holdings jsonb NOT NULL CHECK(jsonb_typeof(holdings)='array')
);
ALTER TABLE public.investment_comparison_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read comparison baselines" ON public.investment_comparison_baselines FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Owners create comparison baselines" ON public.investment_comparison_baselines FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
REVOKE ALL ON public.investment_comparison_baselines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.investment_comparison_baselines TO authenticated;
GRANT INSERT(user_id,starting_amount,currency,holdings) ON public.investment_comparison_baselines TO authenticated;
-- No UPDATE permission: later visits and settings saves cannot move the starting capital.
CREATE TABLE public.investment_comparison_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 benchmarks jsonb NOT NULL DEFAULT '["BTC"]'::jsonb CHECK(jsonb_typeof(benchmarks)='array'),
 custom_symbol text NOT NULL DEFAULT ''
);
ALTER TABLE public.investment_comparison_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read comparison preferences" ON public.investment_comparison_preferences FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Owners create comparison preferences" ON public.investment_comparison_preferences FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY "Owners update comparison preferences" ON public.investment_comparison_preferences FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
REVOKE ALL ON public.investment_comparison_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.investment_comparison_preferences TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
