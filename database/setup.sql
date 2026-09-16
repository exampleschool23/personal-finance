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
