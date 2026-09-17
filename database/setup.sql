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
-- Retain daily market-valued portfolio totals without modifying investment records.
BEGIN;
CREATE TABLE public.portfolio_snapshots (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 occurred_on date NOT NULL,
 assets numeric NOT NULL CHECK(assets>=0 AND assets<1e30),
 debt numeric NOT NULL CHECK(debt>=0 AND debt<1e30),
 rates jsonb NOT NULL CHECK(jsonb_typeof(rates)='object'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,occurred_on)
);
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read portfolio snapshots" ON public.portfolio_snapshots FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.portfolio_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.portfolio_snapshots TO authenticated;
CREATE FUNCTION public.capture_portfolio_snapshot(p_assets numeric,p_debt numeric,p_rates jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.portfolio_snapshots;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF jsonb_typeof(p_rates) IS DISTINCT FROM 'object' OR (p_rates->'USD') IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Invalid exchange rates'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_rates) r WHERE r.key !~ '^[A-Z]{3}$' OR CASE WHEN jsonb_typeof(r.value)='number' THEN (r.value::text)::numeric<=0 OR (r.value::text)::numeric>=1e30 ELSE true END) THEN RAISE EXCEPTION 'Invalid exchange rates'; END IF;
 INSERT INTO public.portfolio_snapshots(user_id,occurred_on,assets,debt,rates)
 VALUES(auth.uid(),(now() AT TIME ZONE 'Asia/Tashkent')::date,p_assets,p_debt,p_rates)
 ON CONFLICT(user_id,occurred_on) DO UPDATE SET assets=excluded.assets,debt=excluded.debt,rates=excluded.rates,updated_at=now()
 RETURNING * INTO result;
 RETURN to_jsonb(result)-'user_id';
END $$;
REVOKE ALL ON FUNCTION public.capture_portfolio_snapshot(numeric,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_portfolio_snapshot(numeric,numeric,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Accounts reuse Cash holdings: no duplicate assets are created.
BEGIN;
ALTER TABLE public.finance_records ADD COLUMN account_id uuid REFERENCES public.finance_records(id) ON DELETE RESTRICT,
 ADD COLUMN custom_category_id uuid, ADD COLUMN import_key text;
CREATE UNIQUE INDEX finance_import_key ON public.finance_records(user_id,import_key) WHERE import_key IS NOT NULL;
CREATE TABLE public.custom_categories (
 id uuid PRIMARY KEY, user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80), UNIQUE(id,user_id), UNIQUE(user_id,name)
);
ALTER TABLE public.finance_records ADD CONSTRAINT finance_category_owner FOREIGN KEY(custom_category_id,user_id) REFERENCES public.custom_categories(id,user_id);
CREATE TABLE public.account_activity (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('transfer','reconcile','repayment','mortgage')),
 account_id uuid NOT NULL REFERENCES public.finance_records(id), target_id uuid REFERENCES public.finance_records(id),
 amount numeric NOT NULL CHECK(amount>=0 AND amount<=1e15), received numeric NOT NULL DEFAULT 0 CHECK(received>=0 AND received<=1e15),
 fee numeric NOT NULL DEFAULT 0 CHECK(fee>=0 AND fee<=1e15), occurred_on date NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), created_at timestamptz NOT NULL DEFAULT now(),
 before_balance numeric NOT NULL, after_balance numeric NOT NULL
);
ALTER TABLE public.account_activity ADD CONSTRAINT account_activity_owner_unique UNIQUE(id,user_id);
ALTER TABLE public.finance_records ADD COLUMN operation_id uuid UNIQUE,
 ADD CONSTRAINT finance_operation_owner FOREIGN KEY(operation_id,user_id) REFERENCES public.account_activity(id,user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION public.guard_operation_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.operation_id IS NOT NULL THEN RAISE EXCEPTION 'Account operation fees cannot be edited or deleted.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_operation_record BEFORE UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_operation_record();
CREATE FUNCTION public.validate_operation_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op public.account_activity; a public.finance_records; destination public.finance_records;
BEGIN
 IF NEW.operation_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO op FROM public.account_activity WHERE id=NEW.operation_id AND user_id=NEW.user_id;
 SELECT * INTO a FROM public.finance_records WHERE id=op.account_id;
 SELECT * INTO destination FROM public.finance_records WHERE id=op.target_id;
 IF op.id IS NULL OR op.fee<=0 OR op.action NOT IN ('transfer','repayment') OR NEW.amount<>op.fee OR NEW.account_id IS DISTINCT FROM op.account_id OR NEW.currency<>a.currency OR NEW.date<>op.occurred_on OR NEW.frequency<>'Once' OR NEW.kind<>(CASE WHEN op.action='repayment' AND destination.kind='Money lent' THEN 'Other income' ELSE 'Other expense' END) THEN RAISE EXCEPTION 'Invalid account operation fee.'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER validate_operation_record AFTER INSERT OR UPDATE ON public.finance_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_operation_record();
CREATE TABLE public.payment_occurrences (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL REFERENCES public.finance_records(id), due_on date NOT NULL,
 status text NOT NULL CHECK(status IN ('paid','dismissed')), transaction_id uuid REFERENCES public.finance_records(id),
 UNIQUE(user_id,record_id,due_on)
);
CREATE TABLE public.savings_goals (
 id uuid PRIMARY KEY, user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120), account_id uuid NOT NULL REFERENCES public.finance_records(id),
 target numeric NOT NULL CHECK(target>0 AND target<=1e15), allocated numeric NOT NULL DEFAULT 0 CHECK(allocated>=0 AND allocated<=target),
 target_date date, archived boolean NOT NULL DEFAULT false
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['custom_categories','account_activity','payment_occurrences','savings_goals'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;
-- A linked one-time cashflow changes its account atomically. Edits reverse the old
-- effect, deletes reverse it, and restoring a deleted record reapplies it.
CREATE FUNCTION public.apply_account_cashflow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; old_delta numeric:=0; new_delta numeric:=0; ids uuid[]; item uuid;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.account_id IS NOT NULL THEN
  old_delta:=CASE WHEN OLD.kind IN ('Salary','Rent income','Other income') THEN OLD.amount ELSE -OLD.amount END;
  ids:=array_append(ids,OLD.account_id);
 END IF;
 IF TG_OP<>'DELETE' AND NEW.account_id IS NOT NULL THEN
  IF NEW.frequency<>'Once' OR NEW.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') OR NEW.date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Only actual income and expenses can update an account.'; END IF;
  new_delta:=CASE WHEN NEW.kind IN ('Salary','Rent income','Other income') THEN NEW.amount ELSE -NEW.amount END;
  ids:=array_append(ids,NEW.account_id);
 END IF;
 FOR item IN SELECT DISTINCT unnest(ids) ORDER BY 1 LOOP
  SELECT * INTO a FROM public.finance_records WHERE id=item FOR UPDATE;
  IF NOT FOUND OR a.kind<>'Cash' OR a.user_id<>coalesce(NEW.user_id,OLD.user_id) THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
  IF TG_OP<>'DELETE' AND item=NEW.account_id AND a.currency<>NEW.currency THEN RAISE EXCEPTION 'The account and transaction currencies must match.'; END IF;
  UPDATE public.finance_records SET amount=amount
   -CASE WHEN TG_OP<>'INSERT' AND item=OLD.account_id THEN old_delta ELSE 0 END
   +CASE WHEN TG_OP<>'DELETE' AND item=NEW.account_id THEN new_delta ELSE 0 END WHERE id=item;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER apply_account_cashflow AFTER INSERT OR UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.apply_account_cashflow();
CREATE FUNCTION public.planning_action(p_action text,p_data jsonb) RETURNS jsonb
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
  SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
  IF coalesce((p_data->>'archived')::boolean,false)=false AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;
  INSERT INTO public.savings_goals(id,user_id,name,account_id,target,allocated,target_date,archived)
  VALUES(item,owner,trim(p_data->>'name'),aid,(p_data->>'target')::numeric,(p_data->>'allocated')::numeric,(p_data->>'target_date')::date,coalesce((p_data->>'archived')::boolean,false))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,account_id=excluded.account_id,target=excluded.target,allocated=excluded.allocated,target_date=excluded.target_date,archived=excluded.archived WHERE savings_goals.user_id=owner;
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

BEGIN;
CREATE TABLE public.expense_plan_versions (
 plan_id uuid NOT NULL REFERENCES public.expense_plans(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 effective_month date NOT NULL CHECK(extract(day FROM effective_month)=1),
 amount numeric NOT NULL CHECK(amount>0 AND amount<=1e15), rollover boolean NOT NULL DEFAULT false,
 PRIMARY KEY(plan_id,effective_month)
);
ALTER TABLE public.expense_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.expense_plan_versions FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.expense_plan_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.expense_plan_versions TO authenticated;
-- Seed the first known allowance; there is no invented history of older edits.
INSERT INTO public.expense_plan_versions SELECT id,user_id,date_trunc('month',start_date)::date,amount,false FROM public.expense_plans;
CREATE FUNCTION public.seed_budget_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.expense_plan_versions VALUES(NEW.id,NEW.user_id,date_trunc('month',NEW.start_date)::date,NEW.amount,false);
 RETURN NEW;
END $$;
CREATE TRIGGER seed_budget_version AFTER INSERT ON public.expense_plans FOR EACH ROW EXECUTE FUNCTION public.seed_budget_version();
CREATE FUNCTION public.save_budget_plan(p_plan jsonb,p_month date,p_rollover boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.expense_plans; owner uuid:=auth.uid(); item uuid:=(p_plan->>'id')::uuid;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_month IS NULL OR extract(day FROM p_month)<>1 OR p_rollover IS NULL THEN RAISE EXCEPTION 'Check the plan fields.'; END IF;
 SELECT * INTO existing FROM public.expense_plans WHERE id=item FOR UPDATE;
 IF FOUND THEN
  IF existing.user_id<>owner THEN RAISE EXCEPTION 'Plan not found.'; END IF;
  IF existing.currency<>p_plan->>'currency' OR existing.start_date<>(p_plan->>'start_date')::date THEN RAISE EXCEPTION 'Keep the currency and start date of an existing budget.'; END IF;
  UPDATE public.expense_plans SET name=p_plan->>'name',category=p_plan->>'category',end_date=(p_plan->>'end_date')::date WHERE id=item;
 ELSE
  INSERT INTO public.expense_plans(id,user_id,name,category,currency,amount,start_date,end_date)
  VALUES(item,owner,p_plan->>'name',p_plan->>'category',p_plan->>'currency',(p_plan->>'amount')::numeric,(p_plan->>'start_date')::date,(p_plan->>'end_date')::date);
 END IF;
 IF p_month<date_trunc('month',(p_plan->>'start_date')::date)::date THEN RAISE EXCEPTION 'Budget changes cannot start before the plan.'; END IF;
 INSERT INTO public.expense_plan_versions VALUES(item,owner,p_month,(p_plan->>'amount')::numeric,p_rollover)
 ON CONFLICT(plan_id,effective_month) DO UPDATE SET amount=excluded.amount,rollover=excluded.rollover;
END $$;
REVOKE ALL ON FUNCTION public.save_budget_plan(jsonb,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_budget_plan(jsonb,date,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.expense_plan_month(p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.expense_plans; m date; chosen date:=date_trunc('month',p_month)::date; budget numeric; roll boolean; spent numeric; carry numeric; incoming numeric; result jsonb:='[]'::jsonb;
BEGIN
 FOR p IN SELECT * FROM public.expense_plans WHERE user_id=auth.uid() ORDER BY category,name,id LOOP
  carry:=0; incoming:=0; spent:=0; budget:=p.amount; roll:=false;
  FOR m IN SELECT generate_series(least(date_trunc('month',p.start_date)::date,chosen),chosen,interval '1 month')::date LOOP
   SELECT v.amount,v.rollover INTO budget,roll FROM public.expense_plan_versions v WHERE v.plan_id=p.id AND v.user_id=auth.uid() AND v.effective_month<=m ORDER BY effective_month DESC LIMIT 1;
   budget:=coalesce(budget,p.amount);roll:=coalesce(roll,false);
   IF m<date_trunc('month',p.start_date)::date OR (p.end_date IS NOT NULL AND m>date_trunc('month',p.end_date)::date) THEN budget:=0;carry:=0; END IF;
   SELECT coalesce(sum(r.amount),0) INTO spent FROM public.finance_records r WHERE r.expense_plan_id=p.id AND r.user_id=auth.uid() AND r.date>=m AND r.date<m+interval '1 month';
   incoming:=CASE WHEN roll THEN carry ELSE 0 END;
   carry:=CASE WHEN roll THEN greatest(0,budget+incoming-spent) ELSE 0 END;
  END LOOP;
  result:=result||jsonb_build_array(to_jsonb(p)-'user_id'||jsonb_build_object('amount',budget,'base_amount',p.amount,'spent',spent,'carryover',incoming,'rollover',roll));
 END LOOP;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE FUNCTION public.import_account_transactions(p_account uuid,p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r jsonb; added integer:=0; skipped integer:=0; signed numeric; owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Check the import fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 -- Process chronologically, with receipts first on equal dates.
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'date',(value->>'amount')::numeric DESC LOOP
  signed:=(r->>'amount')::numeric;
  IF signed IS NULL OR signed=0 OR abs(signed)>1e15 OR r->>'key' IS NULL OR r->>'key' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Check the import fields.'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=owner AND import_key=r->>'key') THEN skipped:=skipped+1;CONTINUE; END IF;
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,import_key)
  VALUES(gen_random_uuid(),owner,r->>'name',CASE WHEN signed>0 THEN 'Other income' ELSE 'Other expense' END,a.currency,abs(signed),(r->>'date')::date,'Once',coalesce(r->>'notes',''),p_account,r->>'key');
  added:=added+1;
 END LOOP;
 RETURN jsonb_build_object('added',added,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION public.import_account_transactions(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_account_transactions(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE TABLE public.investment_account_links (
 id uuid PRIMARY KEY REFERENCES public.investment_history(id),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES public.finance_records(id),amount numeric NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.investment_account_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.investment_account_links FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.investment_account_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.investment_account_links TO authenticated;
CREATE FUNCTION public.record_investment_with_account(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r public.finance_records; prior public.investment_account_links; result jsonb; delta numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 PERFORM id FROM public.finance_records WHERE id IN(p_account,p_record_id) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=auth.uid() AND kind='Cash';
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid() AND kind IN ('Stock','Crypto','Deposit','Property','Business');
 IF a.id IS NULL OR r.id IS NULL OR a.currency<>r.currency OR p_type='valuation' THEN RAISE EXCEPTION 'Choose an account in the investment currency.'; END IF;
 delta:=CASE WHEN p_type IN ('income','withdrawal') THEN p_amount ELSE -p_amount END;
 SELECT * INTO prior FROM public.investment_account_links WHERE id=p_id;
 IF FOUND THEN
  IF prior.user_id<>auth.uid() OR prior.account_id<>p_account OR prior.amount<>delta THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 END IF;
 IF EXISTS(SELECT 1 FROM public.investment_history WHERE id=p_id) THEN RAISE EXCEPTION 'This update was already saved without an account.'; END IF;
 result:=public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 UPDATE public.finance_records SET amount=amount+delta WHERE id=p_account;
 INSERT INTO public.investment_account_links(id,user_id,account_id,amount) VALUES(p_id,auth.uid(),p_account,delta);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) TO authenticated;
-- Supabase's service role is used exclusively by the authenticated cron endpoint.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT ON public.finance_records TO service_role;
 GRANT SELECT,INSERT,UPDATE ON public.portfolio_snapshots TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Read the whole owner backup from one PostgreSQL snapshot, without row limits.
BEGIN;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 RETURN jsonb_build_object('version',1,'exported_at',now(),'tables',jsonb_build_object(
  'finance_records',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.finance_records r WHERE r.user_id=auth.uid()),
  'investment_history',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_history r WHERE r.user_id=auth.uid()),
  'investment_account_links',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_account_links r WHERE r.user_id=auth.uid()),
  'mortgage_payments',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.mortgage_payments r WHERE r.user_id=auth.uid()),
  'expense_plans',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.expense_plans r WHERE r.user_id=auth.uid()),
  'expense_plan_versions',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.expense_plan_versions r WHERE r.user_id=auth.uid()),
  'custom_categories',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.custom_categories r WHERE r.user_id=auth.uid()),
  'savings_goals',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.savings_goals r WHERE r.user_id=auth.uid()),
  'account_activity',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.account_activity r WHERE r.user_id=auth.uid()),
  'payment_occurrences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.payment_occurrences r WHERE r.user_id=auth.uid()),
  'deleted_items',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.deleted_items r WHERE r.user_id=auth.uid()),
  'user_preferences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.user_preferences r WHERE r.user_id=auth.uid()),
  'user_app_activity',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.user_app_activity r WHERE r.user_id=auth.uid()),
  'investment_comparison_preferences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_comparison_preferences r WHERE r.user_id=auth.uid()),
  'investment_comparison_baselines',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_comparison_baselines r WHERE r.user_id=auth.uid()),
  'portfolio_snapshots',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.portfolio_snapshots r WHERE r.user_id=auth.uid())
 ));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Net-worth goals and saved contribution scenarios.
BEGIN;
ALTER TABLE public.savings_goals ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE public.savings_goals
 ADD COLUMN kind text NOT NULL DEFAULT 'savings' CHECK(kind IN ('savings','net_worth')),
 ADD COLUMN currency text,
 ADD COLUMN monthly_contribution numeric CHECK(monthly_contribution>=0 AND monthly_contribution<=1e15),
 ADD COLUMN annual_return numeric NOT NULL DEFAULT 0 CHECK(annual_return>=0 AND annual_return<=100);
UPDATE public.savings_goals g SET currency=r.currency FROM public.finance_records r WHERE r.id=g.account_id;
ALTER TABLE public.savings_goals ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_currency_check CHECK(currency IN ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG'));
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_account_kind_check CHECK(
 (kind='savings' AND account_id IS NOT NULL) OR
 (kind='net_worth' AND account_id IS NULL AND allocated=0 AND target_date IS NOT NULL)
);
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
  END IF;
  INSERT INTO public.savings_goals(id,user_id,name,account_id,target,allocated,target_date,archived,kind,currency,monthly_contribution,annual_return)
  VALUES(item,owner,trim(p_data->>'name'),aid,(p_data->>'target')::numeric,(p_data->>'allocated')::numeric,(p_data->>'target_date')::date,coalesce((p_data->>'archived')::boolean,false),coalesce(p_data->>'kind','savings'),coalesce(a.currency,p_data->>'currency'),(p_data->>'monthly_contribution')::numeric,coalesce((p_data->>'annual_return')::numeric,0))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,account_id=excluded.account_id,target=excluded.target,allocated=excluded.allocated,target_date=excluded.target_date,archived=excluded.archived,kind=excluded.kind,currency=excluded.currency,monthly_contribution=excluded.monthly_contribution,annual_return=excluded.annual_return WHERE savings_goals.user_id=owner;
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

-- Stock and crypto accounts with multiple holdings.
-- Brokerage and crypto containers group existing holdings; they add no asset balance.
BEGIN;
CREATE TABLE public.holding_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('Stock','Crypto')),
 currency text NOT NULL CHECK(currency IN ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id)
);
ALTER TABLE public.holding_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY holding_accounts_owner ON public.holding_accounts FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
REVOKE ALL ON public.holding_accounts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.holding_accounts TO authenticated;
CREATE INDEX holding_accounts_owner ON public.holding_accounts(user_id,id);
ALTER TABLE public.finance_records ADD COLUMN holding_account_id uuid;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_holding_account_owner FOREIGN KEY(holding_account_id,user_id) REFERENCES public.holding_accounts(id,user_id);
CREATE INDEX finance_records_holding_account ON public.finance_records(holding_account_id) WHERE holding_account_id IS NOT NULL;
CREATE FUNCTION public.guard_holding_account_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE linked public.holding_accounts;
BEGIN
 IF NEW.holding_account_id IS NOT NULL THEN
  SELECT * INTO linked FROM public.holding_accounts WHERE id=NEW.holding_account_id AND user_id=NEW.user_id FOR SHARE;
  IF NOT FOUND OR NEW.kind NOT IN ('Stock','Crypto') OR NEW.kind<>linked.kind THEN
   RAISE EXCEPTION 'Choose one of your matching stock or crypto accounts.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_holding_account_link BEFORE INSERT OR UPDATE OF holding_account_id,kind,user_id ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_holding_account_link();
CREATE FUNCTION public.guard_holding_account_kind() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind<>OLD.kind AND EXISTS(SELECT 1 FROM public.finance_records WHERE holding_account_id=OLD.id) THEN
  RAISE EXCEPTION 'Move the holdings before changing this account type.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_holding_account_kind BEFORE UPDATE ON public.holding_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_holding_account_kind();
REVOKE ALL ON FUNCTION public.guard_holding_account_link(),public.guard_holding_account_kind() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.export_finance_backup() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 RETURN jsonb_build_object('version',1,'exported_at',now(),'tables',jsonb_build_object(
  'holding_accounts',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.holding_accounts r WHERE r.user_id=auth.uid()),
  'finance_records',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.finance_records r WHERE r.user_id=auth.uid()),
  'investment_history',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_history r WHERE r.user_id=auth.uid()),
  'investment_account_links',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_account_links r WHERE r.user_id=auth.uid()),
  'mortgage_payments',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.mortgage_payments r WHERE r.user_id=auth.uid()),
  'expense_plans',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.expense_plans r WHERE r.user_id=auth.uid()),
  'expense_plan_versions',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.expense_plan_versions r WHERE r.user_id=auth.uid()),
  'custom_categories',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.custom_categories r WHERE r.user_id=auth.uid()),
  'savings_goals',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.savings_goals r WHERE r.user_id=auth.uid()),
  'account_activity',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.account_activity r WHERE r.user_id=auth.uid()),
  'payment_occurrences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.payment_occurrences r WHERE r.user_id=auth.uid()),
  'deleted_items',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.deleted_items r WHERE r.user_id=auth.uid()),
  'user_preferences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.user_preferences r WHERE r.user_id=auth.uid()),
  'user_app_activity',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.user_app_activity r WHERE r.user_id=auth.uid()),
  'investment_comparison_preferences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_comparison_preferences r WHERE r.user_id=auth.uid()),
  'investment_comparison_baselines',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_comparison_baselines r WHERE r.user_id=auth.uid()),
  'portfolio_snapshots',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.portfolio_snapshots r WHERE r.user_id=auth.uid())
 ));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Trades, deposit transfers and compounding settings.
-- Atomic trades, deposit transfers, and capitalized interest. Existing records remain intact.
BEGIN;
-- Acquire existing-table locks before changing the schema. NOWAIT prevents a
-- reader/writer holding one dependency from waiting behind this migration while
-- we wait for another dependency. Failed attempts release ALL preflight locks
-- through the inner exception block before retrying (at most five seconds).
-- Keep later implicit DDL lock waits short as well, including catalog locks.
SET LOCAL lock_timeout = '500ms';
DO $$
DECLARE attempt integer;
BEGIN
 FOR attempt IN 1..20 LOOP
  BEGIN
   LOCK TABLE public.finance_records IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK TABLE public.holding_accounts, public.investment_history IN ACCESS SHARE MODE NOWAIT;
   EXIT;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=20 THEN
    RAISE EXCEPTION USING ERRCODE='55P03',
     MESSAGE='Migration 025 could not acquire its locks. No migration changes were applied.',
     HINT='Wait for other SQL queries to finish, close active finance app tabs, then rerun the entire migration. Do not run two copies at once.';
   END IF;
  END;
  PERFORM pg_sleep(0.25);
 END LOOP;
END $$;
ALTER TABLE public.finance_records ADD COLUMN deposit_compounding text NOT NULL DEFAULT 'monthly' CHECK(deposit_compounding IN ('monthly','daily','none'));
ALTER TABLE public.finance_records ADD COLUMN opened_on date;
CREATE FUNCTION public.guard_opening_balance_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.opened_on IS NOT NULL AND (NEW.kind NOT IN ('Cash','Deposit','Stock','Crypto') OR NEW.opened_on>(now() AT TIME ZONE 'Asia/Tashkent')::date) THEN RAISE EXCEPTION 'Check the opening balance date.'; END IF;
 IF TG_OP='UPDATE' AND NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN RAISE EXCEPTION 'The opening balance date cannot change after creation.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_opening_balance_date BEFORE INSERT OR UPDATE OF opened_on ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_opening_balance_date();
CREATE OR REPLACE FUNCTION public.capture_investment_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind NOT IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt') THEN RETURN NEW; END IF;
 IF current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.amount=OLD.amount AND NEW.quantity=OLD.quantity AND NEW.ownership_percentage=OLD.ownership_percentage THEN RETURN NEW; END IF;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage,notes)
 VALUES(NEW.user_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'baseline' ELSE 'valuation' END,
 CASE WHEN TG_OP='INSERT' THEN coalesce(NEW.opened_on,(now() AT TIME ZONE 'Asia/Tashkent')::date) ELSE (now() AT TIME ZONE 'Asia/Tashkent')::date END,
 NEW.amount*CASE WHEN NEW.kind IN ('Stock','Crypto') THEN NEW.quantity ELSE 1 END,
 CASE WHEN NEW.kind='Business' THEN NEW.ownership_percentage ELSE 100 END,'');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_opening_balance_date() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_holding_account_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE linked public.holding_accounts;
BEGIN
 IF NEW.holding_account_id IS NOT NULL THEN
  SELECT * INTO linked FROM public.holding_accounts WHERE id=NEW.holding_account_id AND user_id=NEW.user_id FOR SHARE;
  IF NOT FOUND OR (NEW.kind<>'Cash' AND NEW.kind<>linked.kind) THEN RAISE EXCEPTION 'Choose one of your matching stock or crypto accounts.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TABLE public.asset_movements (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('transfer','buy','sell','interest')),
 source_id uuid NOT NULL REFERENCES public.finance_records(id), target_id uuid NOT NULL REFERENCES public.finance_records(id),
 sent numeric NOT NULL CHECK(sent>=0 AND sent<=1e15), received numeric NOT NULL CHECK(received>0 AND received<=1e15),
 source_value numeric NOT NULL CHECK(source_value>=0 AND source_value<=1e15), target_value numeric NOT NULL CHECK(target_value>0 AND target_value<=1e15),
 fee numeric NOT NULL DEFAULT 0 CHECK(fee>=0 AND fee<=1e15), occurred_on date NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 source_before numeric NOT NULL, source_after numeric NOT NULL, target_before numeric NOT NULL, target_after numeric NOT NULL,
 realized_gain numeric, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(id,user_id)
);
ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_movements_owner ON public.asset_movements FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.asset_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.asset_movements TO authenticated;
CREATE INDEX asset_movements_owner_date ON public.asset_movements(user_id,occurred_on,id);
ALTER TABLE public.finance_records ADD COLUMN movement_id uuid UNIQUE;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_movement_owner FOREIGN KEY(movement_id,user_id) REFERENCES public.asset_movements(id,user_id);
CREATE FUNCTION public.guard_movement_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE movement public.asset_movements; source public.finance_records; target public.finance_records;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.movement_id IS NOT NULL THEN RAISE EXCEPTION 'Movement income and fees cannot be edited or deleted.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.movement_id IS NOT NULL THEN
  SELECT * INTO movement FROM public.asset_movements WHERE id=NEW.movement_id AND user_id=NEW.user_id;
  SELECT * INTO source FROM public.finance_records WHERE id=movement.source_id;
  SELECT * INTO target FROM public.finance_records WHERE id=movement.target_id;
  IF movement.id IS NULL OR NEW.frequency<>'Once' OR NEW.date<>movement.occurred_on OR NEW.account_id IS NOT NULL
   OR (movement.kind='interest' AND (NEW.kind<>'Other income' OR NEW.amount<>movement.received OR NEW.currency<>target.currency))
   OR (movement.kind<>'interest' AND (NEW.kind<>'Other expense' OR NEW.amount<>movement.fee OR NEW.currency<>CASE WHEN movement.kind='buy' THEN target.currency ELSE source.currency END OR movement.fee<=0))
  THEN RAISE EXCEPTION 'Invalid movement income or fee.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_movement_record BEFORE INSERT OR UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_movement_record();
CREATE FUNCTION public.record_asset_movement(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); a public.finance_records; b public.finance_records; prior public.asset_movements;
 item uuid:=(p_data->>'id')::uuid; action text:=p_data->>'kind'; aid uuid:=(p_data->>'source_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 sent numeric:=(p_data->>'sent')::numeric; received numeric:=(p_data->>'received')::numeric;
 av numeric:=(p_data->>'source_value')::numeric; bv numeric:=(p_data->>'target_value')::numeric; fee numeric:=(p_data->>'fee')::numeric;
 day date:=(p_data->>'date')::date; memo text:=p_data->>'notes'; ab numeric; bb numeric; aa numeric; ba numeric; a_units boolean; b_units boolean; last_day date; gain numeric;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL OR action IS NULL OR action NOT IN ('transfer','buy','sell','interest') OR aid IS NULL OR bid IS NULL
  OR sent IS NULL OR received IS NULL OR av IS NULL OR bv IS NULL OR fee IS NULL OR memo IS NULL OR day IS NULL
  OR sent<0 OR sent>1e15 OR received<=0 OR received>1e15 OR av<0 OR av>1e15 OR bv<=0 OR bv>1e15 OR fee<0 OR fee>1e15
  OR sent::text IN ('NaN','Infinity','-Infinity') OR received::text IN ('NaN','Infinity','-Infinity') OR av::text IN ('NaN','Infinity','-Infinity') OR bv::text IN ('NaN','Infinity','-Infinity') OR fee::text IN ('NaN','Infinity','-Infinity')
  OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the movement fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.asset_movements WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.kind<>action OR prior.source_id<>aid OR prior.target_id<>bid OR prior.sent<>sent OR prior.received<>received OR prior.source_value<>av OR prior.target_value<>bv OR prior.fee<>fee OR prior.occurred_on<>day OR prior.notes<>memo THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 PERFORM id FROM public.finance_records WHERE id IN(aid,bid) AND user_id=owner ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner;
 SELECT * INTO b FROM public.finance_records WHERE id=bid AND user_id=owner;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Choose your own source and destination.'; END IF;
 a_units:=a.kind IN ('Stock','Crypto'); b_units:=b.kind IN ('Stock','Crypto');
 IF action='interest' THEN
  IF aid<>bid OR a.kind<>'Deposit' OR sent<>0 OR av<>0 OR bv<>received OR fee<>0 THEN RAISE EXCEPTION 'Choose a deposit for capitalized interest.'; END IF;
 ELSE
  IF aid=bid OR sent<=0 OR av<=0 THEN RAISE EXCEPTION 'Choose a different destination.'; END IF;
  IF action='transfer' AND (a.kind NOT IN ('Cash','Deposit') OR b.kind NOT IN ('Cash','Deposit')) THEN RAISE EXCEPTION 'Transfer between cash and deposit balances.'; END IF;
  IF action='buy' AND (a.kind NOT IN ('Cash','Crypto') OR NOT b_units) THEN RAISE EXCEPTION 'Choose cash or crypto to buy a holding.'; END IF;
  IF action='sell' AND (NOT a_units OR b.kind NOT IN ('Cash','Crypto')) THEN RAISE EXCEPTION 'Choose cash or crypto for the sale proceeds.'; END IF;
  IF (NOT a_units AND av<>sent) OR (NOT b_units AND bv<>received) THEN RAISE EXCEPTION 'Check the settlement amounts.'; END IF;
  IF action='transfer' AND fee>=sent THEN RAISE EXCEPTION 'The transfer fee must be less than the amount sent.'; END IF;
  IF action='buy' AND fee>bv THEN RAISE EXCEPTION 'The purchase fee cannot exceed its total cost.'; END IF;
  IF action='transfer' AND a.currency=b.currency AND sent<>received+fee THEN RAISE EXCEPTION 'The amount received plus fee must equal the amount sent.'; END IF;
  IF action IN ('buy','sell') AND a.currency=b.currency AND av<>bv THEN RAISE EXCEPTION 'Use the same net trade value in both holdings.'; END IF;
 END IF;
 -- New operations must follow recorded balance changes: never overwrite later history.
 SELECT max(occurred_on) INTO last_day FROM public.investment_history WHERE record_id IN(aid,bid) AND balance IS NOT NULL;
 IF day<last_day THEN RAISE EXCEPTION 'Choose a date on or after the latest balance update.'; END IF;
 ab:=CASE WHEN a_units THEN a.quantity ELSE a.amount END; bb:=CASE WHEN b_units THEN b.quantity ELSE b.amount END;
 IF sent>ab THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.'; END IF;
 aa:=ab-sent; ba:=bb+received;
 IF (a_units AND sent>1e12) OR (b_units AND ba>1e12) OR (NOT b_units AND ba>1e15) THEN RAISE EXCEPTION 'Check the movement fields.'; END IF;
 IF a_units THEN gain:=av-sent*a.cost; END IF;
 INSERT INTO public.asset_movements(id,user_id,kind,source_id,target_id,sent,received,source_value,target_value,fee,occurred_on,notes,source_before,source_after,target_before,target_after,realized_gain)
 VALUES(item,owner,action,aid,bid,sent,received,av,bv,fee,day,memo,ab,CASE WHEN action='interest' THEN ba ELSE aa END,bb,ba,gain);
 PERFORM set_config('finance.history_write','1',true);
 IF action<>'interest' THEN
  UPDATE public.finance_records SET quantity=CASE WHEN a_units THEN aa ELSE quantity END,amount=CASE WHEN a_units THEN amount ELSE aa END WHERE id=aid;
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
  VALUES(owner,aid,'withdrawal',day,av,CASE WHEN a_units THEN aa*a.amount ELSE aa END,memo);
 END IF;
 UPDATE public.finance_records SET quantity=CASE WHEN b_units THEN ba ELSE quantity END,
  amount=CASE WHEN b_units THEN CASE WHEN bb=0 THEN bv/received ELSE amount END ELSE ba END,
  cost=CASE WHEN b_units THEN (bb*cost+bv)/ba ELSE cost END WHERE id=bid;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
 VALUES(owner,bid,CASE WHEN action='interest' THEN 'income' ELSE 'contribution' END,day,bv,
 CASE WHEN b_units THEN ba*CASE WHEN bb=0 THEN bv/received ELSE b.amount END ELSE ba END,memo);
 PERFORM set_config('finance.history_write','0',true);
 IF fee>0 OR action='interest' THEN
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,movement_id)
  VALUES(gen_random_uuid(),owner,CASE WHEN action='interest' THEN b.name ELSE 'Transaction fee' END,CASE WHEN action='interest' THEN 'Other income' ELSE 'Other expense' END,
  CASE WHEN action='buy' THEN b.currency ELSE a.currency END,CASE WHEN action='interest' THEN received ELSE fee END,day,'Once',memo,item);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_asset_movement(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_asset_movement(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_movement_record() FROM PUBLIC,anon,authenticated;
-- Include the immutable movement ledger in consistent backups.
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_movements;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.export_finance_backup_before_movements();
 RETURN jsonb_set(result,'{tables,asset_movements}',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM public.asset_movements m WHERE m.user_id=auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Investment accumulation goals.
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

-- Multi-holding accumulation goals.
-- Multiple independently measured holdings in one accumulation goal.
BEGIN;
SET LOCAL lock_timeout = '500ms';
LOCK TABLE public.savings_goals IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.holding_accounts IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE public.savings_goals ADD COLUMN investment_targets jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.savings_goals SET investment_targets=jsonb_build_array(jsonb_build_object(
 'holding_account_id',holding_account_id,'asset_kind',asset_kind,'asset_symbol',asset_symbol,
 'target',target,'monthly_contribution',monthly_contribution)) WHERE kind='investment';

-- Keep the legacy first-target columns synchronized for older readers. The array
-- is authoritative; unlike coin/share units are never added into a scalar total.
CREATE FUNCTION public.validate_goal_investment_targets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE entry jsonb; normalized jsonb:='[]'; first_target jsonb; linked public.holding_accounts;
BEGIN
 IF NEW.kind<>'investment' THEN
  IF NEW.investment_targets<>'[]'::jsonb THEN RAISE EXCEPTION 'Check the investment targets.'; END IF;
  RETURN NEW;
 END IF;
 IF jsonb_typeof(NEW.investment_targets) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Check the investment targets.'; END IF;
 IF jsonb_array_length(NEW.investment_targets) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Check the investment targets.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.investment_targets) value GROUP BY (value->>'holding_account_id')::uuid,value->>'asset_symbol' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'This holding is already included for this account.';
 END IF;
 -- Hold account references against concurrent deletion or changes of ownership/type.
 PERFORM h.id FROM public.holding_accounts h WHERE h.id IN (SELECT (value->>'holding_account_id')::uuid FROM jsonb_array_elements(NEW.investment_targets)) ORDER BY h.id FOR SHARE;
 FOR entry IN SELECT value FROM jsonb_array_elements(NEW.investment_targets) LOOP
  IF (jsonb_typeof(entry)='object' AND entry->>'asset_kind' IN ('Stock','Crypto')
    AND jsonb_typeof(entry->'asset_symbol')='string' AND entry->>'asset_symbol' ~ '^[A-Z][A-Z0-9.-]{0,14}$'
    AND jsonb_typeof(entry->'target')='number' AND (entry->>'target')::numeric>0 AND (entry->>'target')::numeric<=1e12
    AND (entry->'monthly_contribution' IS NULL OR entry->'monthly_contribution'='null'::jsonb OR
     (jsonb_typeof(entry->'monthly_contribution')='number' AND (entry->>'monthly_contribution')::numeric BETWEEN 0 AND 1e12))) IS NOT TRUE THEN
   RAISE EXCEPTION 'Check the investment targets.';
  END IF;
  SELECT * INTO linked FROM public.holding_accounts WHERE id=(entry->>'holding_account_id')::uuid AND user_id=NEW.user_id AND kind=entry->>'asset_kind';
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your matching stock or crypto accounts.'; END IF;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('holding_account_id',linked.id,'asset_kind',linked.kind,
   'asset_symbol',entry->>'asset_symbol','target',(entry->>'target')::numeric,'monthly_contribution',(entry->>'monthly_contribution')::numeric));
 END LOOP;
 NEW.investment_targets:=normalized;
 first_target:=normalized->0;
 NEW.holding_account_id:=(first_target->>'holding_account_id')::uuid;
 NEW.asset_kind:=first_target->>'asset_kind';NEW.asset_symbol:=first_target->>'asset_symbol';
 NEW.target:=(first_target->>'target')::numeric;NEW.monthly_contribution:=(first_target->>'monthly_contribution')::numeric;
 SELECT currency INTO NEW.currency FROM public.holding_accounts WHERE id=NEW.holding_account_id;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_goal_investment_targets BEFORE INSERT OR UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION public.validate_goal_investment_targets();
CREATE FUNCTION public.guard_goal_target_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id=OLD.id AND NEW.user_id=OLD.user_id AND NEW.kind=OLD.kind THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.savings_goals WHERE investment_targets @> jsonb_build_array(jsonb_build_object('holding_account_id',OLD.id))) THEN
  RAISE EXCEPTION 'Update the investment goals before removing or changing this account.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_goal_target_account BEFORE UPDATE OR DELETE ON public.holding_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_goal_target_account();
REVOKE ALL ON FUNCTION public.validate_goal_investment_targets(),public.guard_goal_target_account() FROM PUBLIC,anon,authenticated;
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
-- A distinct entry point makes an outdated database fail before writing, rather
-- than allowing the old RPC to silently discard additional targets.
CREATE FUNCTION public.planning_investment_goal(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF p_data->>'kind' IS DISTINCT FROM 'investment' OR jsonb_typeof(p_data->'investment_targets') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Check the investment targets.';
 END IF;
 RETURN public.planning_action('goal',p_data);
END $$;
REVOKE ALL ON FUNCTION public.planning_investment_goal(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.planning_investment_goal(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

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

-- Link borrowing and principal repayments to their actual cash account.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_investment_with_account(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r public.finance_records; prior public.investment_account_links; result jsonb; delta numeric; lending boolean; last_day date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 PERFORM id FROM public.finance_records WHERE id IN(p_account,p_record_id) AND user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=auth.uid() AND kind='Cash';
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid()
  AND kind IN ('Stock','Crypto','Deposit','Property','Business','Debt','Loan','Money lent','Mortgage');
 IF a.id IS NULL OR r.id IS NULL OR a.currency<>r.currency OR p_type='valuation' THEN RAISE EXCEPTION 'Choose a cash account in the record currency.'; END IF;
 lending:=r.kind IN ('Debt','Loan','Money lent','Mortgage');
 delta:=CASE
  WHEN r.kind IN ('Debt','Loan','Mortgage') THEN CASE WHEN p_type='contribution' THEN p_amount ELSE -p_amount END
  WHEN p_type IN ('income','withdrawal') THEN p_amount ELSE -p_amount END;
 SELECT * INTO prior FROM public.investment_account_links WHERE id=p_id;
 IF FOUND THEN
  IF prior.user_id<>auth.uid() OR prior.account_id<>p_account OR prior.amount<>delta THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  -- Check all original event details before returning. Do not reapply either balance.
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
 result:=public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 IF lending THEN PERFORM set_config('finance.history_write','1',true); END IF;
 UPDATE public.finance_records SET amount=amount+delta WHERE id=p_account;
 IF lending THEN
  PERFORM set_config('finance.history_write','0',true);
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
  VALUES(auth.uid(),a.id,CASE WHEN delta<0 THEN 'withdrawal' ELSE 'contribution' END,p_date,abs(delta),a.amount+delta,p_notes);
 END IF;
 INSERT INTO public.investment_account_links(id,user_id,account_id,amount) VALUES(p_id,auth.uid(),p_account,delta);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Keep the borrowing/start date separate from the existing due date.
-- Existing unknown dates and recorded history are intentionally not backfilled.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_opening_balance_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.opened_on IS NOT NULL AND (NEW.kind NOT IN ('Cash','Deposit','Stock','Crypto','Debt','Loan','Mortgage') OR NEW.opened_on>(now() AT TIME ZONE 'Asia/Tashkent')::date) THEN
  RAISE EXCEPTION 'Check the opening balance date.';
 END IF;
 IF NEW.kind IN ('Debt','Loan','Mortgage') AND NEW.opened_on IS NOT NULL AND NEW.date<NEW.opened_on THEN
  RAISE EXCEPTION 'Check the start and due dates.';
 END IF;
 IF TG_OP='UPDATE' AND NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN
  IF OLD.kind IN ('Debt','Loan','Mortgage') THEN RAISE EXCEPTION 'The start date cannot change after creation.'; END IF;
  RAISE EXCEPTION 'The opening balance date cannot change after creation.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER guard_opening_balance_date ON public.finance_records;
CREATE TRIGGER guard_opening_balance_date BEFORE INSERT OR UPDATE OF opened_on,date,kind ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.guard_opening_balance_date();
-- capture_investment_balance (025) already dates the opening snapshot with
-- opened_on, falling back to today only for records without a known start date.
CREATE FUNCTION public.guard_mortgage_start_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.paid_on<(SELECT opened_on FROM public.finance_records WHERE id=NEW.mortgage_id) THEN
  RAISE EXCEPTION 'Payment date cannot precede the start date.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_mortgage_start_date BEFORE INSERT ON public.mortgage_payments
 FOR EACH ROW EXECUTE FUNCTION public.guard_mortgage_start_date();
REVOKE ALL ON FUNCTION public.guard_mortgage_start_date() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

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

-- An automatic opening snapshot is not a user-recorded transaction. Archive it
-- with an otherwise unused record, so restoring retains the exact original date.
BEGIN;
ALTER TABLE public.deleted_items ADD COLUMN history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array');
CREATE OR REPLACE FUNCTION public.archive_deleted_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshots jsonb:='[]'::jsonb;
BEGIN
 IF OLD.user_id=auth.uid() AND EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
  IF TG_TABLE_NAME='finance_records' THEN
   IF EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=OLD.id AND event_type<>'baseline') THEN
    RAISE EXCEPTION 'This record has saved tracker updates or transactions and cannot be deleted.';
   END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at,h.id),'[]'::jsonb) INTO snapshots
    FROM public.investment_history h WHERE record_id=OLD.id AND user_id=auth.uid();
   DELETE FROM public.investment_history WHERE record_id=OLD.id AND user_id=auth.uid() AND event_type='baseline';
  END IF;
  INSERT INTO public.deleted_items(user_id,source,data,history) VALUES(OLD.user_id,TG_TABLE_NAME,to_jsonb(OLD),snapshots);
 END IF;
 RETURN OLD;
END $$;
-- Before deletion is necessary to move the snapshot out of the restrictive FK.
-- Any other relationship/transaction guard failure rolls the whole archive back.
DROP TRIGGER archive_deleted_record ON public.finance_records;
CREATE TRIGGER archive_deleted_record BEFORE DELETE ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_item();
CREATE OR REPLACE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_write text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' THEN
  previous_write:=coalesce(current_setting('finance.history_write',true),'0');
  IF jsonb_array_length(item.history)>0 THEN PERFORM set_config('finance.history_write','1',true); END IF;
  INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,item.data || jsonb_build_object('user_id',auth.uid()))).*;
  IF jsonb_array_length(item.history)>0 THEN
   INSERT INTO public.investment_history SELECT * FROM jsonb_populate_recordset(NULL::public.investment_history,item.history);
   PERFORM set_config('finance.history_write',previous_write,true);
  END IF;
 ELSE
  INSERT INTO public.expense_plans SELECT (jsonb_populate_record(NULL::public.expense_plans,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 END IF;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Convert linked income and expense amounts using the saved dated rate.
BEGIN;
ALTER TABLE public.finance_records
 ADD COLUMN account_exchange_rate numeric CHECK(account_exchange_rate>0 AND account_exchange_rate<=1e15 AND account_exchange_rate::text NOT IN ('NaN','Infinity','-Infinity')),
 ADD COLUMN account_rate_date date,
 ADD COLUMN account_currency text;
CREATE OR REPLACE FUNCTION public.apply_account_cashflow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; old_delta numeric:=0; new_delta numeric:=0; ids uuid[]; item uuid;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.account_id IS NOT NULL THEN
  old_delta:=CASE WHEN OLD.kind IN ('Salary','Rent income','Other income') THEN OLD.amount ELSE -OLD.amount END / coalesce(OLD.account_exchange_rate,1);
  ids:=array_append(ids,OLD.account_id);
 END IF;
 IF TG_OP<>'DELETE' AND NEW.account_id IS NOT NULL THEN
  IF NEW.frequency<>'Once' OR NEW.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') OR NEW.date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Only actual income and expenses can update an account.'; END IF;
  new_delta:=CASE WHEN NEW.kind IN ('Salary','Rent income','Other income') THEN NEW.amount ELSE -NEW.amount END / coalesce(NEW.account_exchange_rate,1);
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
   IF r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
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
CREATE FUNCTION public.record_repayment_with_fx(p_data jsonb,p_rate numeric,p_rate_date date,p_account_currency text,p_record_currency text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r public.finance_records; prior public.account_activity; result jsonb;
 item uuid:=(p_data->>'id')::uuid; principal numeric:=(p_data->>'amount')::numeric; interest numeric:=coalesce((p_data->>'fee')::numeric,0);
 day date:=(p_data->>'date')::date; memo text:=coalesce(p_data->>'notes','');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 PERFORM id FROM public.finance_records WHERE id IN((p_data->>'account_id')::uuid,(p_data->>'target_id')::uuid) AND user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=(p_data->>'account_id')::uuid AND user_id=auth.uid() AND kind='Cash';
 SELECT * INTO r FROM public.finance_records WHERE id=(p_data->>'target_id')::uuid AND user_id=auth.uid() AND kind IN('Money lent','Loan','Debt');
 IF a.id IS NULL OR r.id IS NULL OR principal IS NULL OR principal<=0 OR interest<0 OR interest>1e15 OR interest::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 SELECT * INTO prior FROM public.account_activity WHERE id=item;
 IF FOUND AND (prior.user_id<>auth.uid() OR prior.action<>'repayment' OR prior.account_id<>a.id OR prior.target_id<>r.id OR prior.amount<>principal/p_rate OR prior.fee<>interest/p_rate OR prior.occurred_on<>day OR prior.notes<>memo) THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
 IF prior.id IS NULL AND EXISTS(SELECT 1 FROM public.investment_history WHERE id=item) THEN RAISE EXCEPTION 'This update was already saved without an account.'; END IF;
 result:=public.record_investment_with_fx(item,r.id,'withdrawal',day,principal,NULL,memo,a.id,p_rate,p_rate_date,p_account_currency,p_record_currency);
 IF prior.id IS NOT NULL THEN RETURN result; END IF;
 IF interest>0 THEN
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,operation_id)
  VALUES(gen_random_uuid(),auth.uid(),r.name,CASE WHEN r.kind='Money lent' THEN 'Other income' ELSE 'Other expense' END,a.currency,interest/p_rate,day,'Once',memo,a.id,item);
 END IF;
 INSERT INTO public.account_activity(id,user_id,action,account_id,target_id,amount,received,fee,occurred_on,notes,before_balance,after_balance)
 SELECT item,auth.uid(),'repayment',a.id,r.id,principal/p_rate,0,interest/p_rate,day,memo,a.amount,amount FROM public.finance_records WHERE id=a.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_repayment_with_fx(jsonb,numeric,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_repayment_with_fx(jsonb,numeric,date,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
