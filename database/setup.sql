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
 currencies text[] NOT NULL DEFAULT ARRAY['USD','UZS'] CHECK (cardinality(currencies) >= 1 AND currencies <@ ARRAY['AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG']::text[]),
 CONSTRAINT user_preferences_currencies_limit CHECK (cardinality(currencies) <= 2)
);
-- Optional personal name; existing owner policies protect this field.
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80);
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
BEGIN;
CREATE TABLE public.category_rules (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 pattern text NOT NULL CHECK(length(trim(pattern)) BETWEEN 1 AND 120),
 direction text NOT NULL CHECK(direction IN ('income','expense','all')),
 category_id uuid NOT NULL, priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 1000), enabled boolean NOT NULL DEFAULT true,
 FOREIGN KEY(category_id,user_id) REFERENCES public.custom_categories(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.transaction_splits (
 record_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 49), category_id uuid NOT NULL,
 amount numeric NOT NULL CHECK(amount>0 AND amount<=1e15),
 PRIMARY KEY(record_id,position),
 FOREIGN KEY(user_id,record_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(category_id,user_id) REFERENCES public.custom_categories(id,user_id)
);
CREATE TABLE public.forecast_assignments (
 record_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, account_id uuid NOT NULL,
 FOREIGN KEY(user_id,record_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,account_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE
);
CREATE INDEX category_rules_owner_priority ON public.category_rules(user_id,priority,id);
CREATE INDEX transaction_splits_owner_record ON public.transaction_splits(user_id,record_id,position);
CREATE INDEX forecast_assignments_owner_record ON public.forecast_assignments(user_id,record_id);
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_rules ON public.category_rules FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY owner_splits ON public.transaction_splits FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY owner_forecasts ON public.forecast_assignments FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.category_rules TO authenticated;
GRANT SELECT ON public.transaction_splits,public.forecast_assignments TO authenticated;

-- One classifier serves manual entry, scheduled receipts and bank imports.
CREATE FUNCTION public.classify_new_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT. BEFORE INSERT also runs
 -- for existing rows, so edits must not reclassify historical transactions.
 IF EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 IF coalesce(current_setting('finance.restore_transaction',true),'0')<>'1' AND NEW.custom_category_id IS NULL AND NEW.frequency='Once' AND NEW.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') THEN
  SELECT category_id INTO NEW.custom_category_id FROM public.category_rules
  WHERE user_id=NEW.user_id AND enabled AND strpos(lower(NEW.name),lower(trim(pattern)))>0
   AND (direction='all' OR direction=CASE WHEN NEW.kind IN ('Salary','Rent income','Other income') THEN 'income' ELSE 'expense' END)
  ORDER BY priority,id LIMIT 1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER classify_transaction BEFORE INSERT ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.classify_new_transaction();

CREATE FUNCTION public.save_transaction_splits(p_record uuid,p_splits jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records; part jsonb; n integer:=0; total numeric:=0;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.movement_id IS NOT NULL OR r.operation_id IS NOT NULL OR r.mortgage_payment_id IS NOT NULL OR r.history_event_id IS NOT NULL OR r.frequency<>'Once' OR r.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose an actual transaction.'; END IF;
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
-- A split must not silently become inconsistent after a parent transaction edit.
CREATE FUNCTION public.protect_split_total() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.amount,NEW.currency,NEW.kind,NEW.frequency) IS DISTINCT FROM (OLD.amount,OLD.currency,OLD.kind,OLD.frequency) AND EXISTS(SELECT 1 FROM public.transaction_splits WHERE record_id=OLD.id) THEN RAISE EXCEPTION 'Clear the split before changing the transaction amount or type.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_split_total BEFORE UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.protect_split_total();
CREATE FUNCTION public.save_forecast_assignment(p_record uuid,p_account uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.frequency='Once' OR r.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose a recurring schedule.'; END IF;
 IF p_account IS NULL THEN DELETE FROM public.forecast_assignments WHERE record_id=p_record AND user_id=owner;
 ELSE
  PERFORM 1 FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash' AND currency=r.currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a cash account in the schedule currency.'; END IF;
  INSERT INTO public.forecast_assignments(record_id,user_id,account_id) VALUES(p_record,owner,p_account) ON CONFLICT(record_id) DO UPDATE SET account_id=EXCLUDED.account_id;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.save_transaction_splits(uuid,jsonb),public.save_forecast_assignment(uuid,uuid),public.classify_new_transaction(),public.protect_split_total() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_transaction_splits(uuid,jsonb),public.save_forecast_assignment(uuid,uuid) TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_transaction_tools;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.export_finance_backup_before_transaction_tools();
 result:=jsonb_set(result,'{tables,category_rules}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.category_rules r));
 result:=jsonb_set(result,'{tables,transaction_splits}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.transaction_splits r));
 result:=jsonb_set(result,'{tables,forecast_assignments}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.forecast_assignments r));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;

-- Preserve category allocations when a transaction is moved to Recently deleted.
ALTER TABLE public.deleted_items ADD COLUMN splits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(splits)='array');
CREATE FUNCTION public.archive_transaction_splits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.user_id=auth.uid() THEN
  UPDATE public.deleted_items SET splits=(SELECT coalesce(jsonb_agg(jsonb_build_object('category_id',category_id,'amount',amount) ORDER BY position),'[]'::jsonb) FROM public.transaction_splits WHERE record_id=OLD.id AND user_id=OLD.user_id)
  WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=OLD.user_id AND source='finance_records' AND data->>'id'=OLD.id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 END IF;
 RETURN OLD;
END $$;
-- Trigger names are ordered: archive_deleted_record creates the archive first.
CREATE TRIGGER archive_transaction_splits BEFORE DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.archive_transaction_splits();
ALTER FUNCTION public.restore_deleted_item(uuid) RENAME TO restore_deleted_item_before_transaction_tools;
CREATE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_restore text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.restore_transaction','1',true);
 PERFORM public.restore_deleted_item_before_transaction_tools(p_id);
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 IF item.source='finance_records' AND jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;
END $$;
REVOKE ALL ON FUNCTION public.archive_transaction_splits(),public.restore_deleted_item(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.restore_deleted_item_before_transaction_tools(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
-- Shared goal funding settings and an allocation audit trail. No cash moves.
BEGIN;
ALTER TABLE public.savings_goals ADD COLUMN funding_priority integer NOT NULL DEFAULT 100 CHECK(funding_priority BETWEEN 0 AND 10000),
 ADD COLUMN funding_monthly numeric CHECK(funding_monthly BETWEEN 0 AND 1e15),
 ADD COLUMN funding_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN paused_until date,
 ADD COLUMN completed_on date,
 ADD COLUMN funding_mode text NOT NULL DEFAULT 'one_time' CHECK(funding_mode IN ('one_time','refill'));
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_id_owner_unique UNIQUE(id,user_id);
CREATE TABLE public.goal_operations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.goal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL, operation_id uuid REFERENCES public.goal_operations(id),
 occurred_on date NOT NULL, delta numeric NOT NULL, balance numeric NOT NULL CHECK(balance>=0),
 event_type text NOT NULL CHECK(event_type IN ('opening','adjustment','contribution','withdrawal','transfer')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 source_id uuid REFERENCES public.finance_records(id) ON DELETE SET NULL,
 source_name text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(goal_id,user_id) REFERENCES public.savings_goals(id,user_id) ON DELETE CASCADE
);
CREATE INDEX goal_events_owner_date ON public.goal_events(user_id,occurred_on DESC,created_at DESC,id);
CREATE INDEX goal_operations_owner ON public.goal_operations(user_id);
ALTER TABLE public.goal_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.goal_operations FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY owner_read ON public.goal_events FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.goal_operations,public.goal_events TO authenticated;
INSERT INTO public.goal_events(user_id,goal_id,occurred_on,delta,balance,event_type,notes)
 SELECT user_id,id,(now() AT TIME ZONE 'Asia/Tashkent')::date,allocated,allocated,'opening','Opening allocation; earlier contribution dates are unknown.' FROM public.savings_goals WHERE kind='savings';
CREATE FUNCTION public.mark_goal_complete() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.kind='savings' AND NEW.allocated>=NEW.target THEN NEW.completed_on:=coalesce(NEW.completed_on,(now() AT TIME ZONE 'Asia/Tashkent')::date);
 ELSIF TG_OP='UPDATE' AND NEW.target>OLD.target THEN NEW.completed_on:=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mark_goal_complete BEFORE INSERT OR UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION public.mark_goal_complete();
UPDATE public.savings_goals SET completed_on=(now() AT TIME ZONE 'Asia/Tashkent')::date WHERE kind='savings' AND allocated>=target;
REVOKE ALL ON FUNCTION public.mark_goal_complete() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.audit_goal_allocation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE context jsonb:=coalesce(nullif(current_setting('finance.goal_event',true),''),'{}')::jsonb; difference numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.kind,NEW.account_id,NEW.currency) IS DISTINCT FROM (OLD.kind,OLD.account_id,OLD.currency)
  AND EXISTS(SELECT 1 FROM public.goal_events WHERE goal_id=OLD.id) THEN RAISE EXCEPTION 'Archive this goal and create another to change its account, currency or type.'; END IF;
 IF NEW.kind<>'savings' THEN RETURN NEW; END IF;
 difference:=NEW.allocated-CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.allocated END;
 IF TG_OP='INSERT' OR difference<>0 THEN
 INSERT INTO public.goal_events(user_id,goal_id,operation_id,occurred_on,delta,balance,event_type,notes,source_id,source_name)
 VALUES(NEW.user_id,NEW.id,(context->>'operation_id')::uuid,coalesce((context->>'date')::date,(now() AT TIME ZONE 'Asia/Tashkent')::date),difference,NEW.allocated,
 coalesce(context->>'type',CASE WHEN TG_OP='INSERT' THEN 'opening' ELSE 'adjustment' END),coalesce(context->>'notes',''),(context->>'source_id')::uuid,context->>'source_name');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_goal_allocation AFTER INSERT OR UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION public.audit_goal_allocation();
CREATE FUNCTION public.configure_goal_funding(p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 UPDATE public.savings_goals SET funding_priority=(p_data->>'priority')::integer,funding_monthly=(p_data->>'monthly')::numeric,
 funding_enabled=(p_data->>'enabled')::boolean,paused_until=(p_data->>'paused_until')::date,funding_mode=p_data->>'mode'
 WHERE id=(p_data->>'goal_id')::uuid AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found.'; END IF;
END $$;
CREATE FUNCTION public.record_goal_activity(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 IF NOT FOUND OR action<>'contribution' OR source.kind NOT IN ('Salary','Rent income','Other income') THEN RAISE EXCEPTION 'Choose an income transaction from the goal account.'; END IF;
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
REVOKE ALL ON FUNCTION public.audit_goal_allocation(),public.configure_goal_funding(jsonb),public.record_goal_activity(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_goal_funding(jsonb),public.record_goal_activity(jsonb) TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_goal_activity;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb:=public.export_finance_backup_before_goal_activity();
BEGIN
 result:=jsonb_set(result,'{tables,goal_events}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.goal_events r));
 result:=jsonb_set(result,'{tables,goal_operations}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.goal_operations r));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
BEGIN;
CREATE TABLE public.workspace_preferences (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 key text NOT NULL CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=65536),
 PRIMARY KEY(user_id,key)
);
ALTER TABLE public.workspace_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_preferences ON public.workspace_preferences FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_preferences TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_workspace_preferences;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb:=public.export_finance_backup_before_workspace_preferences();
BEGIN
 RETURN jsonb_set(result,'{tables,workspace_preferences}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.workspace_preferences r));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Import provenance and atomic undo for unchanged imported transactions.
BEGIN;
CREATE TABLE public.import_batches (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz,
 FOREIGN KEY(account_id,user_id) REFERENCES public.finance_records(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.import_batch_items (
 batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL, original jsonb NOT NULL, PRIMARY KEY(batch_id,record_id)
);
CREATE INDEX import_batches_owner ON public.import_batches(user_id,created_at DESC,id);
CREATE INDEX import_batch_items_owner ON public.import_batch_items(user_id,batch_id);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.import_batches FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY owner_read ON public.import_batch_items FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.import_batches,public.import_batch_items TO authenticated;
CREATE FUNCTION public.import_statement(p_batch uuid,p_account uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); previous public.import_batches; existing public.finance_records; r jsonb; before_ids uuid[]; result jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_batch IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Check the import fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO previous FROM public.import_batches WHERE id=p_batch;
 IF FOUND THEN
  IF previous.user_id<>owner OR previous.account_id<>p_account OR previous.payload<>p_rows THEN RAISE EXCEPTION 'This import identifier was used with different details.'; END IF;
  IF previous.undone_at IS NOT NULL THEN RAISE EXCEPTION 'This import was undone. Start a new import.'; END IF;
  RETURN previous.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash') THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) value GROUP BY value->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate source identifiers in this statement.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO before_ids FROM public.finance_records WHERE user_id=owner AND import_key IN (SELECT value->>'key' FROM jsonb_array_elements(p_rows));
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT * INTO existing FROM public.finance_records WHERE user_id=owner AND import_key=r->>'key' FOR UPDATE;
  IF FOUND AND (existing.account_id IS DISTINCT FROM p_account OR existing.amount<>abs((r->>'amount')::numeric) OR existing.date<>(r->>'date')::date OR existing.name<>r->>'name' OR existing.kind<>CASE WHEN (r->>'amount')::numeric>0 THEN 'Other income' ELSE 'Other expense' END) THEN RAISE EXCEPTION 'An imported transaction with this source identifier has different details. Review it before importing.'; END IF;
 END LOOP;
 result:=public.import_account_transactions(p_account,p_rows);
 INSERT INTO public.import_batches(id,user_id,account_id,payload,result) VALUES(p_batch,owner,p_account,p_rows,result);
 INSERT INTO public.import_batch_items(batch_id,user_id,record_id,original)
 SELECT p_batch,owner,id,to_jsonb(f) FROM public.finance_records f WHERE user_id=owner AND NOT(id=ANY(before_ids)) AND import_key IN (SELECT value->>'key' FROM jsonb_array_elements(p_rows));
 RETURN result;
END $$;
CREATE FUNCTION public.undo_statement_import(p_batch uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); batch public.import_batches; item public.import_batch_items; current_record jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO batch FROM public.import_batches WHERE id=p_batch AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found.'; END IF;
 IF batch.undone_at IS NOT NULL THEN RETURN; END IF;
 -- Lock and check everything before deleting anything. Later edits must be reviewed.
 FOR item IN SELECT * FROM public.import_batch_items WHERE batch_id=p_batch AND user_id=owner ORDER BY record_id LOOP
  SELECT to_jsonb(f) INTO current_record FROM public.finance_records f WHERE id=item.record_id AND user_id=owner FOR UPDATE;
  IF NOT FOUND OR current_record<>item.original OR EXISTS(SELECT 1 FROM public.transaction_splits WHERE record_id=item.record_id) OR EXISTS(SELECT 1 FROM public.goal_events WHERE source_id=item.record_id) THEN RAISE EXCEPTION 'An imported transaction has changed or is linked to a goal. Review these records individually.'; END IF;
 END LOOP;
 -- Remove outflows first so undoing a balanced batch does not transiently overdraw.
 FOR item IN SELECT * FROM public.import_batch_items WHERE batch_id=p_batch AND user_id=owner ORDER BY CASE WHEN original->>'kind'='Other expense' THEN 0 ELSE 1 END,record_id LOOP
  DELETE FROM public.finance_records WHERE id=item.record_id AND user_id=owner;
 END LOOP;
 UPDATE public.import_batches SET undone_at=now() WHERE id=p_batch;
END $$;
REVOKE ALL ON FUNCTION public.import_statement(uuid,uuid,jsonb),public.undo_statement_import(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_statement(uuid,uuid,jsonb),public.undo_statement_import(uuid) TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_import_review;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb:=public.export_finance_backup_before_import_review();
BEGIN
 result:=jsonb_set(result,'{tables,import_batches}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.import_batches r));
 RETURN jsonb_set(result,'{tables,import_batch_items}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.import_batch_items r));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Financial invariants still apply to ordinary record deletion. During the
-- administrator's auth.users cascade the owner is already gone, so there is no
-- surviving balance to reverse and immutable child rows must be removable.
BEGIN;
DO $$
DECLARE function_name text; definition text; insertion integer;
BEGIN
 FOREACH function_name IN ARRAY ARRAY['apply_account_cashflow','guard_operation_record','guard_movement_record','guard_mortgage_payment_record','guard_investment_history_record','guard_goal_target_account'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=function_name AND p.pronargs=0 AND p.prosecdef;
  IF definition IS NULL THEN RAISE EXCEPTION 'Expected security-definer trigger missing: %',function_name; END IF;
  insertion:=strpos(definition,E'\nBEGIN\n');
  IF insertion=0 THEN RAISE EXCEPTION 'Unexpected trigger definition: %',function_name; END IF;
  definition:=overlay(definition PLACING E'\nBEGIN\n IF TG_OP=''DELETE'' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;\n' FROM insertion FOR length(E'\nBEGIN\n'));
  EXECUTE definition;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
-- Display order uses the existing owner-scoped preference storage and backup.
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check
 CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order'));
COMMIT;

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
-- Turn income-producing property/business estimates into usable payment plans.
BEGIN;
CREATE FUNCTION public.ensure_asset_income_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source_id uuid:=gen_random_uuid(); schedule uuid:=gen_random_uuid(); previous_write text;
BEGIN
 IF NEW.kind NOT IN ('Property','Business') OR coalesce(NEW.estimated_monthly_income,0)<=0 THEN RETURN NEW; END IF;
 -- Serialize with save_income_source, including concurrent asset edits.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 IF EXISTS(SELECT 1 FROM public.income_sources WHERE user_id=NEW.user_id AND linked_record_id=NEW.id) THEN RETURN NEW; END IF;
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 PERFORM set_config('finance.income_source_write','1',true);
 INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,business_id,income_source_id)
 VALUES(schedule,NEW.user_id,NEW.name,CASE WHEN NEW.kind='Property' THEN 'Rent income' ELSE 'Business income' END,NEW.currency,NEW.estimated_monthly_income,NEW.date,'Monthly',CASE WHEN NEW.kind='Business' THEN NEW.id END,CASE WHEN NEW.kind='Property' THEN NEW.id END);
 INSERT INTO public.income_sources(id,user_id,name,kind,currency,mode,amount,frequency,start_date,linked_record_id,schedule_id)
 VALUES(source_id,NEW.user_id,NEW.name,CASE WHEN NEW.kind='Property' THEN 'Rent income' ELSE 'Business income' END,NEW.currency,'fixed',NEW.estimated_monthly_income,'Monthly',NEW.date,NEW.id,schedule);
 PERFORM set_config('finance.income_source_write',previous_write,true);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ensure_asset_income_plan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ensure_asset_income_plan AFTER INSERT OR UPDATE OF estimated_monthly_income ON public.finance_records
FOR EACH ROW EXECUTE FUNCTION public.ensure_asset_income_plan();
-- Backfill using inserts directly: historical assets must not be updated or revalued.
DO $$
DECLARE asset public.finance_records; schedule uuid;
BEGIN
 FOR asset IN SELECT r.* FROM public.finance_records r WHERE r.kind IN ('Property','Business') AND r.estimated_monthly_income>0
 AND NOT EXISTS(SELECT 1 FROM public.income_sources s WHERE s.user_id=r.user_id AND s.linked_record_id=r.id)
 LOOP
  schedule:=gen_random_uuid();
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,business_id,income_source_id)
  VALUES(schedule,asset.user_id,asset.name,CASE WHEN asset.kind='Property' THEN 'Rent income' ELSE 'Business income' END,asset.currency,asset.estimated_monthly_income,asset.date,'Monthly',CASE WHEN asset.kind='Business' THEN asset.id END,CASE WHEN asset.kind='Property' THEN asset.id END);
  INSERT INTO public.income_sources(id,user_id,name,kind,currency,mode,amount,frequency,start_date,linked_record_id,schedule_id)
  VALUES(gen_random_uuid(),asset.user_id,asset.name,CASE WHEN asset.kind='Property' THEN 'Rent income' ELSE 'Business income' END,asset.currency,'fixed',asset.estimated_monthly_income,'Monthly',asset.date,asset.id,schedule);
 END LOOP;
END $$;
COMMIT;
BEGIN;
ALTER TABLE public.forecast_assignments ADD COLUMN exchange_rate numeric CHECK(exchange_rate>0 AND exchange_rate<=1e15), ADD COLUMN from_currency text, ADD COLUMN to_currency text;
DROP FUNCTION public.save_forecast_assignment(uuid,uuid);
CREATE FUNCTION public.save_forecast_assignment(p_record uuid,p_account uuid,p_rate numeric DEFAULT NULL,p_from text DEFAULT NULL,p_to text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records; a public.finance_records;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.frequency='Once' OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose a recurring schedule.'; END IF;
 IF p_account IS NULL THEN DELETE FROM public.forecast_assignments WHERE record_id=p_record AND user_id=owner;
 ELSE
  SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a cash account.'; END IF;
  IF a.currency<>r.currency AND (p_rate IS NULL OR p_rate<=0 OR p_rate>1e15 OR p_rate='NaN'::numeric OR p_from IS DISTINCT FROM r.currency OR p_to IS DISTINCT FROM a.currency) THEN RAISE EXCEPTION 'A positive exchange rate is required.'; END IF;
  INSERT INTO public.forecast_assignments(record_id,user_id,account_id,exchange_rate,from_currency,to_currency)
  VALUES(p_record,owner,p_account,CASE WHEN a.currency=r.currency THEN 1 ELSE p_rate END,r.currency,a.currency)
  ON CONFLICT(record_id) DO UPDATE SET account_id=EXCLUDED.account_id,exchange_rate=EXCLUDED.exchange_rate,from_currency=EXCLUDED.from_currency,to_currency=EXCLUDED.to_currency;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.save_forecast_assignment(uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_forecast_assignment(uuid,uuid,numeric,text,text) TO authenticated;
COMMIT;

-- Record scheduled payments using the actual entered amount.
CREATE OR REPLACE FUNCTION public.planning_action_with_actual_amount(p_action text,p_data jsonb) RETURNS jsonb
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
   IF amount IS NULL OR amount<=0 OR amount>1e15 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
   new_id:=item;
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id,account_exchange_rate,account_rate_date,account_currency)
   VALUES(new_id,owner,r.name,r.kind,r.currency,amount,day,'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency');
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
REVOKE ALL ON FUNCTION public.planning_action_with_actual_amount(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.planning_action_with_actual_amount(text,jsonb) TO authenticated;

-- Keep linked fixed-income schedules aligned when the asset record date is saved.
CREATE OR REPLACE FUNCTION public.sync_asset_income_schedule_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.income_sources; previous_write text;
BEGIN
 IF NEW.kind NOT IN ('Business','Property') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 FOR source IN SELECT * FROM public.income_sources WHERE user_id=NEW.user_id AND linked_record_id=NEW.id AND mode='fixed' AND NOT archived AND (start_date IS DISTINCT FROM NEW.date OR EXISTS (SELECT 1 FROM public.finance_records schedule WHERE schedule.id=income_sources.schedule_id AND schedule.user_id=NEW.user_id AND schedule.date IS DISTINCT FROM NEW.date)) FOR UPDATE LOOP
  IF source.end_date IS NOT NULL AND source.end_date<NEW.date THEN
   RAISE EXCEPTION 'The income plan ends before this record date. Update its end date in Income sources first.';
  END IF;
  PERFORM set_config('finance.income_source_write','1',true);
  UPDATE public.finance_records SET date=NEW.date WHERE id=source.schedule_id AND user_id=NEW.user_id;
  UPDATE public.income_sources SET start_date=NEW.date WHERE id=source.id AND user_id=NEW.user_id;
 END LOOP;
 PERFORM set_config('finance.income_source_write',previous_write,true);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_asset_income_schedule_date() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_asset_income_schedule_date AFTER UPDATE OF date ON public.finance_records
FOR EACH ROW EXECUTE FUNCTION public.sync_asset_income_schedule_date();

-- Remove only the owner's recovery snapshot; active records and balances stay unchanged.
BEGIN;
CREATE FUNCTION public.permanently_delete_item(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 DELETE FROM public.deleted_items WHERE id=p_id AND user_id=owner;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.permanently_delete_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_item(uuid) TO authenticated;
COMMIT;
BEGIN;
-- Replace name-matching rules with explicitly selected income/expense categories.
DROP TRIGGER classify_transaction ON public.finance_records;
DROP FUNCTION public.classify_new_transaction();
DROP TABLE public.category_rules;
ALTER TABLE public.custom_categories RENAME TO transaction_categories;
ALTER TABLE public.transaction_categories ADD COLUMN direction text NOT NULL DEFAULT 'expense' CHECK(direction IN ('income','expense'));
ALTER TABLE public.transaction_categories DROP CONSTRAINT custom_categories_user_id_name_key;
CREATE UNIQUE INDEX transaction_categories_owner_direction_name ON public.transaction_categories(user_id,direction,name);

-- Retain IDs and assignments. Categories used in both directions get an income
-- copy; deleted transactions and their splits must remain restorable as well.
CREATE TEMP TABLE category_usage ON COMMIT DROP AS
 SELECT custom_category_id AS id,kind FROM public.finance_records WHERE custom_category_id IS NOT NULL
 UNION SELECT s.category_id,r.kind FROM public.transaction_splits s JOIN public.finance_records r ON r.id=s.record_id
 UNION SELECT (data->>'custom_category_id')::uuid,data->>'kind' FROM public.deleted_items WHERE source='finance_records' AND data->>'custom_category_id' IS NOT NULL
 UNION SELECT (part->>'category_id')::uuid,d.data->>'kind' FROM public.deleted_items d CROSS JOIN LATERAL jsonb_array_elements(d.splits) part WHERE d.source='finance_records';
UPDATE public.transaction_categories c SET direction='income'
 WHERE EXISTS(SELECT 1 FROM category_usage u WHERE u.id=c.id AND u.kind IN ('Salary','Rent income','Business income','Other income'))
 AND NOT EXISTS(SELECT 1 FROM category_usage u WHERE u.id=c.id AND u.kind NOT IN ('Salary','Rent income','Business income','Other income'));
CREATE TEMP TABLE income_category_copies ON COMMIT DROP AS
 SELECT id AS old_id,gen_random_uuid() AS new_id FROM public.transaction_categories c WHERE direction='expense'
 AND EXISTS(SELECT 1 FROM category_usage u WHERE u.id=c.id AND u.kind IN ('Salary','Rent income','Business income','Other income'));
INSERT INTO public.transaction_categories(id,user_id,name,direction)
 SELECT m.new_id,c.user_id,c.name,'income' FROM public.transaction_categories c JOIN income_category_copies m ON m.old_id=c.id;
UPDATE public.finance_records r SET custom_category_id=m.new_id FROM income_category_copies m
 WHERE r.custom_category_id=m.old_id AND r.kind IN ('Salary','Rent income','Business income','Other income');
UPDATE public.transaction_splits s SET category_id=m.new_id FROM income_category_copies m,public.finance_records r
 WHERE s.category_id=m.old_id AND s.record_id=r.id AND r.kind IN ('Salary','Rent income','Business income','Other income');
UPDATE public.deleted_items d SET data=jsonb_set(d.data,'{custom_category_id}',to_jsonb(m.new_id)) FROM income_category_copies m
 WHERE d.source='finance_records' AND d.data->>'custom_category_id'=m.old_id::text AND d.data->>'kind' IN ('Salary','Rent income','Business income','Other income');
UPDATE public.deleted_items d SET splits=(SELECT coalesce(jsonb_agg(CASE WHEN m.new_id IS NULL THEN part ELSE jsonb_set(part,'{category_id}',to_jsonb(m.new_id)) END ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(d.splits) WITH ORDINALITY p(part,ord) LEFT JOIN income_category_copies m ON m.old_id::text=part->>'category_id')
 WHERE d.source='finance_records' AND d.data->>'kind' IN ('Salary','Rent income','Business income','Other income');
ALTER TABLE public.transaction_categories ALTER COLUMN direction DROP DEFAULT;

-- Update all historical RPC wrappers still in service, including backup exports
-- and scheduled payments. Keep the record reference column for compatibility.
DO $$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f' AND (p.prosrc LIKE '%custom_categories%' OR p.prosrc LIKE '%tables,category_rules%') LOOP
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'custom_categories','transaction_categories');
  definition:=replace(definition,'transaction_categories(id,user_id,name) VALUES(item,owner,trim(p_data->>''name''))','transaction_categories(id,user_id,name,direction) VALUES(item,owner,trim(p_data->>''name''),p_data->>''direction'')');
  definition:=replace(definition,'ON CONFLICT(id) DO UPDATE SET name=excluded.name WHERE transaction_categories.user_id=owner','ON CONFLICT(id) DO UPDATE SET name=excluded.name,direction=excluded.direction WHERE transaction_categories.user_id=owner');
  definition:=replace(definition,'result:=jsonb_set(result,''{tables,category_rules}'',(SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]'') FROM public.category_rules r));','');
  EXECUTE definition;
 END LOOP;
END $$;

CREATE FUNCTION public.validate_transaction_category() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected text; category uuid; owner uuid;
BEGIN
 IF TG_TABLE_NAME='finance_records' THEN
  category:=NEW.custom_category_id;owner:=NEW.user_id;
  expected:=CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END;
 ELSE
  category:=NEW.category_id;owner:=NEW.user_id;
  SELECT CASE WHEN kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END INTO expected FROM public.finance_records WHERE id=NEW.record_id AND user_id=owner;
 END IF;
 IF category IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=category AND user_id=owner AND direction=expected) THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_transaction_category BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_category();
CREATE TRIGGER validate_split_category BEFORE INSERT OR UPDATE ON public.transaction_splits FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_category();
CREATE FUNCTION public.protect_category_direction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.direction IS DISTINCT FROM OLD.direction THEN RAISE EXCEPTION 'Category type cannot be changed.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_category_direction BEFORE UPDATE ON public.transaction_categories FOR EACH ROW EXECUTE FUNCTION public.protect_category_direction();
REVOKE ALL ON FUNCTION public.validate_transaction_category(),public.protect_category_direction() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
BEGIN;
CREATE FUNCTION public.category_usage(p_category uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); active_count integer; deleted_count integer; watch_count integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=p_category AND user_id=owner) THEN RAISE EXCEPTION 'Category not found.'; END IF;
 SELECT count(*) INTO active_count FROM public.finance_records r WHERE r.user_id=owner AND
  (r.custom_category_id=p_category OR EXISTS(SELECT 1 FROM public.transaction_splits s WHERE s.user_id=owner AND s.record_id=r.id AND s.category_id=p_category));
 SELECT count(*) INTO deleted_count FROM public.deleted_items d WHERE d.user_id=owner AND d.source='finance_records' AND
  (d.data->>'custom_category_id'=p_category::text OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.splits) part WHERE part->>'category_id'=p_category::text));
 SELECT count(*) INTO watch_count FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements(w.data->'items') item WHERE w.user_id=owner AND w.key='watchlists' AND item->>'category'=p_category::text;
 RETURN jsonb_build_object('records',active_count,'deleted',deleted_count,'watchlists',watch_count);
END $$;

-- Immutable generated transactions may change only their category label.
-- Their amounts, account links and every other stored value remain protected.
DO $$
DECLARE guard_name text; definition text;
BEGIN
 FOREACH guard_name IN ARRAY ARRAY['guard_mortgage_payment_record','guard_investment_history_record','guard_operation_record','guard_movement_record'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=guard_name AND p.pronargs=0;
  definition:=regexp_replace(definition,'BEGIN',E'BEGIN\n IF TG_OP=''UPDATE'' AND NEW.user_id=auth.uid() AND (to_jsonb(NEW)-''custom_category_id'')=(to_jsonb(OLD)-''custom_category_id'') THEN RETURN NEW; END IF;');
  EXECUTE definition;
 END LOOP;
END $$;

CREATE FUNCTION public.delete_transaction_category(p_category uuid,p_replacement uuid DEFAULT NULL,p_new_name text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); selected_category public.transaction_categories; target uuid:=p_replacement; usage jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 -- The category lock coordinates with FK checks on concurrent record inserts.
 SELECT * INTO selected_category FROM public.transaction_categories WHERE id=p_category AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Category not found.'; END IF;
 IF p_new_name IS NOT NULL THEN
  IF target IS NOT NULL OR length(trim(p_new_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Check the category name and type.'; END IF;
  target:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(target,owner,trim(p_new_name),selected_category.direction);
 END IF;
 IF target IS NOT NULL THEN
  IF target=p_category THEN RAISE EXCEPTION 'Choose a different category of the same type.'; END IF;
  PERFORM 1 FROM public.transaction_categories WHERE id=target AND user_id=owner AND direction=selected_category.direction FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a different category of the same type.'; END IF;
 END IF;
 usage:=public.category_usage(p_category);
 IF target IS NULL AND (usage->>'records')::integer+(usage->>'deleted')::integer+(usage->>'watchlists')::integer>0 THEN
  RAISE EXCEPTION 'This category is in use. Choose a replacement category.';
 END IF;
 IF target IS NOT NULL THEN
  -- Only category labels change: amounts, kinds, source links and dates stay put.
  UPDATE public.finance_records SET custom_category_id=target WHERE user_id=owner AND custom_category_id=p_category;
  UPDATE public.transaction_splits SET category_id=target WHERE user_id=owner AND category_id=p_category;
  UPDATE public.deleted_items SET data=jsonb_set(data,'{custom_category_id}',to_jsonb(target)) WHERE user_id=owner AND source='finance_records' AND data->>'custom_category_id'=p_category::text;
  UPDATE public.deleted_items d SET splits=(SELECT jsonb_agg(CASE WHEN part->>'category_id'=p_category::text THEN jsonb_set(part,'{category_id}',to_jsonb(target)) ELSE part END ORDER BY ord) FROM jsonb_array_elements(d.splits) WITH ORDINALITY p(part,ord))
   WHERE d.user_id=owner AND d.source='finance_records' AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.splits) part WHERE part->>'category_id'=p_category::text);
  UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN item->>'category'=p_category::text THEN jsonb_set(item,'{category}',to_jsonb(target::text)) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
   WHERE w.user_id=owner AND w.key='watchlists' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item WHERE item->>'category'=p_category::text);
 END IF;
 DELETE FROM public.transaction_categories WHERE id=p_category AND user_id=owner;
 RETURN jsonb_build_object('ok',true,'replacement',target);
END $$;
-- All deletes must use the checked, atomic operation (including empty categories).
REVOKE DELETE ON public.transaction_categories FROM authenticated;
REVOKE ALL ON FUNCTION public.category_usage(uuid),public.delete_transaction_category(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.category_usage(uuid),public.delete_transaction_category(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Undo ordinary property/business tracker balance updates, retaining an audit receipt.
BEGIN;
CREATE TABLE public.deleted_tracker_updates (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL, event jsonb NOT NULL, account_link jsonb, deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deleted_tracker_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.deleted_tracker_updates FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.deleted_tracker_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.deleted_tracker_updates TO authenticated;
CREATE FUNCTION public.prevent_deleted_tracker_replay() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.deleted_tracker_updates WHERE id=NEW.id) THEN RAISE EXCEPTION 'This update was deleted. Start a new update.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_deleted_tracker_replay() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER prevent_deleted_tracker_replay BEFORE INSERT ON public.investment_history FOR EACH ROW EXECUTE FUNCTION public.prevent_deleted_tracker_replay();
CREATE FUNCTION public.delete_tracker_update(p_id uuid,p_record_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h public.investment_history; prior public.investment_history; r public.finance_records;
 link public.investment_account_links; a public.finance_records;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF EXISTS(SELECT 1 FROM public.deleted_tracker_updates WHERE id=p_id AND record_id=p_record_id AND user_id=auth.uid()) THEN RETURN jsonb_build_object('ok',true); END IF;
 SELECT * INTO link FROM public.investment_account_links WHERE id=p_id AND user_id=auth.uid();
 PERFORM id FROM public.finance_records WHERE user_id=auth.uid() AND id IN(p_record_id,link.account_id) ORDER BY id FOR UPDATE;
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid();
 SELECT * INTO h FROM public.investment_history WHERE id=p_id AND record_id=p_record_id AND user_id=auth.uid() FOR UPDATE;
 IF r.id IS NULL OR h.id IS NULL THEN RAISE EXCEPTION 'Tracker update not found.'; END IF;
 IF r.kind NOT IN ('Business','Property') OR h.event_type NOT IN ('valuation','contribution','withdrawal') THEN RAISE EXCEPTION 'This history entry cannot be deleted here.'; END IF;
 IF EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL AND (occurred_on,created_at,id)>(h.occurred_on,h.created_at,h.id)) THEN RAISE EXCEPTION 'Delete newer balance updates first.'; END IF;
 SELECT * INTO prior FROM public.investment_history WHERE record_id=r.id AND user_id=auth.uid() AND balance IS NOT NULL AND (occurred_on,created_at,id)<(h.occurred_on,h.created_at,h.id) ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 1;
 IF prior.id IS NULL THEN RAISE EXCEPTION 'Keep the starting snapshot.'; END IF;
 IF link.id IS NOT NULL THEN
  SELECT * INTO a FROM public.finance_records WHERE id=link.account_id AND user_id=auth.uid() AND kind='Cash';
  IF a.id IS NULL OR a.currency<>coalesce(link.account_currency,r.currency) THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
  IF a.amount-link.amount<0 OR a.amount-link.amount>1e15 THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.'; END IF;
 END IF;
 INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link) VALUES(h.id,auth.uid(),r.id,to_jsonb(h),CASE WHEN link.id IS NOT NULL THEN to_jsonb(link) END);
 DELETE FROM public.investment_account_links WHERE id=h.id AND user_id=auth.uid();
 DELETE FROM public.investment_history WHERE id=h.id AND user_id=auth.uid();
 PERFORM set_config('finance.history_write','1',true);
 UPDATE public.finance_records SET amount=prior.balance,ownership_percentage=CASE WHEN kind='Business' THEN prior.ownership_percentage ELSE ownership_percentage END WHERE id=r.id AND user_id=auth.uid();
 PERFORM set_config('finance.history_write','0',true);
 -- Use the original cash delta, never today's exchange rate. The ordinary trigger
 -- records today's corrected cash balance; previous cash observations remain intact.
 IF link.id IS NOT NULL THEN UPDATE public.finance_records SET amount=amount-link.amount WHERE id=a.id AND user_id=auth.uid(); END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_tracker_update(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_tracker_update(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Allow business/property cash movements without an accompanying valuation.
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
 ELSIF p_type IN ('contribution','withdrawal') AND p_balance IS NULL AND r.kind NOT IN ('Business','Property') THEN
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

CREATE OR REPLACE FUNCTION public.delete_tracker_update(p_id uuid,p_record_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h public.investment_history; prior public.investment_history; r public.finance_records;
 link public.investment_account_links; a public.finance_records;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF EXISTS(SELECT 1 FROM public.deleted_tracker_updates WHERE id=p_id AND record_id=p_record_id AND user_id=auth.uid()) THEN RETURN jsonb_build_object('ok',true); END IF;
 SELECT * INTO link FROM public.investment_account_links WHERE id=p_id AND user_id=auth.uid();
 PERFORM id FROM public.finance_records WHERE user_id=auth.uid() AND id IN(p_record_id,link.account_id) ORDER BY id FOR UPDATE;
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid();
 SELECT * INTO h FROM public.investment_history WHERE id=p_id AND record_id=p_record_id AND user_id=auth.uid() FOR UPDATE;
 IF r.id IS NULL OR h.id IS NULL THEN RAISE EXCEPTION 'Tracker update not found.'; END IF;
 IF r.kind NOT IN ('Business','Property') OR h.event_type NOT IN ('valuation','contribution','withdrawal') THEN RAISE EXCEPTION 'This history entry cannot be deleted here.'; END IF;
 IF h.balance IS NOT NULL AND EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL AND (occurred_on,created_at,id)>(h.occurred_on,h.created_at,h.id)) THEN RAISE EXCEPTION 'Delete newer balance updates first.'; END IF;
 SELECT * INTO prior FROM public.investment_history WHERE record_id=r.id AND user_id=auth.uid() AND balance IS NOT NULL AND (occurred_on,created_at,id)<(h.occurred_on,h.created_at,h.id) ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 1;
 IF h.balance IS NOT NULL AND prior.id IS NULL THEN RAISE EXCEPTION 'Keep the starting snapshot.'; END IF;
 IF link.id IS NOT NULL THEN
  SELECT * INTO a FROM public.finance_records WHERE id=link.account_id AND user_id=auth.uid() AND kind='Cash';
  IF a.id IS NULL OR a.currency<>coalesce(link.account_currency,r.currency) THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
  IF a.amount-link.amount<0 OR a.amount-link.amount>1e15 THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.'; END IF;
 END IF;
 INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link) VALUES(h.id,auth.uid(),r.id,to_jsonb(h),CASE WHEN link.id IS NOT NULL THEN to_jsonb(link) END);
 DELETE FROM public.investment_account_links WHERE id=h.id AND user_id=auth.uid();
 DELETE FROM public.investment_history WHERE id=h.id AND user_id=auth.uid();
 IF h.balance IS NOT NULL THEN
 PERFORM set_config('finance.history_write','1',true);
 UPDATE public.finance_records SET amount=prior.balance,ownership_percentage=CASE WHEN kind='Business' THEN prior.ownership_percentage ELSE ownership_percentage END WHERE id=r.id AND user_id=auth.uid();
 PERFORM set_config('finance.history_write','0',true);
 END IF;
 -- Use the original cash delta, never today's exchange rate. The ordinary trigger
 -- records today's corrected cash balance; previous cash observations remain intact.
 IF link.id IS NOT NULL THEN UPDATE public.finance_records SET amount=amount-link.amount WHERE id=a.id AND user_id=auth.uid(); END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_tracker_update(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_tracker_update(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Cash is included in investment performance only by explicit choice.
ALTER TABLE public.finance_records ADD COLUMN is_investment boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.lock_cash_investment_choice() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.is_investment IS DISTINCT FROM OLD.is_investment THEN
  RAISE EXCEPTION 'Investment inclusion is fixed when the account is created.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER lock_cash_investment_choice BEFORE UPDATE ON public.finance_records
FOR EACH ROW EXECUTE FUNCTION public.lock_cash_investment_choice();

ALTER TABLE public.holding_accounts DROP CONSTRAINT holding_accounts_kind_check;
ALTER TABLE public.holding_accounts ADD CONSTRAINT holding_accounts_kind_check CHECK(kind IN ('Cash','Stock','Crypto'));

BEGIN;
ALTER TABLE public.finance_records ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE public.record_edit_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 before_record jsonb,
 after_record jsonb
);
ALTER TABLE public.record_edit_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.record_edit_history FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.record_edit_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.record_edit_history TO authenticated;
CREATE INDEX record_edit_history_owner_record ON public.record_edit_history(user_id,record_id,changed_at DESC,id);
CREATE FUNCTION public.bump_record_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.revision:=OLD.revision+1; RETURN NEW; END $$;
CREATE TRIGGER z_record_revision BEFORE UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.bump_record_revision();
CREATE FUNCTION public.audit_record_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
 INSERT INTO public.record_edit_history(user_id,record_id,before_record,after_record)
 VALUES(OLD.user_id,OLD.id,to_jsonb(OLD),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(NEW) END);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER record_edit_audit AFTER UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.audit_record_edit();
-- The lock and version comparison occur in the same transaction as the write.
-- Ordinary internal balance updates also increment revision, invalidating stale forms.
CREATE FUNCTION public.save_finance_record(p_record jsonb,p_expected_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE existing public.finance_records; saved public.finance_records; payload jsonb; cols text; vals text; updates text; key text;
 allowed text[]:=ARRAY['id','name','kind','currency','amount','quantity','cost','rate','date','lent_date','frequency','notes','business_id','ownership_percentage','estimated_monthly_income','estimated_monthly_payment','expense_plan_id','end_date','account_id','custom_category_id','holding_account_id','deposit_compounding','opened_on','account_exchange_rate','account_rate_date','account_currency','income_source_id','income_due_on','earning_source_id','earning_due_on','payment_type','is_investment'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF jsonb_typeof(p_record)<>'object' OR p_record->>'id' IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 FOR key IN SELECT jsonb_object_keys(p_record) LOOP
  IF NOT key=ANY(allowed) THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 END LOOP;
 SELECT * INTO existing FROM public.finance_records WHERE id=(p_record->>'id')::uuid AND user_id=auth.uid() FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  -- Retrying an identical confirmed write is harmless, even after a lost response.
  IF to_jsonb(existing) @> p_record THEN RETURN jsonb_build_array(to_jsonb(existing)); END IF;
  IF p_expected_revision IS NULL OR existing.revision<>p_expected_revision THEN
   RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
  END IF;
 ELSIF p_expected_revision IS NOT NULL THEN
  RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
 END IF;
 payload:=p_record||jsonb_build_object('user_id',auth.uid());
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k),string_agg(format('%I=excluded.%I',k,k),',' ORDER BY k) FILTER(WHERE k NOT IN('id','user_id'))
 INTO cols,vals,updates FROM jsonb_object_keys(payload) k;
 EXECUTE format('INSERT INTO public.finance_records(%s) SELECT %s FROM jsonb_populate_record(NULL::public.finance_records,$1) r ON CONFLICT(id) DO UPDATE SET %s RETURNING *',cols,vals,updates) INTO saved USING payload;
 RETURN jsonb_build_array(to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.save_finance_record(jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_finance_record(jsonb,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
-- A fixed allowlist is shared by export, preview and restore. No caller-selected
-- identifiers or arbitrary SQL are accepted by the privileged restore function.
CREATE FUNCTION public.finance_backup_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT ARRAY['account_activity','asset_movements','deleted_items','deleted_tracker_updates','expense_plan_versions','expense_plans','finance_records','forecast_assignments','goal_events','goal_operations','holding_accounts','import_batch_items','import_batches','income_sources','investment_account_links','investment_comparison_baselines','investment_comparison_preferences','investment_history','mortgage_payments','payment_occurrences','portfolio_snapshots','record_edit_history','savings_goals','transaction_categories','transaction_splits','user_app_activity','user_preferences','workspace_preferences']::text[]
$$;
CREATE TABLE public.backup_manifests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backup_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_manifests FROM PUBLIC,anon,authenticated;
CREATE INDEX backup_manifests_owner ON public.backup_manifests(user_id,id);
CREATE TABLE public.backup_recovery_points (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 backup jsonb NOT NULL, restore_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,restore_key)
);
ALTER TABLE public.backup_recovery_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.backup_recovery_points FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.backup_recovery_points FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.backup_recovery_points TO authenticated;
-- Circular source/schedule links require deferred FK checks during restoration.
-- Preserve the existing initial timing for ordinary application transactions.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT c.conrelid::regclass AS tbl,c.conname,c.condeferred,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE c.contype='f' AND n.nspname='public' AND r.relname=ANY(public.finance_backup_tables()) LOOP
  IF item.definition LIKE '%ON DELETE RESTRICT%' THEN
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.tbl,item.conname);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',item.tbl,item.conname,replace(item.definition,'ON DELETE RESTRICT','ON DELETE NO ACTION'));
  END IF;
  EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY %s',item.tbl,item.conname,CASE WHEN item.condeferred THEN 'DEFERRED' ELSE 'IMMEDIATE' END);
 END LOOP;
END $$;
CREATE FUNCTION public.finance_backup_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE tables jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 -- Stable row order makes the preview fingerprint independent of query plans.
 EXECUTE (SELECT 'SELECT jsonb_build_object('||string_agg(format('%L,(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),''[]''::jsonb) FROM public.%I r WHERE user_id=$1)',name,name),',')||')' FROM unnest(public.finance_backup_tables()) name) INTO tables USING auth.uid();
 RETURN tables;
END $$;
CREATE OR REPLACE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE tables jsonb; result jsonb; backup_id uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 tables:=public.finance_backup_state();
 result:=jsonb_build_object('version',2,'schema_version',59,'id',backup_id,'owner_id',auth.uid(),'exported_at',now(),'tables',tables);
 INSERT INTO public.backup_manifests(id,user_id,digest) VALUES(backup_id,auth.uid(),encode(sha256(convert_to(result::text,'UTF8')),'hex'));
 RETURN result;
END $$;
CREATE FUNCTION public.preview_finance_restore(p_backup text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE backup jsonb; tbl text; counts jsonb:='{}'; current_state jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF octet_length(p_backup)>20000000 THEN RAISE EXCEPTION 'File is too large.'; END IF;
 backup:=p_backup::jsonb;
 IF backup->>'version'<>'2' OR backup->>'schema_version'<>'59' OR backup->>'owner_id' IS DISTINCT FROM auth.uid()::text OR NOT EXISTS(
 SELECT 1 FROM public.backup_manifests WHERE id=(backup->>'id')::uuid AND user_id=auth.uid() AND digest=encode(sha256(convert_to(backup::text,'UTF8')),'hex')
 ) THEN RAISE EXCEPTION 'Use an unchanged verified backup downloaded from this account.'; END IF;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  IF jsonb_typeof(backup->'tables'->tbl) IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(backup->'tables'->tbl) r WHERE r->>'user_id' IS DISTINCT FROM auth.uid()::text) THEN RAISE EXCEPTION 'The backup contains invalid owner data.'; END IF;
  counts:=counts||jsonb_build_object(tbl,jsonb_array_length(backup->'tables'->tbl));
 END LOOP;
 current_state:=public.finance_backup_state();
 RETURN jsonb_build_object('id',backup->>'id','exported_at',backup->>'exported_at','counts',counts,'current_records',jsonb_array_length(current_state->'finance_records'),'expected_state',encode(sha256(convert_to(current_state::text,'UTF8')),'hex'));
END $$;
CREATE FUNCTION public.restore_finance_backup(p_backup text,p_expected_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE backup jsonb; tbl text; lock_list text; recovery jsonb; operation_key text; prior_id uuid;
BEGIN
 PERFORM public.preview_finance_restore(p_backup);backup:=p_backup::jsonb;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 -- Locks isolate temporary USER-trigger suspension from every other connection.
 SELECT string_agg(format('public.%I',name),',' ORDER BY name) INTO lock_list FROM unnest(public.finance_backup_tables()) name;
 EXECUTE 'LOCK TABLE '||lock_list||' IN ACCESS EXCLUSIVE MODE NOWAIT';
 operation_key:=encode(sha256(convert_to(coalesce(p_expected_state,'')||':'||(backup->>'id'),'UTF8')),'hex');
 SELECT id INTO prior_id FROM public.backup_recovery_points WHERE user_id=auth.uid() AND backup_recovery_points.restore_key=operation_key;
 IF prior_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'recovery_id',prior_id); END IF;
 IF p_expected_state IS DISTINCT FROM encode(sha256(convert_to(public.finance_backup_state()::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Your workspace changed. Preview the backup again before restoring.'; END IF;
 recovery:=public.export_finance_backup();
 INSERT INTO public.backup_recovery_points(id,user_id,backup,restore_key) VALUES((recovery->>'id')::uuid,auth.uid(),recovery,operation_key);
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname=ANY(public.finance_backup_tables()) AND NOT t.tgisinternal AND t.tgenabled<>'O') THEN RAISE EXCEPTION 'Restore requires the normal database trigger configuration.'; END IF;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',tbl); END LOOP;
 SET CONSTRAINTS ALL DEFERRED;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',tbl) USING auth.uid(); END LOOP;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I,$1)',tbl,tbl) USING backup->'tables'->tbl;
 END LOOP;
 -- FK and CHECK constraints remain enforced. Failure rolls back all rows and DDL.
 SET CONSTRAINTS ALL IMMEDIATE;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',tbl); END LOOP;
 RETURN jsonb_build_object('ok',true,'recovery_id',recovery->>'id');
END $$;
CREATE FUNCTION public.get_backup_recovery(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT backup FROM public.backup_recovery_points WHERE id=p_id AND user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_backup_recovery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_backup_recovery(uuid) TO authenticated;
CREATE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',59,'record_revisions',true,'verified_restore',true)
$$;
REVOKE ALL ON FUNCTION public.finance_backup_state(),public.finance_backup_tables(),public.preview_finance_restore(text),public.restore_finance_backup(text,text),public.finance_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_finance_restore(text),public.restore_finance_backup(text,text),public.finance_capabilities() TO authenticated;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Saved alongside comparison choices under the existing owner-only RLS policies.
ALTER TABLE public.investment_comparison_preferences
 ADD COLUMN portfolio jsonb CHECK (portfolio IS NULL OR jsonb_typeof(portfolio) = 'object');

BEGIN;
-- Archived JSON predates later columns. Rehydrate missing columns using the
-- current schema defaults, preserving every explicitly saved value (even null).
-- This also keeps revision=1 for pre-revision imports, so later edits still fail.
CREATE FUNCTION public.normalize_finance_record_snapshot(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE field record; result jsonb:=p_data; default_value jsonb;
BEGIN
 FOR field IN SELECT a.attname,pg_get_expr(d.adbin,d.adrelid) AS expression
  FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.finance_records'::regclass AND NOT a.attisdropped AND NOT(p_data ? a.attname)
 LOOP
  EXECUTE 'SELECT to_jsonb('||field.expression||')' INTO default_value;
  result:=result||jsonb_build_object(field.attname,default_value);
 END LOOP;
 RETURN to_jsonb(jsonb_populate_record(NULL::public.finance_records,result));
END $$;
REVOKE ALL ON FUNCTION public.normalize_finance_record_snapshot(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.restore_deleted_item_before_transaction_tools(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_write text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' THEN
  previous_write:=coalesce(current_setting('finance.history_write',true),'0');
  IF jsonb_array_length(item.history)>0 THEN PERFORM set_config('finance.history_write','1',true); END IF;
  INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,public.normalize_finance_record_snapshot(item.data) || jsonb_build_object('user_id',auth.uid()))).*;
  IF jsonb_array_length(item.history)>0 THEN
   INSERT INTO public.investment_history SELECT * FROM jsonb_populate_recordset(NULL::public.investment_history,item.history);
   PERFORM set_config('finance.history_write',previous_write,true);
  END IF;
 ELSE
  INSERT INTO public.expense_plans SELECT (jsonb_populate_record(NULL::public.expense_plans,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 END IF;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
END $$;
CREATE OR REPLACE FUNCTION public.undo_statement_import(p_batch uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); batch public.import_batches; item public.import_batch_items; current_record jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO batch FROM public.import_batches WHERE id=p_batch AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found.'; END IF;
 IF batch.undone_at IS NOT NULL THEN RETURN; END IF;
 -- Lock and check everything before deleting anything. Later edits must be reviewed.
 FOR item IN SELECT * FROM public.import_batch_items WHERE batch_id=p_batch AND user_id=owner ORDER BY record_id LOOP
  SELECT to_jsonb(f) INTO current_record FROM public.finance_records f WHERE id=item.record_id AND user_id=owner FOR UPDATE;
  IF NOT FOUND OR current_record<>public.normalize_finance_record_snapshot(item.original) OR EXISTS(SELECT 1 FROM public.transaction_splits WHERE record_id=item.record_id) OR EXISTS(SELECT 1 FROM public.goal_events WHERE source_id=item.record_id) THEN RAISE EXCEPTION 'An imported transaction has changed or is linked to a goal. Review these records individually.'; END IF;
 END LOOP;
 -- Remove outflows first so undoing a balanced batch does not transiently overdraw.
 FOR item IN SELECT * FROM public.import_batch_items WHERE batch_id=p_batch AND user_id=owner ORDER BY CASE WHEN original->>'kind'='Other expense' THEN 0 ELSE 1 END,record_id LOOP
  DELETE FROM public.finance_records WHERE id=item.record_id AND user_id=owner;
 END LOOP;
 UPDATE public.import_batches SET undone_at=now() WHERE id=p_batch;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
-- Private transaction-local authorization for suppressing derived writes during
-- exact restoration. A caller cannot enable this by setting a session variable.
CREATE TABLE public.finance_restore_context (
 transaction_id bigint NOT NULL, user_id uuid NOT NULL, PRIMARY KEY(transaction_id,user_id)
);
REVOKE ALL ON public.finance_restore_context FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.finance_restore_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.finance_restore_context WHERE transaction_id=txid_current() AND user_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION public.finance_restore_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_restore_active() TO authenticated;
-- Preserve each trigger's implementation and privileges. Install the bypass
-- inside the functions once, rather than changing shared trigger state at runtime.
DO $$ DECLARE item record; definition text; BEGIN
 FOR item IN SELECT DISTINCT p.oid,l.lanname FROM pg_trigger t
  JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
  JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='public' AND r.relname=ANY(public.finance_backup_tables()) AND NOT t.tgisinternal
 LOOP
  IF item.lanname<>'plpgsql' THEN RAISE EXCEPTION 'Restore guard requires a PL/pgSQL trigger.'; END IF;
  definition:=pg_get_functiondef(item.oid);
  definition:=regexp_replace(definition,'\mBEGIN\M',
   'BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL=''STATEMENT'' THEN RETURN NULL; ELSIF TG_OP=''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;', 'i');
  EXECUTE definition;
 END LOOP;
END $$;
-- Every ordinary write takes the same owner lock as restore, including direct
-- RLS writes. Different owners use different locks. Statement triggers run before
-- row locks, preventing an update/restore lock-order inversion.
CREATE FUNCTION public.serialize_finance_owner_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0)); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.serialize_finance_owner_write() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  EXECUTE format('CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write()',tbl);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.restore_finance_backup(p_backup text,p_expected_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE backup jsonb; tbl text; recovery jsonb; operation_key text; prior_id uuid;
BEGIN
 PERFORM public.preview_finance_restore(p_backup);backup:=p_backup::jsonb;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 operation_key:=encode(sha256(convert_to(coalesce(p_expected_state,'')||':'||(backup->>'id'),'UTF8')),'hex');
 SELECT id INTO prior_id FROM public.backup_recovery_points WHERE user_id=auth.uid() AND backup_recovery_points.restore_key=operation_key;
 IF prior_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'recovery_id',prior_id); END IF;
 IF p_expected_state IS DISTINCT FROM encode(sha256(convert_to(public.finance_backup_state()::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Your workspace changed. Preview the backup again before restoring.'; END IF;
 recovery:=public.export_finance_backup();
 INSERT INTO public.backup_recovery_points(id,user_id,backup,restore_key) VALUES((recovery->>'id')::uuid,auth.uid(),recovery,operation_key);
 -- This context is writable only by privileged functions, never by a caller's
 -- custom GUC. Other sessions keep their triggers and continue normally.
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname=ANY(public.finance_backup_tables()) AND NOT t.tgisinternal AND p.proname<>'serialize_finance_owner_write' AND position('public.finance_restore_active()' in p.prosrc)=0) THEN RAISE EXCEPTION 'Restore requires updated financial trigger guards.'; END IF;
 INSERT INTO public.finance_restore_context(transaction_id,user_id) VALUES(txid_current(),auth.uid());
 SET CONSTRAINTS ALL DEFERRED;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',tbl) USING auth.uid(); END LOOP;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I,$1)',tbl,tbl) USING backup->'tables'->tbl;
 END LOOP;
 -- FK and CHECK constraints remain enforced. Failure rolls back all rows and the restore context.
 SET CONSTRAINTS ALL IMMEDIATE;
 DELETE FROM public.finance_restore_context WHERE transaction_id=txid_current() AND user_id=auth.uid();
 RETURN jsonb_build_object('ok',true,'recovery_id',recovery->>'id');
END $$;
-- Background captures use the same owner lock before writing. The cron's
-- service-role token has no auth.uid(), so it cannot rely on the caller trigger.
CREATE FUNCTION public.capture_owner_portfolio_snapshot(p_owner uuid,p_day date,p_totals jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_owner IS NULL OR p_day IS NULL THEN RAISE EXCEPTION 'Invalid snapshot.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 INSERT INTO public.portfolio_snapshots(user_id,occurred_on,assets,debt,rates,updated_at)
 VALUES(p_owner,p_day,(p_totals->>'assets')::numeric,(p_totals->>'debt')::numeric,p_totals->'rates',now())
 ON CONFLICT(user_id,occurred_on) DO UPDATE SET assets=excluded.assets,debt=excluded.debt,rates=excluded.rates,updated_at=excluded.updated_at;
END $$;
REVOKE ALL ON FUNCTION public.capture_owner_portfolio_snapshot(uuid,date,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.capture_owner_portfolio_snapshot(uuid,date,jsonb) TO service_role; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
-- Only the trusted server may re-register an externally authenticated backup.
-- The server verifies its HMAC and passes the signed-in owner's ID. Ordinary
-- authenticated RPC callers can never certify arbitrary JSON this way.
CREATE FUNCTION public.register_verified_finance_backup(p_backup text,p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE backup jsonb; tbl text; fingerprint text;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner) OR octet_length(p_backup)>20000000 THEN RAISE EXCEPTION 'Invalid backup owner or size.'; END IF;
 backup:=p_backup::jsonb;
 IF backup->>'version' IS DISTINCT FROM '2' OR backup->>'schema_version' IS DISTINCT FROM '59' OR backup->>'owner_id' IS DISTINCT FROM p_owner::text OR backup->>'id' IS NULL THEN RAISE EXCEPTION 'Use an unchanged verified backup downloaded from this account.'; END IF;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  IF jsonb_typeof(backup->'tables'->tbl) IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(backup->'tables'->tbl) r WHERE r->>'user_id' IS DISTINCT FROM p_owner::text) THEN RAISE EXCEPTION 'The backup contains invalid owner data.'; END IF;
 END LOOP;
 fingerprint:=encode(sha256(convert_to(backup::text,'UTF8')),'hex');
 INSERT INTO public.backup_manifests(id,user_id,digest) VALUES((backup->>'id')::uuid,p_owner,fingerprint)
 ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.backup_manifests WHERE id=(backup->>'id')::uuid AND user_id=p_owner AND digest=fingerprint) THEN RAISE EXCEPTION 'The backup identifier is already in use.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.register_verified_finance_backup(text,uuid) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT EXECUTE ON FUNCTION public.register_verified_finance_backup(text,uuid) TO service_role;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE INDEX finance_records_owner_actual_date ON public.finance_records(user_id,date DESC,id) WHERE frequency='Once';
CREATE FUNCTION public.transaction_history_page(p_page integer DEFAULT 1,p_currency text DEFAULT NULL,p_query text DEFAULT '',p_category text DEFAULT 'all',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_order text DEFAULT 'newest') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_page IS NULL OR p_page<1 OR p_page>1000000 OR p_order IS NULL OR p_order NOT IN('newest','oldest','name') OR length(p_query)>200 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to) THEN RAISE EXCEPTION 'Invalid history filters.'; END IF;
 WITH matching AS MATERIALIZED (
 SELECT r.* FROM public.finance_records r WHERE r.user_id=auth.uid() AND r.frequency='Once'
 AND r.kind IN('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_category='all' OR r.kind=p_category OR r.custom_category_id::text=p_category)
 AND (p_from IS NULL OR r.date>=p_from) AND (p_to IS NULL OR r.date<=p_to)
 AND (trim(p_query)='' OR strpos(lower(r.name||' '||r.notes),lower(trim(p_query)))>0)
 ), pagination AS (
  SELECT count(*)::integer AS total,least(p_page,greatest(1,(count(*)::integer+9)/10)) AS page FROM matching
 ), items AS (
  SELECT r.*,row_number() OVER(ORDER BY CASE WHEN p_order='name' THEN lower(r.name) END ASC,CASE WHEN p_order='oldest' THEN r.date END ASC NULLS LAST,CASE WHEN p_order='newest' THEN r.date END DESC NULLS LAST,r.id ASC) AS position
  FROM matching r ORDER BY position LIMIT 10 OFFSET ((SELECT page FROM pagination)-1)*10
 )
 SELECT jsonb_build_object('records',(SELECT coalesce(jsonb_agg(to_jsonb(items)-'position' ORDER BY position),'[]') FROM items),'total',total,'page',page) INTO result FROM pagination;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.transaction_history_page(integer,text,text,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transaction_history_page(integer,text,text,text,date,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',64,'record_revisions',true,'verified_restore',true)
$$;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
ALTER TABLE public.finance_records ADD COLUMN recurrence_days integer;
ALTER TABLE public.income_sources ADD COLUMN recurrence_days integer;
ALTER TABLE public.finance_records DROP CONSTRAINT finance_records_frequency_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_frequency_check CHECK(frequency IN ('Once','Weekly','Fortnightly','Monthly','Yearly','Custom'));
ALTER TABLE public.income_sources DROP CONSTRAINT income_sources_frequency_check;
ALTER TABLE public.income_sources ADD CONSTRAINT income_sources_frequency_check CHECK(frequency IN ('Weekly','Fortnightly','Monthly','Yearly','Custom'));
ALTER TABLE public.finance_records ADD CONSTRAINT finance_recurrence_interval CHECK((frequency='Custom' AND recurrence_days BETWEEN 1 AND 366 AND recurrence_days IS NOT NULL) OR (frequency<>'Custom' AND recurrence_days IS NULL));
ALTER TABLE public.income_sources ADD CONSTRAINT source_recurrence_interval CHECK((frequency='Custom' AND recurrence_days BETWEEN 1 AND 366 AND recurrence_days IS NOT NULL) OR (frequency IS DISTINCT FROM 'Custom' AND recurrence_days IS NULL));
ALTER TABLE public.finance_records DROP CONSTRAINT finance_records_end_date_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_end_date_check CHECK(end_date IS NULL OR (date IS NOT NULL AND end_date>=date AND frequency IN ('Weekly','Fortnightly','Monthly','Yearly','Custom') AND kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')));
CREATE FUNCTION public.is_schedule_date(frequency text,anchor date,until_day date,day date,days integer DEFAULT NULL) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(day>=anchor AND (until_day IS NULL OR day<=until_day) AND CASE
 WHEN frequency IN ('Weekly','Fortnightly','Custom') THEN (day-anchor)%nullif(CASE frequency WHEN 'Weekly' THEN 7 WHEN 'Fortnightly' THEN 14 ELSE days END,0)=0
 WHEN frequency IN ('Monthly','Yearly') THEN extract(day FROM day)=least(extract(day FROM anchor),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day')) AND (frequency='Monthly' OR extract(month FROM day)=extract(month FROM anchor)) ELSE false END,false)
$$;
REVOKE ALL ON FUNCTION public.is_schedule_date(text,date,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_schedule_date(text,date,date,date,integer) TO authenticated;
-- Exact guarded patches preserve restore guards and existing operation protections.
CREATE FUNCTION pg_temp.patch_daily(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); BEGIN
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
SELECT pg_temp.patch_daily('public.save_finance_record(jsonb,bigint)'::regprocedure,$old$'is_investment'];$old$,$new$'is_investment','recurrence_days'];$new$);
SELECT pg_temp.patch_daily('public.planning_action(text,jsonb)'::regprocedure,$old$r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date))$old$,$new$r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,day,r.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,$old$r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date))$old$,$new$r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,day,r.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.validate_earning_receipt()'::regprocedure,$old$due IS NULL OR due<source.start_date OR (source.end_date IS NOT NULL AND due>source.end_date) OR extract(day FROM due)<>least(extract(day FROM source.start_date),extract(day FROM (month_start+interval '1 month - 1 day'))) OR (source.frequency='Yearly' AND extract(month FROM due)<>extract(month FROM source.start_date))$old$,$new$NOT public.is_schedule_date(source.frequency,source.start_date,source.end_date,due,source.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.validate_income_source()'::regprocedure,$old$IF due<source.date OR (source.end_date IS NOT NULL AND due>source.end_date) OR
    extract(day FROM due)<>least(extract(day FROM source.date),extract(day FROM (month_start+interval '1 month - 1 day'))) OR
    (source.frequency='Yearly' AND extract(month FROM due)<>extract(month FROM source.date))$old$,$new$IF NOT public.is_schedule_date(source.frequency,source.date,source.end_date,due,source.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.validate_income_source()'::regprocedure,$old$source.frequency IN ('Monthly','Yearly')$old$,$new$source.frequency IN ('Weekly','Fortnightly','Monthly','Yearly','Custom')$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$saved.frequency,saved.start_date$old$,$new$saved.frequency,saved.recurrence_days,saved.start_date$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$old.frequency,old.start_date$old$,$new$old.frequency,old.recurrence_days,old.start_date$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$frequency,end_date,business_id,income_source_id,source_paused)$old$,$new$frequency,recurrence_days,end_date,business_id,income_source_id,source_paused)$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$saved.start_date,saved.frequency,saved.end_date$old$,$new$saved.start_date,saved.frequency,saved.recurrence_days,saved.end_date$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$frequency=EXCLUDED.frequency,$old$,$new$frequency=EXCLUDED.frequency,recurrence_days=EXCLUDED.recurrence_days,$new$);
SELECT pg_temp.patch_daily('public.protect_income_schedule()'::regprocedure,$old$NEW.frequency,NEW.date$old$,$new$NEW.frequency,NEW.recurrence_days,NEW.date$new$);
SELECT pg_temp.patch_daily('public.protect_income_schedule()'::regprocedure,$old$OLD.frequency,OLD.date$old$,$new$OLD.frequency,OLD.recurrence_days,OLD.date$new$);
SELECT pg_temp.patch_daily('public.finance_records_page(integer,text,text,boolean)'::regprocedure,$old$r.currency,r.frequency,$old$,$new$r.currency,r.frequency,r.recurrence_days,$new$);
CREATE FUNCTION public.set_schedule_exception(p_record uuid,p_day date,p_skip boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.payment_occurrences;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_skip IS NULL THEN RAISE EXCEPTION 'Choose a schedule action.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=auth.uid();
 IF NOT FOUND OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,p_day,r.recurrence_days) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
 SELECT * INTO existing FROM public.payment_occurrences WHERE user_id=auth.uid() AND record_id=p_record AND due_on=p_day;
 IF existing.status='paid' THEN RAISE EXCEPTION 'A recorded payment cannot be skipped.'; END IF;
 IF p_skip THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status) VALUES(gen_random_uuid(),auth.uid(),p_record,p_day,'dismissed') ON CONFLICT(user_id,record_id,due_on) DO NOTHING;
 ELSE DELETE FROM public.payment_occurrences WHERE user_id=auth.uid() AND record_id=p_record AND due_on=p_day AND status='dismissed';
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.set_schedule_exception(uuid,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_schedule_exception(uuid,date,boolean) TO authenticated;
CREATE FUNCTION public.protect_settled_schedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=OLD.user_id AND record_id=OLD.id) THEN
  IF (NEW.kind,NEW.currency,NEW.frequency,NEW.recurrence_days) IS DISTINCT FROM (OLD.kind,OLD.currency,OLD.frequency,OLD.recurrence_days)
   OR (NEW.date IS DISTINCT FROM OLD.date AND NOT EXISTS(SELECT 1 FROM public.income_sources WHERE user_id=OLD.user_id AND schedule_id=OLD.id))
   OR (NEW.end_date IS NOT NULL AND EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=OLD.user_id AND record_id=OLD.id AND due_on>NEW.end_date AND status='paid')) THEN
   RAISE EXCEPTION 'Keep the schedule compatible with settled payments. Stop it and create a new plan to change its cadence.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_settled_schedule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_settled_schedule BEFORE UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.protect_settled_schedule();
NOTIFY pgrst,'reload schema';
COMMIT;
BEGIN;
CREATE TABLE public.account_reconciliations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE,
 account_id uuid NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
 opening_balance numeric NOT NULL, closing_balance numeric NOT NULL,
 cleared text[] NOT NULL, fingerprint text NOT NULL, ledger jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','reconciled')), revision integer NOT NULL DEFAULT 1,
 FOREIGN KEY(user_id,account_id) REFERENCES public.finance_records(user_id,id) DEFERRABLE,
 CHECK(start_date<=end_date), CHECK(abs(opening_balance)<=1e15 AND abs(closing_balance)<=1e15),
 CHECK(opening_balance::text NOT IN ('NaN','Infinity','-Infinity') AND closing_balance::text NOT IN ('NaN','Infinity','-Infinity'))
);
ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.account_reconciliations FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.account_reconciliations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.account_reconciliations TO authenticated;
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.account_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
-- A single projection of account legs. Fee/receipt records representing an
-- operation are excluded when the operation already includes their cash effect.
CREATE FUNCTION public.account_statement_legs(p_account uuid,p_start date,p_end date)
RETURNS TABLE(key text,date date,name text,amount numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT 'record:'||r.id,r.date,r.name,CASE WHEN r.kind IN ('Salary','Rent income','Business income','Other income') THEN r.amount ELSE -r.amount END/coalesce(r.account_exchange_rate,1)
 FROM public.finance_records r WHERE r.user_id=auth.uid() AND r.account_id=p_account AND r.frequency='Once' AND r.date BETWEEN p_start AND p_end
 AND NOT EXISTS(SELECT 1 FROM public.account_activity a WHERE a.user_id=auth.uid() AND a.id IN(r.operation_id,r.mortgage_payment_id))
 AND NOT EXISTS(SELECT 1 FROM public.investment_account_links l WHERE l.user_id=auth.uid() AND l.id=r.history_event_id)
 UNION ALL
 SELECT 'activity:'||a.id||':out',a.occurred_on,a.action,a.after_balance-a.before_balance FROM public.account_activity a WHERE a.user_id=auth.uid() AND a.account_id=p_account AND a.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'activity:'||a.id||':in',a.occurred_on,a.action,a.received FROM public.account_activity a WHERE a.user_id=auth.uid() AND a.target_id=p_account AND a.action='transfer' AND a.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'movement:'||m.id||':out',m.occurred_on,m.kind,-m.sent FROM public.asset_movements m WHERE m.user_id=auth.uid() AND m.source_id=p_account AND m.kind<>'interest' AND m.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'movement:'||m.id||':in',m.occurred_on,m.kind,m.received FROM public.asset_movements m WHERE m.user_id=auth.uid() AND m.target_id=p_account AND m.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'tracker:'||l.id,h.occurred_on,r.name,l.amount FROM public.investment_account_links l JOIN public.investment_history h ON h.id=l.id AND h.user_id=l.user_id JOIN public.finance_records r ON r.id=h.record_id AND r.user_id=h.user_id
 WHERE l.user_id=auth.uid() AND l.account_id=p_account AND h.occurred_on BETWEEN p_start AND p_end
$$;
-- Carry forward explicitly unchecked entries from earlier statement reviews.
-- An entry cleared in an earlier period is not offered again in later periods.
CREATE FUNCTION public.statement_review_legs(p_account uuid,p_start date,p_end date)
RETURNS TABLE(key text,date date,name text,amount numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT l.* FROM public.account_statement_legs(p_account,least(p_start,coalesce((SELECT min(start_date) FROM public.account_reconciliations WHERE user_id=auth.uid() AND account_id=p_account AND end_date<p_start),p_start)),p_end) l
 WHERE l.date>=p_start OR (
 EXISTS(SELECT 1 FROM public.account_reconciliations r CROSS JOIN LATERAL jsonb_array_elements(r.ledger) e WHERE r.user_id=auth.uid() AND r.account_id=p_account AND r.end_date<p_start AND e->>'key'=l.key AND NOT (l.key=ANY(r.cleared)))
 AND NOT EXISTS(SELECT 1 FROM public.account_reconciliations r WHERE r.user_id=auth.uid() AND r.account_id=p_account AND r.end_date<p_start AND l.key=ANY(r.cleared)));
$$;
REVOKE ALL ON FUNCTION public.statement_review_legs(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.statement_review_legs(uuid,date,date) TO authenticated;
CREATE FUNCTION public.account_statement(p_account uuid,p_start date,p_end date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE account public.finance_records; rows jsonb; hash text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end OR p_end>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Check the statement dates.'; END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=p_account AND user_id=auth.uid() AND kind='Cash';
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 IF (SELECT count(*) FROM public.statement_review_legs(p_account,p_start,p_end))>5000 THEN RAISE EXCEPTION 'Choose a shorter statement period.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.date,l.key),'[]') INTO rows FROM public.statement_review_legs(p_account,p_start,p_end) l;
 -- Conservative invalidation also catches manual account corrections that have
 -- no dated transaction leg. A new balance update requires review again.
 hash:=encode(sha256(convert_to(jsonb_build_array(account.id,account.currency,account.amount,account.revision,p_start,p_end,rows)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('entries',rows,'fingerprint',hash,'account',to_jsonb(account)-'user_id');
END $$;
CREATE FUNCTION public.save_account_reconciliation(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.account_reconciliations; prior public.account_reconciliations; state jsonb; total numeric; row_count integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 item:=jsonb_populate_record(NULL::public.account_reconciliations,p_data||jsonb_build_object('user_id',auth.uid()));
 SELECT * INTO prior FROM public.account_reconciliations WHERE id=item.id;
 IF FOUND AND prior.user_id<>auth.uid() THEN RAISE EXCEPTION 'Statement not found.'; END IF;
 IF prior.id IS NOT NULL AND prior.account_id<>item.account_id THEN RAISE EXCEPTION 'Statement account cannot change.'; END IF;
 IF prior.id IS NOT NULL AND to_jsonb(prior) @> (p_data-'revision') THEN RETURN to_jsonb(prior); END IF;
 IF prior.id IS NOT NULL AND prior.revision IS DISTINCT FROM item.revision THEN RAISE EXCEPTION 'This statement changed. Reload it before saving.'; END IF;
 state:=public.account_statement(item.account_id,item.start_date,item.end_date);
 IF item.fingerprint IS DISTINCT FROM state->>'fingerprint' THEN RAISE EXCEPTION 'Account activity changed. Reload the statement before saving.'; END IF;
 IF item.cleared IS NULL OR cardinality(item.cleared)>5000 OR cardinality(item.cleared)<>(SELECT count(DISTINCT k) FROM unnest(item.cleared) k) THEN RAISE EXCEPTION 'Check the cleared entries.'; END IF;
 SELECT count(*),coalesce(sum((e->>'amount')::numeric),0) INTO row_count,total FROM jsonb_array_elements(state->'entries') e WHERE e->>'key'=ANY(item.cleared);
 IF row_count<>cardinality(item.cleared) THEN RAISE EXCEPTION 'Check the cleared entries.'; END IF;
 IF item.status='reconciled' AND item.opening_balance+total<>item.closing_balance THEN RAISE EXCEPTION 'The cleared balance must match the statement.'; END IF;
 item.ledger:=state->'entries';item.revision:=coalesce(prior.revision,0)+1;
 INSERT INTO public.account_reconciliations SELECT item.* ON CONFLICT(id) DO UPDATE SET start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,opening_balance=EXCLUDED.opening_balance,closing_balance=EXCLUDED.closing_balance,cleared=EXCLUDED.cleared,fingerprint=EXCLUDED.fingerprint,ledger=EXCLUDED.ledger,status=EXCLUDED.status,revision=EXCLUDED.revision;
 RETURN to_jsonb(item)-'user_id';
END $$;
REVOKE ALL ON FUNCTION public.account_statement_legs(uuid,date,date),public.account_statement(uuid,date,date),public.save_account_reconciliation(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_statement_legs(uuid,date,date),public.account_statement(uuid,date,date),public.save_account_reconciliation(jsonb) TO authenticated;
CREATE FUNCTION public.reconciliation_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',a.id,'name',a.name,'end_date',r.end_date,'valid',CASE WHEN r.status='reconciled' THEN r.fingerprint=(public.account_statement(a.id,r.start_date,r.end_date)->>'fingerprint') ELSE false END) ORDER BY a.id),'[]')
 FROM public.finance_records a LEFT JOIN LATERAL(SELECT * FROM public.account_reconciliations r WHERE r.user_id=auth.uid() AND r.account_id=a.id ORDER BY r.end_date DESC,r.id LIMIT 1) r ON true
 WHERE a.user_id=auth.uid() AND a.kind='Cash';
$$;
REVOKE ALL ON FUNCTION public.reconciliation_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconciliation_status() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
BEGIN;
CREATE TABLE public.corporate_events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE,
 record_id uuid NOT NULL, target_id uuid, kind text NOT NULL CHECK(kind IN ('dividend','split','security_transfer')),
 occurred_on date NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 FOREIGN KEY(user_id,record_id) REFERENCES public.finance_records(user_id,id) DEFERRABLE,
 FOREIGN KEY(user_id,target_id) REFERENCES public.finance_records(user_id,id) DEFERRABLE
);
ALTER TABLE public.corporate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.corporate_events FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.corporate_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.corporate_events TO authenticated;
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.corporate_events FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
CREATE FUNCTION public.record_corporate_event(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=auth.uid(); a public.finance_records; b public.finance_records; prior public.corporate_events;
 item uuid:=(p_data->>'id')::uuid; aid uuid:=(p_data->>'record_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 action text:=p_data->>'kind'; day date:=(p_data->>'date')::date; memo text:=coalesce(p_data->>'notes','');
 gross numeric:=coalesce((p_data->>'gross')::numeric,0); tax numeric:=coalesce((p_data->>'withholding')::numeric,0);
 reinvest numeric:=coalesce((p_data->>'reinvest_amount')::numeric,0); quantity numeric:=coalesce((p_data->>'quantity')::numeric,0);
 numerator numeric:=coalesce((p_data->>'numerator')::numeric,0); denominator numeric:=coalesce((p_data->>'denominator')::numeric,0);
 next_quantity numeric; total_value numeric; history_setting text; result jsonb; tax_id uuid:=gen_random_uuid(); trade_id uuid:=gen_random_uuid(); last_day date;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL OR aid IS NULL OR action IS NULL OR action NOT IN ('dividend','split','security_transfer') OR day IS NULL OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000
 OR EXISTS(SELECT 1 FROM unnest(ARRAY[gross,tax,reinvest,quantity,numerator,denominator]) n WHERE n<0 OR n>1e15 OR n::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Check the investment event fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.corporate_events WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.payload<>p_data THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN prior.result;
 END IF;
 PERFORM id FROM public.finance_records WHERE id IN(aid,bid) AND user_id=owner ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind IN ('Stock','Crypto');
 IF a.id IS NULL OR a.revision IS DISTINCT FROM (p_data->>'revision')::bigint THEN RAISE EXCEPTION 'The holding changed. Reopen the event form.'; END IF;
 IF bid IS NOT NULL THEN
  SELECT * INTO b FROM public.finance_records WHERE id=bid AND user_id=owner;
  IF b.id IS NULL OR b.revision IS DISTINCT FROM (p_data->>'target_revision')::bigint THEN RAISE EXCEPTION 'The destination changed. Reopen the event form.'; END IF;
 END IF;
 SELECT max(occurred_on) INTO last_day FROM public.investment_history WHERE record_id IN(aid,bid) AND balance IS NOT NULL;
 IF day<last_day THEN RAISE EXCEPTION 'Choose a date on or after the latest balance update.'; END IF;
 result:=jsonb_build_object('ok',true,'id',item);
 IF action='dividend' THEN
  IF a.kind<>'Stock' OR b.kind IS DISTINCT FROM 'Cash' OR b.currency<>a.currency OR gross<=0 OR tax>gross OR reinvest>gross-tax OR (reinvest>0)<>(quantity>0) OR quantity>1e12 OR numerator<>0 OR denominator<>0 THEN RAISE EXCEPTION 'Check the dividend amounts and cash account.'; END IF;
  PERFORM public.record_investment_with_account(item,aid,'income',day,gross,NULL,memo,bid);
  IF tax>0 THEN PERFORM public.record_investment_with_account(tax_id,aid,'expense',day,tax,NULL,'Dividend withholding. '||left(memo,1950),bid); END IF;
  IF reinvest>0 THEN
   PERFORM public.record_asset_movement(jsonb_build_object('id',trade_id,'kind','buy','source_id',bid,'target_id',aid,'sent',reinvest,'received',quantity,'source_value',reinvest,'target_value',reinvest,'fee',0,'date',day,'notes','Dividend reinvestment. '||left(memo,1950)));
  END IF;
  result:=result||jsonb_build_object('gross',gross,'withholding',tax,'net',gross-tax,'residual_cash',gross-tax-reinvest,'tax_id',CASE WHEN tax>0 THEN tax_id END,'trade_id',CASE WHEN reinvest>0 THEN trade_id END);
 ELSE
  IF gross<>0 OR tax<>0 OR reinvest<>0 THEN RAISE EXCEPTION 'Check the investment event fields.'; END IF;
  history_setting:=coalesce(current_setting('finance.history_write',true),'0');PERFORM set_config('finance.history_write','1',true);
  IF action='split' THEN
   IF a.kind<>'Stock' OR bid IS NOT NULL OR numerator<=0 OR denominator<=0 OR a.quantity<=0 OR quantity<>0 THEN RAISE EXCEPTION 'Enter the new shares and old shares in the split ratio.'; END IF;
   next_quantity:=a.quantity*numerator/denominator;
   IF next_quantity<=0 OR next_quantity>1e12 OR a.amount*denominator/numerator>1e15 OR a.cost*denominator/numerator>1e15 THEN RAISE EXCEPTION 'Check the resulting share quantity.'; END IF;
   UPDATE public.finance_records SET quantity=next_quantity,amount=a.amount*denominator/numerator,cost=a.cost*denominator/numerator WHERE id=aid;
   INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,notes) VALUES(item,owner,aid,'valuation',day,0,a.quantity*a.amount,'Stock split. '||left(memo,1950));
   result:=result||jsonb_build_object('quantity',next_quantity,'total_cost',a.quantity*a.cost);
  ELSE
   IF b.id IS NULL OR aid=bid OR b.kind<>a.kind OR b.name<>a.name OR b.currency<>a.currency OR quantity<=0 OR quantity>a.quantity OR b.quantity+quantity>1e12 OR numerator<>0 OR denominator<>0 THEN RAISE EXCEPTION 'Transfer to the same security in another holding, using the same currency.'; END IF;
   total_value:=quantity*a.amount;
   UPDATE public.finance_records SET quantity=a.quantity-quantity WHERE id=aid;
   UPDATE public.finance_records SET quantity=b.quantity+quantity,cost=(b.quantity*b.cost+quantity*a.cost)/(b.quantity+quantity),amount=(b.quantity*b.amount+total_value)/(b.quantity+quantity) WHERE id=bid;
   INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,notes) VALUES(item,owner,aid,'withdrawal',day,total_value,(a.quantity-quantity)*a.amount,'Security transfer. '||left(memo,1950)),(trade_id,owner,bid,'contribution',day,total_value,b.quantity*b.amount+total_value,'Security transfer. '||left(memo,1950));
   result:=result||jsonb_build_object('quantity',quantity,'transferred_cost',quantity*a.cost);
  END IF;
  PERFORM set_config('finance.history_write',history_setting,true);
 END IF;
 INSERT INTO public.corporate_events VALUES(item,owner,aid,bid,action,day,p_data,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_corporate_event(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_corporate_event(jsonb) TO authenticated;
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders'));
-- Both new ledgers participate in the existing atomic owner-scoped recovery.
DO $$ DECLARE definition text; fn regprocedure; BEGIN
 definition:=pg_get_functiondef('public.finance_backup_tables()'::regprocedure);
 EXECUTE replace(definition,'''account_activity''','''account_reconciliations'',''corporate_events'',''account_activity''');
 -- Old verified backups legitimately predate the two new tables. Verify the
 -- unchanged signed payload first; treat only these absent tables as empty.
 FOREACH fn IN ARRAY ARRAY['public.preview_finance_restore(text)'::regprocedure,'public.register_verified_finance_backup(text,uuid)'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  definition:=replace(definition,'FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP','FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  IF tbl IN (''account_reconciliations'',''corporate_events'') AND backup->>''schema_version''=''59'' AND NOT (backup->''tables'' ? tbl) THEN CONTINUE; END IF;');
  definition:=replace(definition,'backup->>''schema_version''<>''59''','coalesce(backup->>''schema_version'','''') NOT IN (''59'',''67'')');
  definition:=replace(definition,'backup->>''schema_version'' IS DISTINCT FROM ''59''','coalesce(backup->>''schema_version'','''') NOT IN (''59'',''67'')');
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('public.export_finance_backup()'::regprocedure);
 EXECUTE replace(definition,'''schema_version'',59','''schema_version'',67');
 definition:=pg_get_functiondef('public.restore_finance_backup(text,text)'::regprocedure);
 EXECUTE replace(definition,'USING backup->''tables''->tbl','USING coalesce(backup->''tables''->tbl,''[]''::jsonb)');
END $$;
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',67,'record_revisions',true,'verified_restore',true)
$$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Optional country/region; existing owner RLS protects the preference.
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS country text DEFAULT ''
 CHECK (country = '' OR country IN ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'));
NOTIFY pgrst, 'reload schema';

-- Each owner may link one Telegram chat. The app sends a morning digest of
-- upcoming payments and a message after every saved action to that chat, and
-- the bot lets the owner add records with buttons. A short-lived link code
-- created in Settings ties the chat to the owner when they press Start.
-- Chat links are personal to the device, so they are not part of backups.
-- Apply after 074. No existing rows are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_subscriptions (
 user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 chat_id bigint UNIQUE,
 digest_enabled boolean NOT NULL DEFAULT true,
 actions_enabled boolean NOT NULL DEFAULT true,
 link_code text UNIQUE CHECK (link_code IS NULL OR link_code ~ '^[A-Z0-9]{8}$'),
 link_code_expires_at timestamptz,
 linked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage telegram subscription" ON public.telegram_subscriptions;
CREATE POLICY "Owners manage telegram subscription" ON public.telegram_subscriptions FOR ALL TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.telegram_subscriptions FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_subscriptions TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Interface font chosen in Settings; the web and mobile apps read the same
-- value. Existing owners keep Inter. Owner RLS already protects the row.
-- Apply after 075.
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS font text NOT NULL DEFAULT 'inter' CHECK (font IN ('inter','onest'));
NOTIFY pgrst, 'reload schema';

-- Permit direct deposit/security conversions using the existing atomic movement ledger.
CREATE OR REPLACE FUNCTION public.record_asset_movement(p_data jsonb) RETURNS jsonb
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
  IF action='buy' AND (a.kind NOT IN ('Cash','Deposit','Stock','Crypto') OR NOT b_units) THEN RAISE EXCEPTION 'Choose cash or crypto to buy a holding.'; END IF;
  IF action='sell' AND (NOT a_units OR b.kind NOT IN ('Cash','Deposit','Stock','Crypto')) THEN RAISE EXCEPTION 'Choose cash or crypto for the sale proceeds.'; END IF;
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
NOTIFY pgrst, 'reload schema';

-- Valuables: watches, jewellery, art, cars and similar tracked-value assets.
-- They behave like Property in the tracker (valuations and cash-only
-- contributions/withdrawals) but have no estimated income or trading.
-- Apply after 069. No existing rows are rewritten. Once Valuables records
-- exist, restoring the previous kind constraint would fail; delete or
-- reclassify them first.
BEGIN;

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE FUNCTION pg_temp.patch_valuables(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Valuations and opening balances are captured like other tracked holdings.
SELECT pg_temp.patch_valuables('public.capture_investment_balance()'::regprocedure,
 $old$'Property','Business','Money lent'$old$,$new$'Property','Business','Valuables','Money lent'$new$,1);

-- Tracker updates, with or without a linked cash account.
SELECT pg_temp.patch_valuables('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$'Property','Business','Money lent'$old$,$new$'Property','Business','Valuables','Money lent'$new$,1);
SELECT pg_temp.patch_valuables('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$r.kind NOT IN ('Business','Property') THEN$old$,$new$r.kind NOT IN ('Business','Property','Valuables') THEN$new$,1);
SELECT pg_temp.patch_valuables('public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid)'::regprocedure,
 $old$'Property','Business','Debt'$old$,$new$'Property','Business','Valuables','Debt'$new$,1);
SELECT pg_temp.patch_valuables('public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric)'::regprocedure,
 $old$'Property','Business','Debt'$old$,$new$'Property','Business','Valuables','Debt'$new$,1);
SELECT pg_temp.patch_valuables('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$r.kind NOT IN ('Business','Property') OR$old$,$new$r.kind NOT IN ('Business','Property','Valuables') OR$new$,1);

-- Asset lists and summaries; each valuable stays its own summary row.
SELECT pg_temp.patch_valuables('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'Deposit','Property','Business'))$old$,$new$'Deposit','Property','Business','Valuables'))$new$,2);
SELECT pg_temp.patch_valuables('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$CASE WHEN r.kind IN ('Business','Property') THEN r.id$old$,$new$CASE WHEN r.kind IN ('Business','Property','Valuables') THEN r.id$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Let owners undo three things that were previously permanent:
--  1. Savings goals move to Recently deleted with their activity and can be restored.
--  2. The newest tracker addition/repayment on a Loan, Debt or Money lent record can
--     be deleted, reversing its linked cash. Once only the starting snapshot remains,
--     the record itself can be deleted as before.
--  3. Deleting a transaction created by "Record payment" reopens its scheduled
--     reminder; restoring the transaction marks the reminder paid again.
-- Apply after 070. No existing rows are rewritten.
BEGIN;

ALTER TABLE public.deleted_items DROP CONSTRAINT IF EXISTS deleted_items_source_check;
ALTER TABLE public.deleted_items ADD CONSTRAINT deleted_items_source_check CHECK(source IN ('finance_records','expense_plans','savings_goals'));
ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS goal_events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(goal_events)='array');
ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS occurrences jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(occurrences)='array');

-- 1. Goals ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_savings_goal(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.savings_goals;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO g FROM public.savings_goals WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 -- Retries after a successful delete are harmless.
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
 INSERT INTO public.deleted_items(user_id,source,data,goal_events)
 VALUES(auth.uid(),'savings_goals',to_jsonb(g),
  (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_on,e.created_at,e.id),'[]'::jsonb) FROM public.goal_events e WHERE e.goal_id=g.id AND e.user_id=g.user_id));
 DELETE FROM public.savings_goals WHERE id=g.id AND user_id=auth.uid();
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_savings_goal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_savings_goal(uuid) TO authenticated;

-- 3. Scheduled payments ------------------------------------------------------
-- Runs after archive_deleted_record (trigger names fire alphabetically), so the
-- archive row already exists. Removing the occurrence reopens the reminder and
-- lets the transaction itself be deleted.
CREATE OR REPLACE FUNCTION public.archive_payment_occurrences() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN OLD; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payment_occurrences WHERE transaction_id=OLD.id AND user_id=OLD.user_id) THEN RETURN OLD; END IF;
 UPDATE public.deleted_items SET occurrences=(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM public.payment_occurrences o WHERE o.transaction_id=OLD.id AND o.user_id=OLD.user_id)
 WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=OLD.user_id AND source='finance_records' AND data->>'id'=OLD.id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 DELETE FROM public.payment_occurrences WHERE transaction_id=OLD.id AND user_id=OLD.user_id;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS archive_payment_occurrences ON public.finance_records;
CREATE TRIGGER archive_payment_occurrences BEFORE DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.archive_payment_occurrences();
REVOKE ALL ON FUNCTION public.archive_payment_occurrences() FROM PUBLIC,anon,authenticated;

-- Restore wrapper: goals are restored here; records keep the existing path and
-- then relink their scheduled occurrences when the schedule still exists.
CREATE OR REPLACE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_restore text; g public.savings_goals;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='savings_goals' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  g:=jsonb_populate_record(NULL::public.savings_goals,item.data);
  IF g.user_id<>auth.uid() THEN RAISE EXCEPTION 'Goal not found.'; END IF;
  IF EXISTS(SELECT 1 FROM public.savings_goals WHERE id=g.id) THEN RAISE EXCEPTION 'This goal already exists.'; END IF;
  IF g.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=g.account_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Restore the goal''s account first.'; END IF;
  INSERT INTO public.savings_goals SELECT (g).*;
  -- The allocation audit trigger adds a fresh opening row; keep the original history instead.
  DELETE FROM public.goal_events WHERE goal_id=g.id AND user_id=auth.uid();
  INSERT INTO public.goal_events(id,user_id,goal_id,operation_id,occurred_on,delta,balance,event_type,notes,source_id,source_name,created_at)
  SELECT e.id,e.user_id,e.goal_id,CASE WHEN EXISTS(SELECT 1 FROM public.goal_operations o WHERE o.id=e.operation_id) THEN e.operation_id END,
   e.occurred_on,e.delta,e.balance,e.event_type,e.notes,
   CASE WHEN EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=e.source_id) THEN e.source_id END,e.source_name,e.created_at
  FROM jsonb_populate_recordset(NULL::public.goal_events,item.goal_events) e WHERE e.user_id=auth.uid();
  DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
  RETURN;
 END IF;
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.restore_transaction','1',true);
 PERFORM public.restore_deleted_item_before_transaction_tools(p_id);
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 IF item.source='finance_records' AND jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;
 -- A due date recorded or skipped again meanwhile keeps its newer state.
 IF item.source='finance_records' AND jsonb_array_length(item.occurrences)>0 THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
  SELECT o.id,o.user_id,o.record_id,o.due_on,o.status,o.transaction_id
  FROM jsonb_populate_recordset(NULL::public.payment_occurrences,item.occurrences) o
  WHERE o.user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=o.record_id AND r.user_id=auth.uid())
   AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=o.transaction_id AND r.user_id=auth.uid())
  ON CONFLICT DO NOTHING;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.restore_deleted_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid) TO authenticated;

-- 2. Lending tracker updates -------------------------------------------------
CREATE FUNCTION pg_temp.patch_undo(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn);
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
SELECT pg_temp.patch_undo('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$ IF r.kind NOT IN ('Business','Property','Valuables') OR h.event_type NOT IN ('valuation','contribution','withdrawal') THEN RAISE EXCEPTION 'This history entry cannot be deleted here.'; END IF;$old$,
 $new$ IF NOT ((r.kind IN ('Business','Property','Valuables') AND h.event_type IN ('valuation','contribution','withdrawal'))
  OR (r.kind IN ('Money lent','Loan','Debt') AND h.event_type IN ('contribution','withdrawal'))) THEN RAISE EXCEPTION 'This history entry cannot be deleted here.'; END IF;
 -- Account repayments also write activity and interest records; they are undone from Accounts.
 IF EXISTS(SELECT 1 FROM public.account_activity WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'This repayment was recorded from Accounts and cannot be deleted here.'; END IF;$new$);
SELECT pg_temp.patch_undo('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$ IF link.id IS NOT NULL THEN UPDATE public.finance_records SET amount=amount-link.amount WHERE id=a.id AND user_id=auth.uid(); END IF;$old$,
 $new$ IF link.id IS NOT NULL THEN UPDATE public.finance_records SET amount=amount-link.amount WHERE id=a.id AND user_id=auth.uid(); END IF;
 -- Lending cash updates also wrote a mirrored cash-account entry in the same transaction.
 IF link.id IS NOT NULL AND r.kind IN ('Money lent','Loan','Debt') THEN
  DELETE FROM public.investment_history WHERE id=(SELECT id FROM public.investment_history WHERE record_id=a.id AND user_id=auth.uid()
   AND event_type=CASE WHEN link.amount<0 THEN 'withdrawal' ELSE 'contribution' END AND occurred_on=h.occurred_on AND amount=abs(link.amount)
   AND notes=h.notes AND created_at>=h.created_at AND created_at<h.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1);
 END IF;$new$);

NOTIFY pgrst,'reload schema';
COMMIT;

-- A savings goal could not be renamed, re-dated or have its plan saved once spending had
-- taken its cash account below the amount reserved: every save re-checked the whole
-- reservation. Only a reservation that grows or is reactivated is checked now,
-- so an over-reserved goal can still be corrected, reduced or archived.
-- Apply after 071. No existing rows are rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.patch_goal_edit(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn);
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
DO $$ DECLARE fn regprocedure; BEGIN
 FOREACH fn IN ARRAY ARRAY['public.planning_action(text,jsonb)'::regprocedure,'public.planning_action_with_actual_amount(text,jsonb)'::regprocedure] LOOP
  PERFORM pg_temp.patch_goal_edit(fn,
   $old$IF coalesce((p_data->>'archived')::boolean,false)=false AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;$old$,
   $new$IF coalesce((p_data->>'archived')::boolean,false)=false
    AND coalesce((p_data->>'allocated')::numeric,0)>coalesce((SELECT allocated FROM public.savings_goals WHERE id=item AND user_id=owner AND account_id=aid AND NOT archived),0)
    AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;$new$);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Optional day portfolio tracking begins; null tracks from the first investment activity.
BEGIN;
ALTER TABLE public.investment_comparison_preferences
 ADD COLUMN IF NOT EXISTS tracking_start date CHECK (tracking_start IS NULL OR tracking_start >= DATE '2016-01-01');
NOTIFY pgrst,'reload schema';
COMMIT;
-- The Telegram bot adds records with buttons. Its half-finished entry lives in
-- telegram_drafts until the owner saves or cancels. Saving goes through the
-- same functions the app uses, run as the linked owner: the wrappers below set
-- the owner claim for the transaction and hand off, so validation, revisions
-- and undo behave exactly as in the app. Only the service role may call them,
-- and only for an owner whose chat is linked.
-- Apply after 076. No existing rows are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_drafts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 step text NOT NULL CHECK (char_length(step) <= 40),
 data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data)='object' AND pg_column_size(data) <= 16384),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_drafts FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_drafts TO service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_subscriptions TO service_role;
END IF; END $$;

CREATE OR REPLACE FUNCTION public.telegram_owner_context(p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM public.telegram_subscriptions WHERE user_id=p_owner AND chat_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Telegram is not connected.';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',p_owner::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',p_owner,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
END $$;
REVOKE ALL ON FUNCTION public.telegram_owner_context(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.telegram_save_finance_record(p_owner uuid,p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.telegram_owner_context(p_owner);
 RETURN public.save_finance_record(p_record,NULL);
END $$;
REVOKE ALL ON FUNCTION public.telegram_save_finance_record(uuid,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.telegram_save_finance_record(uuid,jsonb) TO service_role; END IF; END $$;

CREATE OR REPLACE FUNCTION public.telegram_planning_action(p_owner uuid,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.telegram_owner_context(p_owner);
 IF p_action='occurrence' THEN RETURN public.planning_action_with_actual_amount(p_action,p_data); END IF;
 RETURN public.planning_action(p_action,p_data);
END $$;
REVOKE ALL ON FUNCTION public.telegram_planning_action(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.telegram_planning_action(uuid,text,jsonb) TO service_role; END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Welcome setup after the first sign-in (migration 078). Accounts that already
-- saved preferences count as set up; Settings can run the setup again.
BEGIN;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
UPDATE public.user_preferences SET onboarded_at=now() WHERE onboarded_at IS NULL;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Sixteen interface languages (migration 079). Existing rows keep their language.
BEGIN;
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_language_check;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_language_check
 CHECK (language IN ('en','es','es-MX','pt','fr','ru','ar','ur','hi','bn','zh','ja','ko','th','vi','uz'));
NOTIFY pgrst,'reload schema';
COMMIT;

-- Thirty interface languages (migration 080). Existing rows keep their language.
BEGIN;
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_language_check;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_language_check
 CHECK (language IN ('en','es','es-MX','pt','fr','ru','ar','ur','hi','bn','zh','ja','ko','th','vi','uz','de','it','tr','id','ms','pl','uk','nl','cs','ro','fa','he','fil','sw'));
NOTIFY pgrst,'reload schema';
COMMIT;

-- Accounts that start in Telegram (migration 081).
BEGIN;
ALTER TABLE public.telegram_subscriptions
 ADD COLUMN IF NOT EXISTS telegram_user_id bigint UNIQUE,
 ADD COLUMN IF NOT EXISTS phone text UNIQUE CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
 ADD COLUMN IF NOT EXISTS first_name text CHECK (first_name IS NULL OR char_length(first_name) <= 80),
 ADD COLUMN IF NOT EXISTS consented_at timestamptz;

REVOKE INSERT, UPDATE ON public.telegram_subscriptions FROM authenticated;
GRANT INSERT (user_id, digest_enabled, actions_enabled, link_code, link_code_expires_at, chat_id, linked_at, updated_at) ON public.telegram_subscriptions TO authenticated;
GRANT UPDATE (digest_enabled, actions_enabled, link_code, link_code_expires_at, chat_id, linked_at, updated_at) ON public.telegram_subscriptions TO authenticated;

CREATE TABLE IF NOT EXISTS public.telegram_login_tokens (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_login_tokens_expires_at ON public.telegram_login_tokens (expires_at);
ALTER TABLE public.telegram_login_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_login_tokens FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_login_tokens TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Optional rough monthly figure for variable income (migration 082).
ALTER TABLE public.income_sources
 ADD COLUMN approx_monthly numeric CHECK(approx_monthly>0 AND approx_monthly<=1e15),
 ADD CONSTRAINT income_sources_approx_variable_only CHECK(mode='variable' OR approx_monthly IS NULL);
CREATE FUNCTION pg_temp.patch_source(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); BEGIN
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
SELECT pg_temp.patch_source('public.save_income_source(jsonb)'::regprocedure,$old$schedule_id=EXCLUDED.schedule_id;$old$,$new$schedule_id=EXCLUDED.schedule_id,approx_monthly=EXCLUDED.approx_monthly;$new$);
NOTIFY pgrst,'reload schema';
COMMIT;
-- One-time Telegram celebrations (migration 083).
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_milestones (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 80),
 value numeric CHECK (value IS NULL OR abs(value) < 1e30),
 achieved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, key)
);
ALTER TABLE public.telegram_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_milestones FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_milestones TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Connecting a Telegram chat by signing in on the web (migration 084).
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_connect_requests (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 chat_id bigint NOT NULL,
 telegram_user_id bigint NOT NULL,
 first_name text CHECK (first_name IS NULL OR char_length(first_name) <= 80),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_connect_requests_chat_id ON public.telegram_connect_requests (chat_id);
CREATE INDEX IF NOT EXISTS telegram_connect_requests_expires_at ON public.telegram_connect_requests (expires_at);
ALTER TABLE public.telegram_connect_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_connect_requests FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_connect_requests TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Treasury bills held to maturity (migration 085).
-- Treasury bills: short-term government bills held to maturity. They behave
-- like a deposit: a balance, an annual yield that accrues without
-- compounding, a purchase date and a maturity reminder. They are not cash
-- balances, so transfers and asset movements stay limited to Cash and Deposit.
-- Apply after 084. No existing rows are rewritten. Once Treasury bill records
-- exist, restoring the previous kind constraint would fail; delete or
-- reclassify them first.
BEGIN;

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE FUNCTION pg_temp.patch_treasury_bills(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Opening balances and tracker updates, with or without a linked cash account.
SELECT pg_temp.patch_treasury_bills('public.capture_investment_balance()'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);
SELECT pg_temp.patch_treasury_bills('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);
SELECT pg_temp.patch_treasury_bills('public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid)'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);
SELECT pg_temp.patch_treasury_bills('public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric)'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);

-- The purchase date is an opening balance date.
SELECT pg_temp.patch_treasury_bills('public.guard_opening_balance_date()'::regprocedure,
 $old$('Cash','Deposit','Stock'$old$,$new$('Cash','Deposit','Treasury bill','Stock'$new$,1);

-- Asset lists and summaries.
SELECT pg_temp.patch_treasury_bills('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'Deposit','Property','Business','Valuables'))$old$,$new$'Deposit','Treasury bill','Property','Business','Valuables'))$new$,2);

-- A bill's maturity reminder can be dismissed like a deposit's.
SELECT pg_temp.patch_treasury_bills('public.planning_action(text,jsonb)'::regprocedure,
 $old$r.kind<>'Deposit' OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$new$,1);
SELECT pg_temp.patch_treasury_bills('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$r.kind<>'Deposit' OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Budgets: a monthly amount per category, with category settings
-- (Fixed / Flexible / Non-monthly, group, rollover, excluded), the budget
-- style (category or flex) and whether an edited amount also covers later months. `category_key` is a built-in kind such as
-- 'Rent expense', a custom category id, or 'flex:flexible' for the single
-- Flexible amount in flex mode. Amounts keep their own currency. A forward
-- amount covers every later month until the next saved amount.
-- Apply after 085. No existing rows are changed.
BEGIN;

CREATE TABLE public.budget_settings (
 user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'category' CHECK (mode IN ('category','flex')),
 apply_forward boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.budget_categories (
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 category_key text NOT NULL CHECK (length(category_key) BETWEEN 1 AND 80),
 budget_type text NOT NULL DEFAULT 'flexible' CHECK (budget_type IN ('fixed','flexible','non_monthly')),
 group_name text CHECK (group_name IS NULL OR length(trim(group_name)) BETWEEN 1 AND 60),
 rollover boolean NOT NULL DEFAULT false,
 rollover_start date CHECK (rollover_start IS NULL OR extract(day FROM rollover_start)=1),
 excluded boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,category_key)
);
CREATE TABLE public.budget_amounts (
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 category_key text NOT NULL CHECK (length(category_key) BETWEEN 1 AND 80),
 month date NOT NULL CHECK (extract(day FROM month)=1),
 amount numeric NOT NULL CHECK (amount>=0 AND amount<=1e15),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 applies_forward boolean NOT NULL DEFAULT false,
 PRIMARY KEY (user_id,category_key,month)
);
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_amounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage budget settings" ON public.budget_settings FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "Owners manage budget categories" ON public.budget_categories FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "Owners manage budget amounts" ON public.budget_amounts FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.budget_settings, public.budget_categories, public.budget_amounts FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.budget_settings, public.budget_categories, public.budget_amounts TO authenticated;

-- "This month only" keeps later months; "All future months" replaces them.
-- Replacing a forward amount for one month moves it on to the next month, so
-- the months after keep their budget. Mirrors setBudgetAmount in lib/budget.ts.
CREATE FUNCTION public.set_budget_amount(p_key text,p_month date,p_amount numeric,p_currency text,p_forward boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); existing public.budget_amounts;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'Budgets are set for whole months.'; END IF;
 SELECT * INTO existing FROM public.budget_amounts WHERE user_id=owner AND category_key=p_key AND month=p_month FOR UPDATE;
 IF p_forward THEN
  DELETE FROM public.budget_amounts WHERE user_id=owner AND category_key=p_key AND month>p_month;
 ELSIF existing.applies_forward THEN
  INSERT INTO public.budget_amounts(user_id,category_key,month,amount,currency,applies_forward)
  VALUES(owner,p_key,(p_month+interval '1 month')::date,existing.amount,existing.currency,true) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.budget_amounts(user_id,category_key,month,amount,currency,applies_forward)
 VALUES(owner,p_key,p_month,p_amount,p_currency,p_forward)
 ON CONFLICT (user_id,category_key,month) DO UPDATE SET amount=excluded.amount,currency=excluded.currency,applies_forward=excluded.applies_forward;
END $$;
REVOKE ALL ON FUNCTION public.set_budget_amount(text,date,numeric,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_budget_amount(text,date,numeric,text,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Transaction rules and category changes from the Transactions page.
-- A rule says: transactions whose name contains `pattern` belong in a
-- category. It is applied when it is saved (to matching past transactions,
-- on request) and to new bank-statement imports. Imports keep their
-- 'Other income' / 'Other expense' type, so only rules that pick a custom
-- category apply there. Manual entries keep the category the user chose.
-- set_transaction_category changes one or many transactions at once; it
-- skips generated rows, split rows and rows linked to a schedule, a business
-- or an income source, and returns how many it changed.
-- Apply after 086. No existing rows are changed.
BEGIN;

CREATE TABLE public.transaction_rules (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 pattern text NOT NULL CHECK (length(trim(pattern)) BETWEEN 1 AND 120),
 direction text NOT NULL CHECK (direction IN ('income','expense')),
 kind text NOT NULL CHECK (kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')),
 category_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,user_id),
 FOREIGN KEY (category_id,user_id) REFERENCES public.transaction_categories(id,user_id) ON DELETE CASCADE,
 CHECK (direction = CASE WHEN kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END),
 CHECK (category_id IS NULL OR kind IN ('Other income','Other expense'))
);
CREATE INDEX transaction_rules_owner ON public.transaction_rules(user_id,created_at);
ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage transaction rules" ON public.transaction_rules FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.transaction_rules FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.transaction_rules TO authenticated;

CREATE FUNCTION public.set_transaction_category(p_ids uuid[],p_kind text,p_category uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); incoming boolean; changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 incoming:=p_kind IN ('Salary','Rent income','Business income','Other income');
 IF p_category IS NOT NULL AND (p_kind NOT IN ('Other income','Other expense') OR NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=p_category AND user_id=owner AND direction=CASE WHEN incoming THEN 'income' ELSE 'expense' END)) THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category
 WHERE r.user_id=owner AND r.id=ANY(p_ids) AND r.frequency='Once'
  AND r.kind IN (SELECT unnest(CASE WHEN incoming THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END))
  AND (r.kind,r.custom_category_id) IS DISTINCT FROM (p_kind,p_category)
  AND r.movement_id IS NULL AND r.operation_id IS NULL AND r.mortgage_payment_id IS NULL AND r.history_event_id IS NULL
  AND r.business_id IS NULL AND r.income_source_id IS NULL AND r.earning_source_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.transaction_splits s WHERE s.record_id=r.id AND s.user_id=owner);
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.set_transaction_category(uuid[],text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_category(uuid[],text,uuid) TO authenticated;

-- Applies one rule to every matching past transaction of its direction.
CREATE FUNCTION public.apply_transaction_rule(p_rule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); rule public.transaction_rules; ids uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO rule FROM public.transaction_rules WHERE id=p_rule AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM (SELECT r.id FROM public.finance_records r WHERE r.user_id=owner AND r.frequency='Once'
  AND strpos(lower(r.name),lower(trim(rule.pattern)))>0
  AND r.kind IN (SELECT unnest(CASE WHEN rule.direction='income' THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END))
  LIMIT 500) matched;
 RETURN public.set_transaction_category(ids,rule.kind,rule.category_id);
END $$;
REVOKE ALL ON FUNCTION public.apply_transaction_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_transaction_rule(uuid) TO authenticated;

-- New statement rows take the newest matching custom-category rule.
CREATE FUNCTION public.classify_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT; existing rows are never reclassified.
 IF NEW.import_key IS NULL OR NEW.custom_category_id IS NOT NULL OR NEW.frequency<>'Once' OR NEW.kind NOT IN ('Other income','Other expense')
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1'
  OR EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 SELECT category_id INTO NEW.custom_category_id FROM public.transaction_rules
 WHERE user_id=NEW.user_id AND category_id IS NOT NULL AND kind=NEW.kind AND strpos(lower(NEW.name),lower(trim(pattern)))>0
 ORDER BY created_at DESC,id LIMIT 1;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.classify_imported_transaction() FROM PUBLIC, anon;
CREATE TRIGGER classify_imported_transaction BEFORE INSERT ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.classify_imported_transaction();

NOTIFY pgrst,'reload schema';
COMMIT;

-- Dashboard layout: the order of the dashboard cards and which are hidden,
-- saved as a workspace preference. Apply after 087. No rows are changed.
BEGIN;
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard'));
NOTIFY pgrst,'reload schema';
COMMIT;

-- Split parts may use a built-in category (stored in kind) as well as an
-- added one (category_id). Existing splits are unchanged. Apply after 089 (090 and 096 were never used).
BEGIN;
ALTER TABLE public.transaction_splits ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE public.transaction_splits ADD COLUMN kind text CHECK(kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));
ALTER TABLE public.transaction_splits ADD CONSTRAINT transaction_splits_one_category CHECK((category_id IS NULL)<>(kind IS NULL));

CREATE OR REPLACE FUNCTION public.save_transaction_splits(p_record uuid,p_splits jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records; part jsonb; n integer:=0; total numeric:=0; label text; incoming boolean;
 income_kinds text[]:=ARRAY['Salary','Rent income','Business income','Other income']; expense_kinds text[]:=ARRAY['Rent expense','Living expense','Charity','Other expense'];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.movement_id IS NOT NULL OR r.operation_id IS NOT NULL OR r.mortgage_payment_id IS NOT NULL OR r.history_event_id IS NOT NULL OR r.frequency<>'Once' OR NOT (r.kind=ANY(income_kinds||expense_kinds)) THEN RAISE EXCEPTION 'Choose an actual transaction.'; END IF;
 IF jsonb_typeof(p_splits) IS DISTINCT FROM 'array' OR jsonb_array_length(p_splits)>50 OR jsonb_array_length(p_splits)=1 THEN RAISE EXCEPTION 'Use at least two split categories, or clear the split.'; END IF;
 incoming:=r.kind=ANY(income_kinds);
 DELETE FROM public.transaction_splits WHERE record_id=r.id AND user_id=owner;
 FOR part IN SELECT value FROM jsonb_array_elements(p_splits) LOOP
  IF (part->>'amount') IS NULL OR (part->>'amount')::numeric<=0 OR (part->>'amount')::numeric>1e15 THEN RAISE EXCEPTION 'Check the split amounts.'; END IF;
  label:=part->>'category_id';
  IF label=ANY(income_kinds||expense_kinds) THEN
   IF (label=ANY(income_kinds))<>incoming THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
   INSERT INTO public.transaction_splits(record_id,user_id,position,kind,amount) VALUES(r.id,owner,n,label,(part->>'amount')::numeric);
  ELSE
   INSERT INTO public.transaction_splits(record_id,user_id,position,category_id,amount) VALUES(r.id,owner,n,label::uuid,(part->>'amount')::numeric);
  END IF;
  total:=total+(part->>'amount')::numeric;n:=n+1;
 END LOOP;
 IF n>0 AND total<>r.amount THEN RAISE EXCEPTION 'Split amounts must equal the transaction amount.'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

-- Recently deleted keeps either label, so restoring re-creates the same split.
CREATE OR REPLACE FUNCTION public.archive_transaction_splits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- A backup restore replaces rows wholesale; it never archives (restore guard, as on every financial trigger).
 IF public.finance_restore_active() THEN RETURN OLD; END IF;
 IF OLD.user_id=auth.uid() THEN
  UPDATE public.deleted_items SET splits=(SELECT coalesce(jsonb_agg(jsonb_build_object('category_id',coalesce(category_id::text,kind),'amount',amount) ORDER BY position),'[]'::jsonb) FROM public.transaction_splits WHERE record_id=OLD.id AND user_id=OLD.user_id)
  WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=OLD.user_id AND source='finance_records' AND data->>'id'=OLD.id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 END IF;
 RETURN OLD;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Accounts and categories keep the order the person drags them into, saved as
-- workspace preferences. New or renamed categories may not repeat another
-- category of the same type, or a built-in one, ignoring letter case; existing
-- duplicates are left as they are. Apply after 088. No rows are changed.
BEGIN;
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order'));

CREATE OR REPLACE FUNCTION public.reject_duplicate_category_name() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE builtin text[]:=CASE NEW.direction WHEN 'income' THEN ARRAY['salary','rent income','business income','other income'] ELSE ARRAY['rent expense','living expense','charity','other expense'] END;
BEGIN
 -- A backup restore brings back the rows exactly as they were saved.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND lower(trim(NEW.name))=lower(trim(OLD.name)) AND NEW.direction=OLD.direction THEN RETURN NEW; END IF;
 IF lower(trim(NEW.name))=ANY(builtin) OR EXISTS(SELECT 1 FROM public.transaction_categories c WHERE c.user_id=NEW.user_id AND c.direction=NEW.direction AND c.id<>NEW.id AND lower(trim(c.name))=lower(trim(NEW.name))) THEN
  RAISE EXCEPTION 'A category with this name already exists.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reject_duplicate_category_name ON public.transaction_categories;
CREATE TRIGGER reject_duplicate_category_name BEFORE INSERT OR UPDATE OF name,direction ON public.transaction_categories FOR EACH ROW EXECUTE FUNCTION public.reject_duplicate_category_name();
NOTIFY pgrst,'reload schema';
COMMIT;

-- Business tracking and tags for people who run a business.
-- * A Business record is also a business profile: legal structure, colour,
--   logo and notes. Any other record may belong to a business: accounts,
--   holdings, property and debts (its net assets) and transactions (its profit
--   and loss). Transactions keep any category; the business is a separate field.
-- * Rent from a property keeps its business (or takes the property's).
-- * set_transaction_business, set_account_business and set_transaction_tags
--   change many rows at once and return how many changed. Moving an account to
--   a business moves its transactions that followed the account's business.
-- * Rules may set a category, a business, tags, or any of them. A rule that
--   sets no category may match income and expenses alike ('any').
-- * Statement imports take their account's business, then the newest matching
--   rule's category, business and tags.
-- * Tags label transactions across categories and businesses.
-- Apply after 091. Existing rows keep their values.
BEGIN;

ALTER TABLE public.finance_records
 ADD COLUMN business_structure text CHECK (business_structure IN ('sole_proprietorship','llc','partnership','rental_property','other')),
 ADD COLUMN business_color text CHECK (business_color IN ('teal','blue','indigo','violet','pink','red','orange','amber','green','slate')),
 ADD COLUMN business_logo text CHECK (length(business_logo)<=60000 AND business_logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'),
 ADD CONSTRAINT finance_records_business_profile CHECK (kind='Business' OR (business_structure IS NULL AND business_color IS NULL AND business_logo IS NULL));

ALTER TABLE public.finance_records DROP CONSTRAINT finance_records_business_cashflow;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_business_cashflow CHECK (business_id IS NULL OR kind<>'Business');

CREATE OR REPLACE FUNCTION public.validate_income_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.finance_records; due date; month_start date;
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.frequency IS DISTINCT FROM OLD.frequency) AND EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=OLD.user_id AND income_source_id=OLD.id) THEN
  RAISE EXCEPTION 'This income source has linked records.';
 END IF;
 IF NEW.income_source_id IS NOT NULL THEN
  SELECT * INTO source FROM public.finance_records WHERE user_id=NEW.user_id AND id=NEW.income_source_id FOR SHARE;
  IF NOT FOUND OR source.id=NEW.id OR NOT ((NEW.kind='Rent income' AND source.kind='Property') OR (NEW.kind='Salary' AND NEW.frequency='Once' AND source.kind='Salary' AND source.frequency IN ('Monthly','Yearly') AND source.income_source_id IS NULL)) THEN
   RAISE EXCEPTION 'Choose a matching income source.';
  END IF;
  NEW.name:=source.name;
  NEW.business_id:=CASE WHEN NEW.kind='Salary' THEN source.business_id ELSE coalesce(NEW.business_id,source.business_id) END;
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
REVOKE ALL ON FUNCTION public.validate_income_source() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_finance_record(p_record jsonb,p_expected_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE existing public.finance_records; saved public.finance_records; payload jsonb; cols text; vals text; updates text; key text;
 allowed text[]:=ARRAY['id','name','kind','currency','amount','quantity','cost','rate','date','lent_date','frequency','notes','business_id','ownership_percentage','estimated_monthly_income','estimated_monthly_payment','expense_plan_id','end_date','account_id','custom_category_id','holding_account_id','deposit_compounding','opened_on','account_exchange_rate','account_rate_date','account_currency','income_source_id','income_due_on','earning_source_id','earning_due_on','payment_type','is_investment','business_structure','business_color','business_logo'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF jsonb_typeof(p_record)<>'object' OR p_record->>'id' IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 FOR key IN SELECT jsonb_object_keys(p_record) LOOP
  IF NOT key=ANY(allowed) THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 END LOOP;
 SELECT * INTO existing FROM public.finance_records WHERE id=(p_record->>'id')::uuid AND user_id=auth.uid() FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  -- Retrying an identical confirmed write is harmless, even after a lost response.
  IF to_jsonb(existing) @> p_record THEN RETURN jsonb_build_array(to_jsonb(existing)); END IF;
  IF p_expected_revision IS NULL OR existing.revision<>p_expected_revision THEN
   RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
  END IF;
 ELSIF p_expected_revision IS NOT NULL THEN
  RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
 END IF;
 payload:=p_record||jsonb_build_object('user_id',auth.uid());
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k),string_agg(format('%I=excluded.%I',k,k),',' ORDER BY k) FILTER(WHERE k NOT IN('id','user_id'))
 INTO cols,vals,updates FROM jsonb_object_keys(payload) k;
 EXECUTE format('INSERT INTO public.finance_records(%s) SELECT %s FROM jsonb_populate_record(NULL::public.finance_records,$1) r ON CONFLICT(id) DO UPDATE SET %s RETURNING *',cols,vals,updates) INTO saved USING payload;
 RETURN jsonb_build_array(to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.save_finance_record(jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_finance_record(jsonb,bigint) TO authenticated;

-- Tags
CREATE TABLE public.transaction_tags (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
 color text NOT NULL DEFAULT 'slate' CHECK (color IN ('teal','blue','indigo','violet','pink','red','orange','amber','green','slate')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,user_id)
);
CREATE UNIQUE INDEX transaction_tags_name ON public.transaction_tags(user_id,lower(trim(name)));
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage tags" ON public.transaction_tags FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.transaction_tags FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.transaction_tags TO authenticated;

CREATE TABLE public.transaction_tag_links (
 record_id uuid NOT NULL,
 tag_id uuid NOT NULL,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 PRIMARY KEY (record_id,tag_id),
 FOREIGN KEY (user_id,record_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY (tag_id,user_id) REFERENCES public.transaction_tags(id,user_id) ON DELETE CASCADE
);
CREATE INDEX transaction_tag_links_tag ON public.transaction_tag_links(user_id,tag_id);
ALTER TABLE public.transaction_tag_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read tag links" ON public.transaction_tag_links FOR SELECT TO authenticated USING (user_id=auth.uid());
REVOKE ALL ON public.transaction_tag_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transaction_tag_links TO authenticated;

-- Rows a bulk change may touch: recorded income and spending that is not generated from a tracker event.
CREATE FUNCTION public.is_editable_transaction(r public.finance_records) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT r.frequency='Once' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') AND r.history_event_id IS NULL
$$;

-- Categories and businesses are independent: a business transaction may move to any category.
-- Business income keeps its business, so only rows with one may move into it.
CREATE OR REPLACE FUNCTION public.recategorize_transactions(p_ids uuid[],p_kind text,p_category uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); incoming boolean; changed uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 incoming:=p_kind IN ('Salary','Rent income','Business income','Other income');
 IF p_category IS NOT NULL AND (p_kind NOT IN ('Other income','Other expense') OR NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=p_category AND user_id=owner AND direction=CASE WHEN incoming THEN 'income' ELSE 'expense' END)) THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 WITH moved AS (
  UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category
  WHERE r.user_id=owner AND r.id=ANY(p_ids) AND r.frequency='Once'
   AND r.kind IN (SELECT unnest(CASE WHEN incoming THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END))
   AND (r.kind,r.custom_category_id) IS DISTINCT FROM (p_kind,p_category)
   AND r.movement_id IS NULL AND r.operation_id IS NULL AND r.mortgage_payment_id IS NULL AND r.history_event_id IS NULL
   AND r.income_source_id IS NULL AND r.earning_source_id IS NULL
   AND (p_kind<>'Business income' OR r.business_id IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM public.transaction_splits s WHERE s.record_id=r.id AND s.user_id=owner)
  RETURNING r.id)
 SELECT coalesce(array_agg(id),'{}') INTO changed FROM moved;
 RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION public.set_transaction_category(p_ids uuid[],p_kind text,p_category uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT cardinality(public.recategorize_transactions(p_ids,p_kind,p_category)) $$;

-- A business, or none (household), for many transactions. Salary paid from an
-- income source follows its source; business income always names a business;
-- spending inside a monthly plan stays household spending.
CREATE FUNCTION public.assign_transaction_business(p_ids uuid[],p_business uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); changed uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Choose up to 500 transactions.'; END IF;
 IF p_business IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_business AND user_id=owner AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 WITH moved AS (
  UPDATE public.finance_records r SET business_id=p_business
  WHERE r.user_id=owner AND r.id=ANY(p_ids) AND public.is_editable_transaction(r)
   AND r.business_id IS DISTINCT FROM p_business AND r.earning_source_id IS NULL
   AND NOT (r.kind='Salary' AND r.income_source_id IS NOT NULL)
   AND (p_business IS NOT NULL OR r.kind<>'Business income')
   AND (p_business IS NULL OR r.expense_plan_id IS NULL)
  RETURNING r.id)
 SELECT coalesce(array_agg(id),'{}') INTO changed FROM moved;
 RETURN changed;
END $$;
CREATE FUNCTION public.set_transaction_business(p_ids uuid[],p_business uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT cardinality(public.assign_transaction_business(p_ids,p_business)) $$;

-- Puts an account, holding, property or debt in a business (or back in the
-- household). Its transactions that followed its old business follow it too.
CREATE FUNCTION public.set_account_business(p_account uuid,p_business uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); account public.finance_records; changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Property','Valuables','Money lent','Mortgage','Loan','Debt') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your accounts.'; END IF;
 IF p_business IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_business AND user_id=owner AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF account.business_id IS NOT DISTINCT FROM p_business THEN RETURN 0; END IF;
 UPDATE public.finance_records SET business_id=p_business WHERE id=account.id AND user_id=owner;
 WITH moved AS (
  UPDATE public.finance_records r SET business_id=p_business
  WHERE r.user_id=owner AND (r.account_id=account.id OR (account.kind='Property' AND r.kind='Rent income' AND r.income_source_id=account.id))
   AND public.is_editable_transaction(r) AND r.business_id IS NOT DISTINCT FROM account.business_id AND r.earning_source_id IS NULL
   AND NOT (r.kind='Salary' AND r.income_source_id IS NOT NULL)
   AND (p_business IS NOT NULL OR r.kind<>'Business income')
   AND (p_business IS NULL OR r.expense_plan_id IS NULL)
  RETURNING r.id)
 SELECT count(*) INTO changed FROM moved;
 RETURN changed;
END $$;

-- Adds and removes tags on many transactions; returns the transactions that changed.
CREATE FUNCTION public.tag_transactions(p_ids uuid[],p_add uuid[],p_remove uuid[]) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); added uuid[]; removed uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 OR coalesce(array_length(p_add,1),0)>20 OR coalesce(array_length(p_remove,1),0)>20 THEN RAISE EXCEPTION 'Choose up to 500 transactions and 20 tags.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_add,'{}')||coalesce(p_remove,'{}')) tag WHERE NOT EXISTS(SELECT 1 FROM public.transaction_tags t WHERE t.id=tag AND t.user_id=owner)) THEN RAISE EXCEPTION 'Choose one of your tags.'; END IF;
 WITH inserted AS (
  INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id)
  SELECT r.id,tag,owner FROM public.finance_records r CROSS JOIN unnest(coalesce(p_add,'{}')) tag
  WHERE r.user_id=owner AND r.id=ANY(p_ids) AND public.is_editable_transaction(r)
  ON CONFLICT DO NOTHING RETURNING record_id)
 SELECT coalesce(array_agg(DISTINCT record_id),'{}') INTO added FROM inserted;
 WITH deleted AS (
  DELETE FROM public.transaction_tag_links WHERE user_id=owner AND record_id=ANY(p_ids) AND tag_id=ANY(coalesce(p_remove,'{}')) RETURNING record_id)
 SELECT coalesce(array_agg(DISTINCT record_id),'{}') INTO removed FROM deleted;
 RETURN ARRAY(SELECT DISTINCT unnest(added||removed));
END $$;
CREATE FUNCTION public.set_transaction_tags(p_ids uuid[],p_add uuid[],p_remove uuid[]) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT cardinality(public.tag_transactions(p_ids,p_add,p_remove)) $$;

-- Rules: a category, a business, tags, or any of them.
ALTER TABLE public.transaction_rules
 DROP CONSTRAINT transaction_rules_direction_check,
 DROP CONSTRAINT transaction_rules_kind_check,
 DROP CONSTRAINT transaction_rules_check,
 DROP CONSTRAINT transaction_rules_check1,
 ALTER COLUMN kind DROP NOT NULL,
 ADD COLUMN business_id uuid,
 ADD COLUMN tag_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(tag_ids)<=10),
 ADD CONSTRAINT transaction_rules_direction CHECK (direction IN ('income','expense','any')),
 ADD CONSTRAINT transaction_rules_kind CHECK (kind IS NULL OR (kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') AND direction=CASE WHEN kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END)),
 ADD CONSTRAINT transaction_rules_custom_category CHECK (category_id IS NULL OR kind IN ('Other income','Other expense')),
 ADD CONSTRAINT transaction_rules_action CHECK (kind IS NOT NULL OR business_id IS NOT NULL OR cardinality(tag_ids)>0),
 ADD CONSTRAINT transaction_rules_business FOREIGN KEY (user_id,business_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE;

CREATE FUNCTION public.validate_transaction_rule() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.business_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.business_id AND user_id=NEW.user_id AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.tag_ids) tag WHERE NOT EXISTS(SELECT 1 FROM public.transaction_tags t WHERE t.id=tag AND t.user_id=NEW.user_id)) THEN RAISE EXCEPTION 'Choose one of your tags.'; END IF;
 NEW.tag_ids:=ARRAY(SELECT DISTINCT unnest(NEW.tag_ids));
 RETURN NEW;
END $$;
CREATE TRIGGER validate_transaction_rule BEFORE INSERT OR UPDATE ON public.transaction_rules FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_rule();

-- A deleted tag leaves the rules that added it.
CREATE FUNCTION public.forget_deleted_tag() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 DELETE FROM public.transaction_rules WHERE user_id=OLD.user_id AND kind IS NULL AND business_id IS NULL AND tag_ids=ARRAY[OLD.id];
 UPDATE public.transaction_rules SET tag_ids=array_remove(tag_ids,OLD.id) WHERE user_id=OLD.user_id AND OLD.id=ANY(tag_ids);
 RETURN OLD;
END $$;
CREATE TRIGGER forget_deleted_tag BEFORE DELETE ON public.transaction_tags FOR EACH ROW EXECUTE FUNCTION public.forget_deleted_tag();

-- Applies one rule to its matching past transactions (newest 500) and returns how many changed.
CREATE OR REPLACE FUNCTION public.apply_transaction_rule(p_rule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); rule public.transaction_rules; ids uuid[]; changed uuid[]:='{}';
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO rule FROM public.transaction_rules WHERE id=p_rule AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM (SELECT r.id FROM public.finance_records r WHERE r.user_id=owner AND r.frequency='Once'
  AND strpos(lower(r.name),lower(trim(rule.pattern)))>0
  AND r.kind IN (SELECT unnest(CASE rule.direction WHEN 'income' THEN ARRAY['Salary','Rent income','Business income','Other income'] WHEN 'expense' THEN ARRAY['Rent expense','Living expense','Charity','Other expense'] ELSE ARRAY['Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'] END))
  ORDER BY r.date DESC,r.id LIMIT 500) matched;
 IF rule.kind IS NOT NULL THEN changed:=changed||public.recategorize_transactions(ids,rule.kind,rule.category_id); END IF;
 IF rule.business_id IS NOT NULL THEN changed:=changed||public.assign_transaction_business(ids,rule.business_id); END IF;
 IF cardinality(rule.tag_ids)>0 THEN changed:=changed||public.tag_transactions(ids,rule.tag_ids,'{}'); END IF;
 RETURN (SELECT count(DISTINCT id) FROM unnest(changed) id);
END $$;

-- New statement rows: the account's business, then the newest matching rule for each of category and business.
CREATE OR REPLACE FUNCTION public.classify_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE dir text; rule_business uuid;
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT; existing rows are never reclassified.
 IF NEW.import_key IS NULL OR NEW.frequency<>'Once'
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1'
  OR EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 dir:=CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END;
 IF dir IS NULL THEN RETURN NEW; END IF;
 IF NEW.business_id IS NULL AND NEW.account_id IS NOT NULL AND NEW.expense_plan_id IS NULL THEN
  SELECT business_id INTO NEW.business_id FROM public.finance_records WHERE id=NEW.account_id AND user_id=NEW.user_id;
 END IF;
 IF NEW.custom_category_id IS NULL AND NEW.kind IN ('Other income','Other expense') THEN
  SELECT category_id INTO NEW.custom_category_id FROM public.transaction_rules
  WHERE user_id=NEW.user_id AND category_id IS NOT NULL AND kind=NEW.kind AND strpos(lower(NEW.name),lower(trim(pattern)))>0
  ORDER BY created_at DESC,id LIMIT 1;
 END IF;
 IF NEW.expense_plan_id IS NULL THEN
  SELECT business_id INTO rule_business FROM public.transaction_rules
  WHERE user_id=NEW.user_id AND business_id IS NOT NULL AND direction IN ('any',dir) AND strpos(lower(NEW.name),lower(trim(pattern)))>0
  ORDER BY created_at DESC,id LIMIT 1;
  IF rule_business IS NOT NULL THEN NEW.business_id:=rule_business; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.classify_imported_transaction() FROM PUBLIC, anon;

CREATE FUNCTION public.tag_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.import_key IS NULL OR NEW.frequency<>'Once'
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id)
 SELECT DISTINCT NEW.id,tag,NEW.user_id FROM public.transaction_rules rule CROSS JOIN unnest(rule.tag_ids) tag
 WHERE rule.user_id=NEW.user_id AND strpos(lower(NEW.name),lower(trim(rule.pattern)))>0
  AND rule.direction IN ('any',CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tag_imported_transaction() FROM PUBLIC, anon;
CREATE TRIGGER tag_imported_transaction AFTER INSERT ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.tag_imported_transaction();

REVOKE ALL ON FUNCTION public.is_editable_transaction(public.finance_records),public.recategorize_transactions(uuid[],text,uuid),public.assign_transaction_business(uuid[],uuid),public.tag_transactions(uuid[],uuid[],uuid[]),public.set_transaction_business(uuid[],uuid),public.set_account_business(uuid,uuid),public.set_transaction_tags(uuid[],uuid[],uuid[]),public.validate_transaction_rule(),public.forget_deleted_tag() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_editable_transaction(public.finance_records),public.recategorize_transactions(uuid[],text,uuid),public.assign_transaction_business(uuid[],uuid),public.tag_transactions(uuid[],uuid[],uuid[]),public.set_transaction_business(uuid[],uuid),public.set_account_business(uuid,uuid),public.set_transaction_tags(uuid[],uuid[],uuid[]) TO authenticated;

ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order','business_order','tag_order','tax_lines'));

NOTIFY pgrst,'reload schema';
COMMIT;

-- Rule criteria: besides words in the name, a rule may require an exact name,
-- an account, a business, a category or an amount range.
-- * A rule needs at least one criterion; the name may be left empty when another is set.
-- * transaction_rule_matches is the one test shared by applying a rule to past
--   transactions and by classifying and tagging statement imports.
-- * The category criterion follows the rule's direction; a deleted account,
--   business or category takes the rules that named it along.
-- Apply after 092. Existing rules keep matching names that contain their words.
BEGIN;

ALTER TABLE public.transaction_rules
 DROP CONSTRAINT transaction_rules_pattern_check,
 ADD COLUMN match text NOT NULL DEFAULT 'contains' CHECK (match IN ('contains','exact')),
 ADD COLUMN account_id uuid,
 ADD COLUMN match_business_id uuid,
 ADD COLUMN match_kind text CHECK (match_kind IS NULL OR match_kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')),
 ADD COLUMN match_category_id uuid,
 ADD COLUMN amount_min numeric CHECK (amount_min IS NULL OR amount_min>=0),
 ADD COLUMN amount_max numeric,
 ADD CONSTRAINT transaction_rules_pattern CHECK (length(trim(pattern))<=120),
 ADD CONSTRAINT transaction_rules_criteria CHECK (length(trim(pattern))>0 OR account_id IS NOT NULL OR match_business_id IS NOT NULL OR match_kind IS NOT NULL OR amount_min IS NOT NULL OR amount_max IS NOT NULL),
 ADD CONSTRAINT transaction_rules_match_category CHECK (match_category_id IS NULL OR match_kind IN ('Other income','Other expense')),
 ADD CONSTRAINT transaction_rules_match_direction CHECK (match_kind IS NULL OR direction='any' OR direction=CASE WHEN match_kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END),
 ADD CONSTRAINT transaction_rules_amount_range CHECK (amount_max IS NULL OR amount_max>=coalesce(amount_min,0)),
 ADD CONSTRAINT transaction_rules_account FOREIGN KEY (user_id,account_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 ADD CONSTRAINT transaction_rules_match_business FOREIGN KEY (user_id,match_business_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 ADD CONSTRAINT transaction_rules_match_category_owner FOREIGN KEY (match_category_id,user_id) REFERENCES public.transaction_categories(id,user_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.validate_transaction_rule() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.business_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.business_id AND user_id=NEW.user_id AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF NEW.match_business_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.match_business_id AND user_id=NEW.user_id AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.account_id AND user_id=NEW.user_id AND kind='Cash') THEN RAISE EXCEPTION 'Choose one of your accounts.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.tag_ids) tag WHERE NOT EXISTS(SELECT 1 FROM public.transaction_tags t WHERE t.id=tag AND t.user_id=NEW.user_id)) THEN RAISE EXCEPTION 'Choose one of your tags.'; END IF;
 NEW.tag_ids:=ARRAY(SELECT DISTINCT unnest(NEW.tag_ids));
 RETURN NEW;
END $$;

-- Whether a rule's criteria hold for a transaction. The direction is checked by the caller.
CREATE FUNCTION public.transaction_rule_matches(rule public.transaction_rules,r public.finance_records) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE rule.match WHEN 'exact' THEN lower(trim(r.name))=lower(trim(rule.pattern)) ELSE strpos(lower(r.name),lower(trim(rule.pattern)))>0 END
  AND (rule.account_id IS NULL OR r.account_id IS NOT DISTINCT FROM rule.account_id)
  AND (rule.match_business_id IS NULL OR r.business_id IS NOT DISTINCT FROM rule.match_business_id)
  AND (rule.match_kind IS NULL OR (r.kind=rule.match_kind AND r.custom_category_id IS NOT DISTINCT FROM rule.match_category_id))
  AND (rule.amount_min IS NULL OR r.amount>=rule.amount_min)
  AND (rule.amount_max IS NULL OR r.amount<=rule.amount_max)
$$;

-- Applies one rule to its matching past transactions (newest 500) and returns how many changed.
CREATE OR REPLACE FUNCTION public.apply_transaction_rule(p_rule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); rule public.transaction_rules; ids uuid[]; changed uuid[]:='{}';
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO rule FROM public.transaction_rules WHERE id=p_rule AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM (SELECT r.id FROM public.finance_records r WHERE r.user_id=owner AND r.frequency='Once'
  AND public.transaction_rule_matches(rule,r)
  AND r.kind IN (SELECT unnest(CASE rule.direction WHEN 'income' THEN ARRAY['Salary','Rent income','Business income','Other income'] WHEN 'expense' THEN ARRAY['Rent expense','Living expense','Charity','Other expense'] ELSE ARRAY['Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'] END))
  ORDER BY r.date DESC,r.id LIMIT 500) matched;
 IF rule.kind IS NOT NULL THEN changed:=changed||public.recategorize_transactions(ids,rule.kind,rule.category_id); END IF;
 IF rule.business_id IS NOT NULL THEN changed:=changed||public.assign_transaction_business(ids,rule.business_id); END IF;
 IF cardinality(rule.tag_ids)>0 THEN changed:=changed||public.tag_transactions(ids,rule.tag_ids,'{}'); END IF;
 RETURN (SELECT count(DISTINCT id) FROM unnest(changed) id);
END $$;

-- New statement rows: the account's business, then the newest matching rule for each of category and business.
CREATE OR REPLACE FUNCTION public.classify_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE dir text; rule_business uuid;
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT; existing rows are never reclassified.
 IF NEW.import_key IS NULL OR NEW.frequency<>'Once'
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1'
  OR EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 dir:=CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END;
 IF dir IS NULL THEN RETURN NEW; END IF;
 IF NEW.business_id IS NULL AND NEW.account_id IS NOT NULL AND NEW.expense_plan_id IS NULL THEN
  SELECT business_id INTO NEW.business_id FROM public.finance_records WHERE id=NEW.account_id AND user_id=NEW.user_id;
 END IF;
 IF NEW.custom_category_id IS NULL AND NEW.kind IN ('Other income','Other expense') THEN
  SELECT rule.category_id INTO NEW.custom_category_id FROM public.transaction_rules rule
  WHERE rule.user_id=NEW.user_id AND rule.category_id IS NOT NULL AND rule.kind=NEW.kind AND public.transaction_rule_matches(rule,NEW)
  ORDER BY rule.created_at DESC,rule.id LIMIT 1;
 END IF;
 IF NEW.expense_plan_id IS NULL THEN
  SELECT rule.business_id INTO rule_business FROM public.transaction_rules rule
  WHERE rule.user_id=NEW.user_id AND rule.business_id IS NOT NULL AND rule.direction IN ('any',dir) AND public.transaction_rule_matches(rule,NEW)
  ORDER BY rule.created_at DESC,rule.id LIMIT 1;
  IF rule_business IS NOT NULL THEN NEW.business_id:=rule_business; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.classify_imported_transaction() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.tag_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.import_key IS NULL OR NEW.frequency<>'Once'
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id)
 SELECT DISTINCT NEW.id,tag,NEW.user_id FROM public.transaction_rules rule CROSS JOIN unnest(rule.tag_ids) tag
 WHERE rule.user_id=NEW.user_id AND public.transaction_rule_matches(rule,NEW)
  AND rule.direction IN ('any',CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tag_imported_transaction() FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.transaction_rule_matches(public.transaction_rules,public.finance_records) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transaction_rule_matches(public.transaction_rules,public.finance_records) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Receipt and document attachments on transaction records.
-- * Files live in the private Storage bucket `attachments` at
--   `<owner>/<record>/<attachment>.<ext>`; record_attachments keeps one row per file.
-- * Up to 20 files of 10 MB each per record: JPEG, PNG, WebP, HEIC/HEIF or PDF.
-- * The rows have no foreign key to finance_records, so a transaction moved to
--   Recently deleted keeps its attachments and gets them back when restored.
--   Deleting it permanently removes the rows, and permanently_delete_item
--   returns their paths so the app removes the files.
-- * The storage policies are created only where Supabase Storage is installed.
-- Apply after 093.
BEGIN;

CREATE TABLE public.record_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL,
 path text NOT NULL UNIQUE,
 file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
 mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf')),
 size integer NOT NULL CHECK (size>0 AND size<=10485760),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT record_attachments_path CHECK (path=user_id::text||'/'||record_id::text||'/'||id::text||'.'||CASE mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'application/pdf' THEN 'pdf' ELSE 'heic' END)
);
CREATE INDEX record_attachments_owner_record ON public.record_attachments(user_id,record_id,created_at);
ALTER TABLE public.record_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read attachments" ON public.record_attachments FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Owners attach to their records" ON public.record_attachments FOR INSERT TO authenticated
 WITH CHECK (user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=record_id AND r.user_id=auth.uid()));
CREATE POLICY "Owners remove attachments" ON public.record_attachments FOR DELETE TO authenticated USING (user_id=auth.uid());
REVOKE ALL ON public.record_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.record_attachments TO authenticated;

CREATE FUNCTION public.limit_record_attachments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.record_id::text,94));
 IF (SELECT count(*) FROM public.record_attachments WHERE user_id=NEW.user_id AND record_id=NEW.record_id)>=20 THEN
  RAISE EXCEPTION 'A transaction can have up to 20 attachments.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_record_attachments() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER limit_record_attachments BEFORE INSERT ON public.record_attachments FOR EACH ROW EXECUTE FUNCTION public.limit_record_attachments();

-- Attachments whose record is neither active nor in Recently deleted are forgotten; their paths are returned for file removal.
CREATE FUNCTION public.forget_orphan_attachments(owner uuid) RETURNS text[] LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH gone AS (
  DELETE FROM public.record_attachments a WHERE a.user_id=owner
   AND NOT EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=a.record_id AND r.user_id=owner)
   AND NOT EXISTS(SELECT 1 FROM public.deleted_items d WHERE d.user_id=owner AND d.source='finance_records' AND d.data->>'id'=a.record_id::text)
  RETURNING a.path)
 SELECT coalesce(array_agg(path ORDER BY path),'{}') FROM gone
$$;
REVOKE ALL ON FUNCTION public.forget_orphan_attachments(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.permanently_delete_item(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 DELETE FROM public.deleted_items WHERE id=p_id AND user_id=owner;
 RETURN jsonb_build_object('ok',true,'paths',to_jsonb(public.forget_orphan_attachments(owner)));
END $$;
REVOKE ALL ON FUNCTION public.permanently_delete_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_item(uuid) TO authenticated;

-- The private bucket and its policies: each owner reads, adds and removes files in their own folder only.
DO $storage$
BEGIN
 IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('attachments','attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
 ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
 DROP POLICY IF EXISTS "Owners read their attachments" ON storage.objects;
 DROP POLICY IF EXISTS "Owners upload attachments to their records" ON storage.objects;
 DROP POLICY IF EXISTS "Owners remove their attachments" ON storage.objects;
 CREATE POLICY "Owners read their attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
 CREATE POLICY "Owners upload attachments to their records" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attachments' AND (storage.foldername(name))[1]=auth.uid()::text
   AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id::text=(storage.foldername(objects.name))[2] AND r.user_id=auth.uid()));
 CREATE POLICY "Owners remove their attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
END $storage$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Subscriptions: what the owner decided about a subscription detected from their charges.
-- * Detection itself runs on recorded transactions; only the decision is stored.
-- * One row per merchant (as normalised by the app) and currency.
-- * 'dismissed' means "Not a subscription"; 'cancelled' hides it until it is charged after decided_on.
-- * Removing the row restores the subscription. Records are never changed.
-- Apply after 093.
BEGIN;

CREATE TABLE public.subscription_decisions (
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 merchant text NOT NULL CHECK (length(btrim(merchant)) BETWEEN 1 AND 120),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 status text NOT NULL CHECK (status IN ('dismissed','cancelled')),
 decided_on date NOT NULL DEFAULT current_date,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,merchant,currency)
);
ALTER TABLE public.subscription_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage subscription decisions" ON public.subscription_decisions FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.subscription_decisions FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.subscription_decisions TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Budget rollover funds: a starting balance (in its own currency) carried
-- into the fund's start month, and whether overspending carries into the
-- next month as a negative amount (on by default, as before) or resets the
-- fund to zero. The Flexible bucket's rollover is saved as the
-- 'flex:flexible' row. Existing owner RLS on budget_categories applies.
-- Budgets join the verified backup and restore. Backups made before this
-- migration have no budget tables; restoring one keeps the current budget.
-- Apply after 093. No existing rows are changed.
BEGIN;

ALTER TABLE public.budget_categories
 ADD COLUMN rollover_balance numeric NOT NULL DEFAULT 0 CHECK (rollover_balance>=0 AND rollover_balance<=1e15),
 ADD COLUMN rollover_currency text CHECK (rollover_currency IS NULL OR rollover_currency ~ '^[A-Z]{3}$'),
 ADD COLUMN rollover_negative boolean NOT NULL DEFAULT true,
 ADD CONSTRAINT budget_categories_rollover_currency CHECK (rollover_balance=0 OR rollover_currency IS NOT NULL);

-- Budget writes take the same owner lock as restore, like every backed-up table.
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.budget_settings FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.budget_categories FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.budget_amounts FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();

DO $$ DECLARE definition text; fn regprocedure; BEGIN
 definition:=pg_get_functiondef('public.finance_backup_tables()'::regprocedure);
 EXECUTE replace(definition,'''account_activity''','''account_activity'',''budget_amounts'',''budget_categories'',''budget_settings''');
 -- A signed backup from before budgets were included has no budget tables: accept it.
 FOREACH fn IN ARRAY ARRAY['public.preview_finance_restore(text)'::regprocedure,'public.register_verified_finance_backup(text,uuid)'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  definition:=replace(definition,'FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP','FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  IF tbl IN (''budget_amounts'',''budget_categories'',''budget_settings'') AND NOT (backup->''tables'' ? tbl) THEN CONTINUE; END IF;');
  EXECUTE definition;
 END LOOP;
 -- Restoring such a backup leaves the current budget as it is rather than emptying it.
 definition:=pg_get_functiondef('public.restore_finance_backup(text,text)'::regprocedure);
 EXECUTE replace(definition,'LOOP EXECUTE format(''DELETE FROM public.%I WHERE user_id=$1'',tbl)','LOOP CONTINUE WHEN tbl IN (''budget_amounts'',''budget_categories'',''budget_settings'') AND NOT (backup->''tables'' ? tbl); EXECUTE format(''DELETE FROM public.%I WHERE user_id=$1'',tbl)');
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Transaction rules join the signed backup, with everything they name.
-- * Rules keep their criteria (093): exact or contained name, account, business,
--   category and amount range, and the category, business and tags they set.
-- * Tags and tag links come too: rules name tags, and without them a restore
--   would drop the labels on restored transactions.
-- * The backup table list is extended rather than rewritten, so other tables
--   added to backups by other migrations stay in it whichever runs last.
-- * Backups downloaded before this change have no such tables; they still
--   preview and restore, with no rules, tags or tag links.
-- Apply after 093. No rows are changed.
BEGIN;

DO $$ DECLARE added text[]:=ARRAY['transaction_tags','transaction_tag_links','transaction_rules']; tables text[]; BEGIN
 tables:=public.finance_backup_tables()||ARRAY(SELECT name FROM unnest(added) name WHERE NOT name=ANY(public.finance_backup_tables()));
 EXECUTE format('CREATE OR REPLACE FUNCTION public.finance_backup_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $list$ SELECT %L::text[] $list$',tables);
END $$;

-- As for every backup table (059): foreign keys are checked at the end of a restore.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT c.conrelid::regclass AS tbl,c.conname,c.condeferred,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE c.contype='f' AND NOT c.condeferrable AND n.nspname='public' AND r.relname IN ('transaction_tags','transaction_tag_links','transaction_rules') LOOP
  IF item.definition LIKE '%ON DELETE RESTRICT%' THEN
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.tbl,item.conname);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',item.tbl,item.conname,replace(item.definition,'ON DELETE RESTRICT','ON DELETE NO ACTION'));
  END IF;
  EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY %s',item.tbl,item.conname,CASE WHEN item.condeferred THEN 'DEFERRED' ELSE 'IMMEDIATE' END);
 END LOOP;
END $$;

-- As for every backup table (062): their triggers stand aside during a restore,
-- and ordinary writes take the owner's restore lock.
DO $$ DECLARE item record; definition text; tbl text; BEGIN
 FOR item IN SELECT DISTINCT p.oid,l.lanname FROM pg_trigger t
  JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
  JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='public' AND r.relname IN ('transaction_tags','transaction_tag_links','transaction_rules') AND NOT t.tgisinternal
   AND p.proname<>'serialize_finance_owner_write' AND position('public.finance_restore_active()' in p.prosrc)=0
 LOOP
  IF item.lanname<>'plpgsql' THEN RAISE EXCEPTION 'Restore guard requires a PL/pgSQL trigger.'; END IF;
  definition:=pg_get_functiondef(item.oid);
  definition:=regexp_replace(definition,'\mBEGIN\M',
   'BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL=''STATEMENT'' THEN RETURN NULL; ELSIF TG_OP=''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;', 'i');
  EXECUTE definition;
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['transaction_tags','transaction_tag_links','transaction_rules'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||tbl)::regclass AND tgname='serialize_owner_write') THEN
   EXECUTE format('CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write()',tbl);
  END IF;
 END LOOP;
END $$;

-- A table missing from an older backup reads as empty. Present tables are still
-- checked to be lists of the owner's rows, and the backup must still be verified.
DO $$ DECLARE fn regprocedure; definition text; BEGIN
 FOREACH fn IN ARRAY ARRAY['public.preview_finance_restore(text)','public.restore_finance_backup(text,text)','public.register_verified_finance_backup(text,uuid)']::regprocedure[] LOOP
  definition:=pg_get_functiondef(fn);
  IF position($q$backup->'tables'->tbl$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected backup function %',fn; END IF;
  EXECUTE replace(definition,$q$backup->'tables'->tbl$q$,$q$coalesce(backup->'tables'->tbl,'[]'::jsonb)$q$);
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Bot payments across currencies.
-- telegram_payment_with_fx lets the bot pay a loan or mortgage from a cash
-- account in another currency through the app's own dated-rate functions,
-- as the linked owner, callable only by the service role.
-- Apply after 094.
BEGIN;
CREATE OR REPLACE FUNCTION public.telegram_payment_with_fx(p_owner uuid,p_action text,p_data jsonb,p_rate numeric,p_rate_date date,p_account_currency text,p_record_currency text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE principal numeric:=(p_data->>'amount')::numeric; interest numeric:=coalesce((p_data->>'fee')::numeric,0);
BEGIN
 PERFORM public.telegram_owner_context(p_owner);
 IF p_action='repayment' THEN RETURN public.record_repayment_with_fx(p_data,p_rate,p_rate_date,p_account_currency,p_record_currency); END IF;
 IF p_action='mortgage' THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=(p_data->>'target_id')::uuid AND user_id=p_owner AND kind='Mortgage') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
  RETURN public.record_investment_with_fx((p_data->>'id')::uuid,(p_data->>'target_id')::uuid,'mortgage_payment',(p_data->>'date')::date,principal+interest,NULL,coalesce(p_data->>'notes',''),(p_data->>'account_id')::uuid,p_rate,p_rate_date,p_account_currency,p_record_currency,principal,interest);
 END IF;
 RAISE EXCEPTION 'Check the account fields.';
END $$;
REVOKE ALL ON FUNCTION public.telegram_payment_with_fx(uuid,text,jsonb,numeric,date,text,text) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.telegram_payment_with_fx(uuid,text,jsonb,numeric,date,text,text) TO service_role; END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Households: an owner shares their finances with up to five other people.
-- * Access lives in the database. household_members says who may read an
--   owner's workspace ('member' and 'viewer') and who may change it ('member').
--   can_read_owner() and can_write_owner() answer that for the signed-in person.
-- * A request names the workspace it works on with the x-workspace-owner header
--   (request.headers). active_owner() returns that owner only when the caller
--   belongs to their household, the caller's own id without the header, and
--   refuses otherwise, so removing a member revokes access on the next request.
-- * Shared tables read and write the active workspace: their policies, column
--   defaults and the functions that act on them use active_owner() instead of
--   auth.uid(). Restrictive policies and a row trigger refuse any write to an
--   owner's rows unless the caller may change that workspace, including writes
--   made inside SECURITY DEFINER functions. Viewers can never write.
-- * Personal tables stay with auth.uid(): preferences, Telegram, backups and
--   restore points, app activity. So do backup export and restore.
-- * Invites are single-use links that expire after seven days; only a SHA-256
--   hash of the token is stored.
-- * finance_records.member_id records who paid; it defaults to the person who
--   created the record and only ever names the owner or a household member.
-- * New shared tables must be added to shared_workspace_tables() and new
--   functions on them must use active_owner(); tests/households-sql.mjs checks.
-- Apply after every earlier migration.
BEGIN;

CREATE TABLE public.household_members (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('member','viewer')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_id,member_id),
 CHECK (owner_id<>member_id)
);
CREATE INDEX household_members_member ON public.household_members(member_id);
CREATE TABLE public.household_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 role text NOT NULL CHECK (role IN ('member','viewer')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz, accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 revoked_at timestamptz
);
CREATE INDEX household_invites_owner ON public.household_invites(owner_id,created_at);
-- Only the functions below touch these tables.
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.household_members, public.household_invites FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.shared_workspace_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT ARRAY['account_activity','account_reconciliations','asset_movements','budget_amounts','budget_categories','budget_settings',
  'corporate_events','deleted_items','deleted_tracker_updates','expense_plan_versions','expense_plans','finance_records',
  'forecast_assignments','goal_events','goal_operations','holding_accounts','import_batch_items','import_batches','income_sources',
  'investment_account_links','investment_comparison_baselines','investment_comparison_preferences','investment_history',
  'mortgage_payments','payment_occurrences','portfolio_snapshots','record_attachments','record_edit_history','savings_goals',
  'subscription_decisions','transaction_categories','transaction_rules','transaction_splits','transaction_tag_links',
  'transaction_tags','workspace_preferences']::text[]
$$;

CREATE FUNCTION public.can_read_owner(owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND owner IS NOT NULL AND (owner=auth.uid()
  OR EXISTS(SELECT 1 FROM public.household_members m WHERE m.owner_id=owner AND m.member_id=auth.uid()))
$$;
CREATE FUNCTION public.can_write_owner(owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND owner IS NOT NULL AND (owner=auth.uid()
  OR EXISTS(SELECT 1 FROM public.household_members m WHERE m.owner_id=owner AND m.member_id=auth.uid() AND m.role='member'))
$$;
-- The workspace a request asks for, from its x-workspace-owner header.
CREATE FUNCTION public.requested_workspace() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE headers text:=nullif(current_setting('request.headers',true),''); wanted text;
BEGIN
 IF headers IS NULL THEN RETURN NULL; END IF;
 wanted:=nullif(btrim(headers::jsonb->>'x-workspace-owner'),'');
 IF wanted IS NULL THEN RETURN NULL; END IF;
 IF wanted !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'You no longer have access to this shared workspace.' USING ERRCODE='42501';
 END IF;
 RETURN wanted::uuid;
END $$;
CREATE FUNCTION public.active_owner() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); wanted uuid;
BEGIN
 IF me IS NULL THEN RETURN NULL; END IF;
 wanted:=public.requested_workspace();
 IF wanted IS NULL OR wanted=me THEN RETURN me; END IF;
 IF EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=wanted AND member_id=me) THEN RETURN wanted; END IF;
 RAISE EXCEPTION 'You no longer have access to this shared workspace.' USING ERRCODE='42501';
END $$;
-- Restrictive write policies: a row the caller may change, a refusal that says so
-- for a row of the workspace they are viewing, and simply not a match otherwise.
CREATE FUNCTION public.shared_row_writable(owner uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.can_write_owner(owner) THEN RETURN true; END IF;
 IF owner=public.active_owner() THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 RETURN false;
END $$;
-- Owners whose attachment folders the caller may open or change (storage requests carry no workspace header).
CREATE FUNCTION public.attachment_folder_readable(folder text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (folder=auth.uid()::text
  OR EXISTS(SELECT 1 FROM public.household_members m WHERE m.owner_id::text=folder AND m.member_id=auth.uid()))
$$;
CREATE FUNCTION public.attachment_record_writable(folder text,record text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id::text=record AND r.user_id::text=folder AND public.can_write_owner(r.user_id))
$$;
REVOKE ALL ON FUNCTION public.can_read_owner(uuid),public.can_write_owner(uuid),public.requested_workspace(),public.active_owner(),public.shared_row_writable(uuid),
 public.attachment_folder_readable(text),public.attachment_record_writable(text,text),public.shared_workspace_tables() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_owner(uuid),public.can_write_owner(uuid),public.requested_workspace(),public.active_owner(),public.shared_row_writable(uuid),
 public.attachment_folder_readable(text),public.attachment_record_writable(text,text),public.shared_workspace_tables() TO authenticated;

-- Every write to a shared row needs the right to change its owner's workspace,
-- whichever function or policy let the statement through. The request's role
-- setting stays 'authenticated' inside SECURITY DEFINER functions; service-role
-- jobs and database administrators keep working as before.
CREATE FUNCTION public.guard_shared_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); owner uuid;
BEGIN
 -- A verified restore writes only the restoring owner's own rows.
 IF me IS NULL OR coalesce(current_setting('role',true),'none') NOT IN ('authenticated','anon') OR public.finance_restore_active() THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 FOREACH owner IN ARRAY ARRAY[CASE WHEN TG_OP<>'INSERT' THEN (to_jsonb(OLD)->>'user_id')::uuid END,CASE WHEN TG_OP<>'DELETE' THEN (to_jsonb(NEW)->>'user_id')::uuid END] LOOP
  CONTINUE WHEN owner IS NULL OR owner=me OR public.can_write_owner(owner);
  -- Rows removed with their owner's account go with it.
  CONTINUE WHEN TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=owner);
  IF public.can_read_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
  RAISE EXCEPTION 'new row violates row-level security policy for table "%"',TG_TABLE_NAME USING ERRCODE='42501';
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_shared_write() FROM PUBLIC,anon,authenticated;

-- Shared tables: the active workspace in every policy and default, owner-only writes for viewers refused.
DO $$ DECLARE tbl text; policy record; roles text; BEGIN
 FOREACH tbl IN ARRAY public.shared_workspace_tables() LOOP
  FOR policy IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
   SELECT string_agg(CASE WHEN role='public' THEN 'PUBLIC' ELSE quote_ident(role) END,',') INTO roles FROM unnest(policy.roles) role;
   EXECUTE format('DROP POLICY %I ON public.%I',policy.policyname,tbl);
   EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',policy.policyname,tbl,policy.permissive,policy.cmd,roles,
    CASE WHEN policy.qual IS NULL THEN '' ELSE ' USING ('||replace(policy.qual,'auth.uid()','(SELECT public.active_owner())')||')' END,
    CASE WHEN policy.with_check IS NULL THEN '' ELSE ' WITH CHECK ('||replace(policy.with_check,'auth.uid()','(SELECT public.active_owner())')||')' END);
  END LOOP;
  EXECUTE format('CREATE POLICY shared_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.shared_row_writable(user_id))',tbl);
  EXECUTE format('CREATE POLICY shared_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.shared_row_writable(user_id)) WITH CHECK (public.shared_row_writable(user_id))',tbl);
  EXECUTE format('CREATE POLICY shared_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.shared_row_writable(user_id))',tbl);
  IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE d.adrelid=('public.'||tbl)::regclass AND a.attname='user_id')='auth.uid()' THEN
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT public.active_owner()',tbl);
  END IF;
  EXECUTE format('CREATE TRIGGER guard_shared_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_shared_write()',tbl);
 END LOOP;
END $$;

-- Functions that act on shared tables work on the active workspace. Personal
-- ones (backups, restore, app activity) and this migration's own keep auth.uid().
DO $$ DECLARE fn oid; BEGIN
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc LIKE '%auth.uid()%' AND NOT p.proname=ANY(ARRAY['export_finance_backup','export_finance_backup_before_movements',
   'export_finance_backup_before_transaction_tools','finance_backup_state','preview_finance_restore','restore_finance_backup',
   'get_backup_recovery','finance_restore_active','mark_app_started','can_read_owner','can_write_owner','active_owner',
   'attachment_folder_readable','guard_shared_write'])
 LOOP
  EXECUTE replace(pg_get_functiondef(fn),'auth.uid()','public.active_owner()');
 END LOOP;
END $$;

-- Attachments: files sit in the owner's folder; household members open them, members add and remove them.
DO $storage$
BEGIN
 IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
 DROP POLICY IF EXISTS "Owners read their attachments" ON storage.objects;
 DROP POLICY IF EXISTS "Owners upload attachments to their records" ON storage.objects;
 DROP POLICY IF EXISTS "Owners remove their attachments" ON storage.objects;
 CREATE POLICY "Owners read their attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='attachments' AND public.attachment_folder_readable((storage.foldername(name))[1]));
 CREATE POLICY "Owners upload attachments to their records" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attachments' AND public.attachment_record_writable((storage.foldername(name))[1],(storage.foldername(name))[2]));
 CREATE POLICY "Owners remove their attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='attachments' AND public.can_write_owner(CASE WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN ((storage.foldername(name))[1])::uuid END));
END $storage$;

-- Who paid: the creator unless someone else in the household is chosen.
ALTER TABLE public.finance_records ADD COLUMN member_id uuid;
CREATE FUNCTION public.attribute_finance_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- A verified restore brings records back exactly as they were saved.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.member_id IS NULL THEN NEW.member_id:=auth.uid(); END IF;
 IF NEW.member_id IS NOT NULL AND NEW.member_id<>NEW.user_id AND (TG_OP='INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id)
  AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=NEW.user_id AND member_id=NEW.member_id) THEN
  -- Someone outside the household (a former member, a restored copy) is not named.
  NEW.member_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.attribute_finance_record() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attribute_finance_record BEFORE INSERT OR UPDATE OF member_id,user_id ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.attribute_finance_record();
DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'business_logo']$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'business_logo']$q$,$q$'business_logo','member_id']$q$);
END $$;

-- The people of a household, by the name each chose in Settings (or their email).
CREATE FUNCTION public.household_person(person uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT nullif(btrim(display_name),'') FROM public.user_preferences WHERE user_id=person),
  (SELECT to_jsonb(u)->>'email' FROM auth.users u WHERE u.id=person))
$$;
REVOKE ALL ON FUNCTION public.household_person(uuid) FROM PUBLIC,anon,authenticated;

-- Everything Settings shows: your household (members, open invites) and the households you belong to.
CREATE FUNCTION public.household_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid();
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 RETURN jsonb_build_object('me',me,'name',public.household_person(me),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.member_id,'name',public.household_person(m.member_id),'role',m.role,'joined_at',m.joined_at) ORDER BY m.joined_at,m.member_id)
   FROM public.household_members m WHERE m.owner_id=me),'[]'),
  'invites',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'created_at',i.created_at,'expires_at',i.expires_at) ORDER BY i.created_at,i.id)
   FROM public.household_invites i WHERE i.owner_id=me AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()),'[]'),
  'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('owner_id',m.owner_id,'name',public.household_person(m.owner_id),'role',m.role) ORDER BY m.joined_at,m.owner_id)
   FROM public.household_members m WHERE m.member_id=me),'[]'));
END $$;
-- The people of the active workspace: its owner first, then members.
CREATE FUNCTION public.household_people() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 RETURN jsonb_build_array(jsonb_build_object('id',owner,'name',public.household_person(owner),'role','owner'))
  || coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.member_id,'name',public.household_person(m.member_id),'role',m.role) ORDER BY m.joined_at,m.member_id)
   FROM public.household_members m WHERE m.owner_id=owner),'[]');
END $$;
-- Up to six people: the owner, members and invites still open.
CREATE FUNCTION public.create_household_invite(p_role text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); token text; invite public.household_invites;
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('member','viewer') THEN RAISE EXCEPTION 'Choose what they can do.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(me::text,100));
 IF (SELECT count(*) FROM public.household_members WHERE owner_id=me)
  +(SELECT count(*) FROM public.household_invites WHERE owner_id=me AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now())>=5 THEN
  RAISE EXCEPTION 'A household has up to six people.';
 END IF;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.household_invites(owner_id,token_hash,role,expires_at)
 VALUES(me,encode(sha256(convert_to(token,'UTF8')),'hex'),p_role,now()+interval '7 days') RETURNING * INTO invite;
 RETURN jsonb_build_object('id',invite.id,'token',token,'role',invite.role,'expires_at',invite.expires_at);
END $$;
CREATE FUNCTION public.revoke_household_invite(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.household_invites SET revoked_at=now() WHERE id=p_id AND owner_id=auth.uid() AND accepted_at IS NULL AND revoked_at IS NULL
$$;
-- An invite that can still be accepted, found by its token.
CREATE FUNCTION public.open_household_invite(p_token text) RETURNS public.household_invites
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE invite public.household_invites;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO invite FROM public.household_invites WHERE p_token ~ '^[0-9a-f]{64}$' AND token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF invite.id IS NULL OR invite.accepted_at IS NOT NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=now() THEN
  RAISE EXCEPTION 'This invite link is no longer valid. Ask for a new one.';
 END IF;
 RETURN invite;
END $$;
REVOKE ALL ON FUNCTION public.open_household_invite(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.preview_household_invite(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE invite public.household_invites:=public.open_household_invite(p_token);
BEGIN
 RETURN jsonb_build_object('owner_id',invite.owner_id,'name',public.household_person(invite.owner_id),'role',invite.role,'expires_at',invite.expires_at,
  'own',invite.owner_id=auth.uid(),'joined',EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=invite.owner_id AND member_id=auth.uid()));
END $$;
CREATE FUNCTION public.accept_household_invite(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); invite public.household_invites:=public.open_household_invite(p_token);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(invite.owner_id::text,100));
 -- Re-read under the lock, so two people cannot use one link.
 SELECT * INTO invite FROM public.household_invites WHERE id=invite.id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF invite.id IS NULL THEN RAISE EXCEPTION 'This invite link is no longer valid. Ask for a new one.'; END IF;
 IF invite.owner_id=me THEN RAISE EXCEPTION 'This invite is for your own household.'; END IF;
 IF EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=invite.owner_id AND member_id=me) THEN RAISE EXCEPTION 'You already belong to this household.'; END IF;
 IF (SELECT count(*) FROM public.household_members WHERE owner_id=invite.owner_id)>=5 THEN RAISE EXCEPTION 'A household has up to six people.'; END IF;
 INSERT INTO public.household_members(owner_id,member_id,role) VALUES(invite.owner_id,me,invite.role);
 UPDATE public.household_invites SET accepted_at=now(),accepted_by=me WHERE id=invite.id;
 RETURN jsonb_build_object('owner_id',invite.owner_id,'role',invite.role);
END $$;
CREATE FUNCTION public.set_household_role(p_member uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('member','viewer') THEN RAISE EXCEPTION 'Choose what they can do.'; END IF;
 UPDATE public.household_members SET role=p_role WHERE owner_id=auth.uid() AND member_id=p_member;
 IF NOT FOUND THEN RAISE EXCEPTION 'This person is no longer in your household.'; END IF;
END $$;
-- The owner removes someone, or a member leaves; access ends with the row.
CREATE FUNCTION public.remove_household_member(p_owner uuid,p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.uid() NOT IN (p_owner,p_member) THEN RAISE EXCEPTION 'Only the owner can remove someone else.'; END IF;
 DELETE FROM public.household_members WHERE owner_id=p_owner AND member_id=p_member;
END $$;
REVOKE ALL ON FUNCTION public.household_state(),public.household_people(),public.create_household_invite(text),public.revoke_household_invite(uuid),
 public.preview_household_invite(text),public.accept_household_invite(text),public.set_household_role(uuid,text),public.remove_household_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.household_state(),public.household_people(),public.create_household_invite(text),public.revoke_household_invite(uuid),
 public.preview_household_invite(text),public.accept_household_invite(text),public.set_household_role(uuid,text),public.remove_household_member(uuid,uuid) TO authenticated;

-- Who paid for transactions, set from the Transactions list; only someone in the household.
CREATE FUNCTION public.set_transaction_member(p_ids uuid[],p_member uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 IF p_member IS NULL OR (p_member<>owner AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=owner AND member_id=p_member)) THEN
  RAISE EXCEPTION 'This person is no longer in your household.';
 END IF;
 UPDATE public.finance_records SET member_id=p_member WHERE id=ANY(p_ids) AND user_id=owner AND member_id IS DISTINCT FROM p_member;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.set_transaction_member(uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_member(uuid[],uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Migration 092 rebuilt save_finance_record and dropped 'recurrence_days' (added in 065) from the fields it accepts.
-- Every income recorded from a source sends recurrence_days, so those saves failed with "Check the record fields."
DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'recurrence_days'$q$ in definition)>0 THEN RETURN; END IF;
 IF position($q$'is_investment',$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'is_investment',$q$,$q$'is_investment','recurrence_days',$q$);
END $$;
-- Owners: in a household, every account and transaction belongs to everyone
-- (shared) or to one person in it.
-- * finance_records.shared says the record belongs to the whole household;
--   otherwise it belongs to member_id (the workspace owner when that is empty).
--   member_id still names who added a shared record.
-- * holding_accounts.member_id names the one person an investment account
--   belongs to; empty means shared.
-- * Everything from before this migration is shared. A new record takes the
--   owner of its account unless one is given; without an account it is shared.
-- * set_account_owner() changes an account's owner and takes along the records
--   that followed it; set_record_owner() replaces set_transaction_member().
-- * Someone outside the household is never named: their records are shared.
-- Apply after migration 101.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN shared boolean NOT NULL DEFAULT true;
-- No default from here on: an insert that leaves it out is given its account's owner below.
ALTER TABLE public.finance_records ALTER COLUMN shared DROP DEFAULT;
ALTER TABLE public.holding_accounts ADD COLUMN member_id uuid;

-- The one person a record belongs to; NULL for the whole household.
CREATE FUNCTION public.record_owner(shared boolean,member uuid,workspace uuid) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN shared THEN NULL ELSE coalesce(member,workspace) END
$$;
REVOKE ALL ON FUNCTION public.record_owner(boolean,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_owner(boolean,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attribute_finance_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account_shared boolean; account_member uuid;
BEGIN
 -- A verified restore brings records back exactly as they were saved; copies from before owners are shared.
 IF public.finance_restore_active() THEN NEW.shared:=coalesce(NEW.shared,true); RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN NEW.shared:=coalesce(NEW.shared,OLD.shared);
 ELSIF NEW.shared IS NULL THEN
  IF NEW.member_id IS NOT NULL THEN NEW.shared:=false;
  ELSE
   -- A new record takes the owner of its account.
   IF NEW.account_id IS NOT NULL THEN
    SELECT a.shared,coalesce(a.member_id,a.user_id) INTO account_shared,account_member FROM public.finance_records a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id;
   ELSIF NEW.holding_account_id IS NOT NULL THEN
    SELECT h.member_id IS NULL,h.member_id INTO account_shared,account_member FROM public.holding_accounts h WHERE h.id=NEW.holding_account_id AND h.user_id=NEW.user_id;
   END IF;
   NEW.shared:=coalesce(account_shared,true);
   IF NOT NEW.shared THEN NEW.member_id:=account_member; END IF;
  END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.member_id IS NULL THEN NEW.member_id:=auth.uid(); END IF;
 IF NEW.member_id IS NOT NULL AND NEW.member_id<>NEW.user_id AND (TG_OP='INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id)
  AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=NEW.user_id AND member_id=NEW.member_id) THEN
  -- Someone outside the household (a former member, a restored copy) is not named.
  NEW.member_id:=NULL; NEW.shared:=true;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER attribute_finance_record ON public.finance_records;
CREATE TRIGGER attribute_finance_record BEFORE INSERT OR UPDATE OF member_id,user_id,shared ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.attribute_finance_record();

DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'member_id']$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'member_id']$q$,$q$'member_id','shared']$q$);
END $$;

-- Copies saved before owners (deleted items, import snapshots) are shared, like the records they were taken from.
CREATE OR REPLACE FUNCTION public.normalize_finance_record_snapshot(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE field record; result jsonb:=p_data; default_value jsonb;
BEGIN
 IF NOT(p_data ? 'shared') THEN result:=result||jsonb_build_object('shared',true); END IF;
 FOR field IN SELECT a.attname,pg_get_expr(d.adbin,d.adrelid) AS expression
  FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.finance_records'::regclass AND NOT a.attisdropped AND NOT(p_data ? a.attname)
 LOOP
  EXECUTE 'SELECT to_jsonb('||field.expression||')' INTO default_value;
  result:=result||jsonb_build_object(field.attname,default_value);
 END LOOP;
 RETURN to_jsonb(jsonb_populate_record(NULL::public.finance_records,result));
END $$;

-- An account changes owner (NULL shares it) and takes along the records that followed it:
-- a cash account's transactions, a property's rent, an investment account's holdings.
-- Returns how many followed.
CREATE FUNCTION public.set_account_owner(p_account uuid,p_member uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); account public.finance_records; holding public.holding_accounts; previous uuid; changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_member IS NOT NULL AND p_member<>owner AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=owner AND member_id=p_member) THEN
  RAISE EXCEPTION 'This person is no longer in your household.';
 END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=p_account AND user_id=owner
  AND kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt') FOR UPDATE;
 IF FOUND THEN
  previous:=public.record_owner(account.shared,account.member_id,owner);
  IF previous IS NOT DISTINCT FROM p_member THEN RETURN 0; END IF;
  UPDATE public.finance_records SET shared=p_member IS NULL,member_id=coalesce(p_member,member_id) WHERE id=account.id AND user_id=owner;
  WITH moved AS (
   UPDATE public.finance_records r SET shared=p_member IS NULL,member_id=coalesce(p_member,r.member_id)
   WHERE r.user_id=owner AND (r.account_id=account.id OR (account.kind='Property' AND r.kind='Rent income' AND r.income_source_id=account.id))
    AND public.record_owner(r.shared,r.member_id,owner) IS NOT DISTINCT FROM previous
   RETURNING r.id)
  SELECT count(*) INTO changed FROM moved;
  RETURN changed;
 END IF;
 SELECT * INTO holding FROM public.holding_accounts WHERE id=p_account AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your accounts.'; END IF;
 IF holding.member_id IS NOT DISTINCT FROM p_member THEN RETURN 0; END IF;
 UPDATE public.holding_accounts SET member_id=p_member WHERE id=holding.id AND user_id=owner;
 WITH moved AS (
  UPDATE public.finance_records r SET shared=p_member IS NULL,member_id=coalesce(p_member,r.member_id)
  WHERE r.user_id=owner AND r.holding_account_id=holding.id
   AND public.record_owner(r.shared,r.member_id,owner) IS NOT DISTINCT FROM holding.member_id
  RETURNING r.id)
 SELECT count(*) INTO changed FROM moved;
 RETURN changed;
END $$;

-- Who records belong to, set from the Transactions list: someone in the household, or everyone with NULL.
DROP FUNCTION public.set_transaction_member(uuid[],uuid);
CREATE FUNCTION public.set_record_owner(p_ids uuid[],p_member uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 IF p_member IS NOT NULL AND p_member<>owner AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=owner AND member_id=p_member) THEN
  RAISE EXCEPTION 'This person is no longer in your household.';
 END IF;
 UPDATE public.finance_records SET shared=p_member IS NULL,member_id=coalesce(p_member,member_id)
 WHERE id=ANY(p_ids) AND user_id=owner AND public.record_owner(shared,member_id,owner) IS DISTINCT FROM p_member;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.set_account_owner(uuid,uuid),public.set_record_owner(uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_account_owner(uuid,uuid),public.set_record_owner(uuid[],uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Telegram chats link only by sharing a phone number in the bot or by signing
-- in on the web from the bot. The Settings code that travelled in "/start CODE"
-- is gone, so its columns (and their column grants) go too.
BEGIN;
ALTER TABLE public.telegram_subscriptions DROP COLUMN IF EXISTS link_code, DROP COLUMN IF EXISTS link_code_expires_at;
NOTIFY pgrst,'reload schema';
COMMIT;

-- A scheduled payment that never came (or was never paid) is skipped with a
-- note saying why, typed in the Record scheduled payment dialog at amount 0.
-- The column stays nullable so backups taken before it restore unchanged.
BEGIN;
ALTER TABLE public.payment_occurrences ADD COLUMN IF NOT EXISTS notes text CHECK (notes IS NULL OR length(notes)<=2000);
DROP FUNCTION IF EXISTS public.set_schedule_exception(uuid,date,boolean);
DROP FUNCTION IF EXISTS public.set_schedule_exception(uuid,date,boolean,text);
CREATE FUNCTION public.set_schedule_exception(p_record uuid,p_day date,p_skip boolean,p_notes text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.payment_occurrences; memo text:=nullif(btrim(coalesce(p_notes,'')),'');
BEGIN
 IF public.active_owner() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_skip IS NULL THEN RAISE EXCEPTION 'Choose a schedule action.'; END IF;
 IF length(memo)>2000 THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(public.active_owner()::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=public.active_owner();
 IF NOT FOUND OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,p_day,r.recurrence_days) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
 SELECT * INTO existing FROM public.payment_occurrences WHERE user_id=public.active_owner() AND record_id=p_record AND due_on=p_day;
 IF existing.status='paid' THEN RAISE EXCEPTION 'A recorded payment cannot be skipped.'; END IF;
 IF p_skip THEN
  -- Skipping again keeps the first note unless a new one is given.
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,notes) VALUES(gen_random_uuid(),public.active_owner(),p_record,p_day,'dismissed',memo)
   ON CONFLICT(user_id,record_id,due_on) DO UPDATE SET notes=coalesce(EXCLUDED.notes,payment_occurrences.notes) WHERE payment_occurrences.status='dismissed';
 ELSE DELETE FROM public.payment_occurrences WHERE user_id=public.active_owner() AND record_id=p_record AND due_on=p_day AND status='dismissed';
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.set_schedule_exception(uuid,date,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_schedule_exception(uuid,date,boolean,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Goals may set aside more than their cash account holds: "Already saved" and contributions are no longer
-- refused with "Allocations exceed the account balance.". The account then shows a negative amount available
-- for goals, and the Goals page still points it out. Every function that raised the error, in whatever version
-- is installed (planning_action, planning_action_with_actual_amount, record_goal_activity), keeps its other
-- checks; only that refusal becomes a no-op. Apply after 104. No rows are rewritten.
BEGIN;
DO $$
DECLARE fn record; definition text;
BEGIN
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc LIKE '%Allocations exceed the account balance%'
 LOOP
  definition:=pg_get_functiondef(fn.oid);
  EXECUTE regexp_replace(definition,'RAISE EXCEPTION ''Allocations exceed the account balance\.?''','NULL','g');
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Rate limits shared by every server instance: sign-in, phone codes, account changes, the assistant and
-- the public market reads (lib/rate-limit.ts). A fixed-window counter per bucket; buckets name a limit and
-- a hashed client address, email, phone or user, never the raw value. Only the server-only key may count:
-- the table has row security and no policies, and nobody else may read it or call the function.
-- Apply after 105. Nothing existing changes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.rate_limits(
 bucket text NOT NULL CHECK(length(bucket) BETWEEN 1 AND 200),
 window_seconds integer NOT NULL CHECK(window_seconds BETWEEN 1 AND 604800),
 window_start timestamptz NOT NULL,
 hits integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(bucket,window_seconds,window_start)
);
CREATE INDEX IF NOT EXISTS rate_limits_expires_at ON public.rate_limits(expires_at);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC,anon,authenticated;

-- Counts one hit and answers whether it is within the limit: true while the window has at most max_hits.
-- Expired windows are pruned on the way.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(bucket text,max_hits integer,window_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE started timestamptz; counted integer;
BEGIN
 IF bucket IS NULL OR length(bucket) NOT BETWEEN 1 AND 200 OR max_hits IS NULL OR max_hits<1 OR window_seconds IS NULL OR window_seconds NOT BETWEEN 1 AND 604800 THEN
  RAISE EXCEPTION 'Check the rate limit.' USING ERRCODE='22023';
 END IF;
 started:=pg_catalog.to_timestamp(pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.now())/window_seconds)*window_seconds);
 DELETE FROM public.rate_limits r WHERE r.expires_at<=pg_catalog.now();
 INSERT INTO public.rate_limits AS r(bucket,window_seconds,window_start,hits,expires_at)
  VALUES(hit_rate_limit.bucket,hit_rate_limit.window_seconds,started,1,started+pg_catalog.make_interval(secs=>hit_rate_limit.window_seconds))
  ON CONFLICT ON CONSTRAINT rate_limits_pkey DO UPDATE SET hits=least(r.hits+1,2147483646)
  RETURNING r.hits INTO counted;
 RETURN counted<=max_hits;
END $$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text,integer,integer) TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Launch hardening from the pre-launch database review. Apply after 106.
-- * A signed-in person could still write any chat_id into their own Telegram
--   row (column grants left from the link-code era), and so take over another
--   person's bot chat. Chats are now linked only by the server; the app may
--   still change notification switches and unlink (chat_id back to null).
-- * Tables written only through functions lose direct write grants, and anon
--   loses the grants Supabase's defaults gave it. RLS already refused these
--   writes; this removes the second line of reliance on policies.
-- * Attachment uploads must use the exact path the server hands out
--   (owner/record/file.ext), so storage cannot be filled with stray files.
-- * An investment account's owner (member_id) must be the workspace owner or
--   one of its household members, as finance_records already enforces.
-- * finance_restore_context gets RLS like every other table (all grants were
--   already revoked).
-- No rows are rewritten.
BEGIN;

REVOKE INSERT, UPDATE ON public.telegram_subscriptions FROM authenticated;
GRANT UPDATE (digest_enabled, actions_enabled, chat_id, linked_at, updated_at) ON public.telegram_subscriptions TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_telegram_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 -- Only the server (service role) links a chat. People may unlink their own.
 IF current_user IN ('authenticated','anon')
  AND ((NEW.chat_id IS NOT NULL AND NEW.chat_id IS DISTINCT FROM OLD.chat_id)
   OR (NEW.linked_at IS NOT NULL AND NEW.linked_at IS DISTINCT FROM OLD.linked_at)) THEN
  RAISE EXCEPTION 'Telegram chats are linked from the bot.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_telegram_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_telegram_link ON public.telegram_subscriptions;
CREATE TRIGGER guard_telegram_link BEFORE UPDATE ON public.telegram_subscriptions FOR EACH ROW EXECUTE FUNCTION public.guard_telegram_link();

REVOKE ALL ON public.forecast_assignments, public.goal_events, public.goal_operations, public.import_batches,
 public.import_batch_items, public.transaction_splits, public.workspace_preferences FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.goal_events, public.goal_operations, public.import_batches,
 public.import_batch_items, public.transaction_splits, public.forecast_assignments FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

DO $storage$
BEGIN
 IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
 DROP POLICY IF EXISTS "Owners upload attachments to their records" ON storage.objects;
 CREATE POLICY "Owners upload attachments to their records" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attachments'
   AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|pdf)$'
   AND public.attachment_record_writable((storage.foldername(name))[1],(storage.foldername(name))[2]));
END $storage$;

CREATE OR REPLACE FUNCTION public.attribute_holding_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF NEW.member_id IS NOT NULL AND NEW.member_id<>NEW.user_id AND (TG_OP='INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id)
  AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=NEW.user_id AND member_id=NEW.member_id) THEN
  -- Someone outside the household is not named.
  NEW.member_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.attribute_holding_account() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS attribute_holding_account ON public.holding_accounts;
CREATE TRIGGER attribute_holding_account BEFORE INSERT OR UPDATE OF member_id,user_id ON public.holding_accounts FOR EACH ROW EXECUTE FUNCTION public.attribute_holding_account();

ALTER TABLE public.finance_restore_context ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Owner read indexes for large accounts. Apply after 107.
-- The planning read (lib/server-records.ts) reads each owner table in id order,
-- 500 rows after the last id it has. These tables had no index starting with
-- user_id, so every page scanned the whole table, every owner's rows included.
-- * (user_id,id) lets each page be one index range in id order.
-- * account_activity also gets (user_id,occurred_on) for the month-limited
--   reads of the monthly review and the budget.
-- Indexes only: no rows, policies or functions change.
BEGIN;

CREATE INDEX IF NOT EXISTS account_activity_owner_id ON public.account_activity(user_id,id);
CREATE INDEX IF NOT EXISTS account_activity_owner_date ON public.account_activity(user_id,occurred_on);
CREATE INDEX IF NOT EXISTS payment_occurrences_owner_id ON public.payment_occurrences(user_id,id);
CREATE INDEX IF NOT EXISTS investment_account_links_owner_id ON public.investment_account_links(user_id,id);
CREATE INDEX IF NOT EXISTS mortgage_payments_owner_id ON public.mortgage_payments(user_id,id);
CREATE INDEX IF NOT EXISTS savings_goals_owner_id ON public.savings_goals(user_id,id);
CREATE INDEX IF NOT EXISTS transaction_categories_owner_id ON public.transaction_categories(user_id,id);

ANALYZE public.account_activity,public.payment_occurrences,public.investment_account_links,public.mortgage_payments,public.savings_goals,public.transaction_categories;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Scheduled payments of 0: "the business made nothing this month".
-- Apply after 108. No rows are rewritten.
-- Recording an occurrence as 0 settles it with a 0 transaction that keeps its
-- note and moves no cash. Skipping an occurrence stays a separate action, and
-- an occurrence still cannot be recorded before its due date.
BEGIN;

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_scheduled_payments(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- A scheduled payment may be 0.
SELECT pg_temp.patch_scheduled_payments('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$IF amount IS NULL OR amount<=0 OR amount>1e15 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
   new_id:=item;$old$,
 $new$IF amount IS NULL OR amount<0 OR amount>1e15 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
   new_id:=item;$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Scheduled payments keep the day the money actually moved. Apply after 109.
-- Recording an occurrence may name `paid_on`, the day it was received or paid.
-- The transaction takes that date (never a future one); the occurrence it
-- settles keeps its due date. Without `paid_on` the transaction is dated on
-- the due date, as before. No rows are rewritten.
BEGIN;

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_payment_date(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 -- Re-running is a no-op once every expected match was already patched. The new
 -- text may contain the old, so it is counted first.
 IF (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- The payment day may not lie ahead.
SELECT pg_temp.patch_payment_date('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$   new_id:=item;
   INSERT INTO public.finance_records($old$,
 $new$   IF (p_data->>'paid_on')::date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Check the payment date.'; END IF;
   new_id:=item;
   INSERT INTO public.finance_records($new$,1);

-- The transaction is dated when the money moved.
SELECT pg_temp.patch_payment_date('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$r.currency,amount,day,'Once',memo$old$,
 $new$r.currency,amount,coalesce((p_data->>'paid_on')::date,day),'Once',memo$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Archive on Recurring. Apply after 110.
-- An archived income, bill or spending plan leaves Recurring, budgets and
-- forecasts; its recorded payments and spending stay. Restoring it brings the
-- schedule back as it was. No rows are rewritten.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.expense_plans ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

NOTIFY pgrst,'reload schema';
COMMIT;
-- More than one payment for a scheduled income or bill. Apply after 111.
-- The first payment settles the occurrence as before. Each later payment is
-- its own transaction that names the occurrence it adds to
-- (occurrence_record_id, occurrence_due_on); together they make what was
-- received or paid that time. No rows are rewritten.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS occurrence_record_id uuid;
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS occurrence_due_on date;
CREATE INDEX IF NOT EXISTS finance_records_occurrence_idx ON public.finance_records(user_id,occurrence_record_id,occurrence_due_on) WHERE occurrence_record_id IS NOT NULL;

-- Another payment for an occurrence that is already recorded. Retrying the same payment is a no-op.
CREATE OR REPLACE FUNCTION public.record_occurrence_extra(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=public.active_owner(); r public.finance_records; prior public.finance_records;
 item uuid:=(p_data->>'id')::uuid; aid uuid:=(p_data->>'account_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 amount numeric:=(p_data->>'amount')::numeric; day date:=(p_data->>'date')::date; paid date:=coalesce((p_data->>'paid_on')::date,(p_data->>'date')::date);
 memo text:=coalesce(p_data->>'notes','');
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL THEN RAISE EXCEPTION 'An identifier is required.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.finance_records WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.occurrence_record_id IS DISTINCT FROM bid OR prior.occurrence_due_on IS DISTINCT FROM day OR prior.amount<>amount THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF day IS NULL OR paid IS NULL OR paid>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the payment date.'; END IF;
 IF amount IS NULL OR amount<=0 OR amount>1e15 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=bid AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Record not found.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=owner AND record_id=bid AND due_on=day AND status='paid') THEN RAISE EXCEPTION 'Record the scheduled payment first.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash') THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id,account_exchange_rate,account_rate_date,account_currency,occurrence_record_id,occurrence_due_on)
 VALUES(item,owner,r.name,r.kind,r.currency,amount,paid,'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency',bid,day);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_occurrence_extra(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_occurrence_extra(jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
-- Delete on Recurring. Apply after 112.
-- A repeating income or bill, or a spending plan, moves to Recently deleted
-- even when payments were recorded against it. The person chooses what
-- happens to those payments:
--  keep:   they stay as ordinary transactions and keep their account balances;
--          restoring the schedule links its recorded occurrences again.
--  remove: they move to Recently deleted too, and their cash is reversed as
--          for any deleted transaction.
-- Skipped occurrences go with the schedule. No other rows are rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_schedule(p_source text,p_id uuid,p_remove_history boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=public.active_owner(); r public.finance_records; links jsonb; tx uuid;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_id IS NULL OR p_remove_history IS NULL OR p_source NOT IN ('record','plan') THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 IF p_source='plan' THEN
  -- Retries after a successful delete are harmless.
  IF NOT EXISTS(SELECT 1 FROM public.expense_plans WHERE id=p_id AND user_id=owner) THEN RETURN jsonb_build_object('ok',true); END IF;
  IF p_remove_history THEN
   FOR tx IN SELECT id FROM public.finance_records WHERE expense_plan_id=p_id AND user_id=owner ORDER BY date DESC,id LOOP
    DELETE FROM public.finance_records WHERE id=tx AND user_id=owner;
   END LOOP;
  ELSE
   UPDATE public.finance_records SET expense_plan_id=NULL WHERE expense_plan_id=p_id AND user_id=owner;
  END IF;
  DELETE FROM public.expense_plans WHERE id=p_id AND user_id=owner;
  RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=p_id AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
 IF r.frequency='Once' OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN
  RAISE EXCEPTION 'Only repeating income and expenses are deleted here.';
 END IF;
 IF p_remove_history THEN
  -- Later payments first, then each recorded occurrence's transaction; deleting a transaction reverses its cash.
  FOR tx IN SELECT id FROM public.finance_records WHERE occurrence_record_id=p_id AND user_id=owner
   UNION SELECT transaction_id FROM public.payment_occurrences WHERE record_id=p_id AND user_id=owner AND transaction_id IS NOT NULL LOOP
   DELETE FROM public.finance_records WHERE id=tx AND user_id=owner;
  END LOOP;
 END IF;
 links:=(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM public.payment_occurrences o WHERE o.record_id=p_id AND o.user_id=owner AND o.status='paid' AND o.transaction_id IS NOT NULL);
 DELETE FROM public.payment_occurrences WHERE record_id=p_id AND user_id=owner;
 DELETE FROM public.finance_records WHERE id=p_id AND user_id=owner;
 IF jsonb_array_length(links)>0 THEN
  UPDATE public.deleted_items SET occurrences=links
  WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=owner AND source='finance_records' AND data->>'id'=p_id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_schedule(text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_schedule(text,uuid,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
-- Category icons. Apply after 113.
-- The icon chosen for each category is a shared workspace preference
-- ('category_icons'), so everyone in a household sees the same icons.
-- No rows are rewritten.
BEGIN;

ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order','business_order','tag_order','tax_lines','category_icons'));

NOTIFY pgrst,'reload schema';
COMMIT;
-- Restore resumes from the month it happens. Apply after 114.
-- Each archive opens a pause and each restore closes it: archive_pauses is a
-- list of {from, to} dates on repeating records and spending plans, kept by a
-- trigger whenever `archived` changes. The archive month leaves budgets,
-- forecasts and schedules; the restore month comes back. Months in between add
-- no planned amount, no carry-over and no overdue payments, and the months
-- before the archive keep the plan as it was. Rows archived before this
-- migration get a pause from today. No other rows are rewritten.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS archive_pauses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(archive_pauses)='array');
ALTER TABLE public.expense_plans ADD COLUMN IF NOT EXISTS archive_pauses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(archive_pauses)='array');

UPDATE public.finance_records SET archive_pauses=jsonb_build_array(jsonb_build_object('from',(now() AT TIME ZONE 'Asia/Tashkent')::date,'to',NULL))
WHERE archived AND archive_pauses='[]'::jsonb;
UPDATE public.expense_plans SET archive_pauses=jsonb_build_array(jsonb_build_object('from',(now() AT TIME ZONE 'Asia/Tashkent')::date,'to',NULL))
WHERE archived AND archive_pauses='[]'::jsonb;

-- Archiving opens a pause from today; restoring closes the open one today, or drops it when it opened today.
CREATE OR REPLACE FUNCTION public.track_archive_pause() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Tashkent')::date;
BEGIN
 -- A verified backup restore brings its pauses back as they were.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF NEW.archived THEN
  NEW.archive_pauses:=coalesce(OLD.archive_pauses,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('from',today,'to',NULL));
 ELSE
  NEW.archive_pauses:=(SELECT coalesce(jsonb_agg(CASE WHEN x.p->>'to' IS NULL THEN jsonb_set(x.p,'{to}',to_jsonb(today)) ELSE x.p END ORDER BY x.n),'[]'::jsonb)
   FROM jsonb_array_elements(coalesce(OLD.archive_pauses,'[]'::jsonb)) WITH ORDINALITY x(p,n)
   WHERE NOT (x.p->>'to' IS NULL AND (x.p->>'from')::date=today));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.track_archive_pause() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS track_archive_pause ON public.finance_records;
CREATE TRIGGER track_archive_pause BEFORE UPDATE OF archived ON public.finance_records
FOR EACH ROW WHEN (OLD.archived IS DISTINCT FROM NEW.archived) EXECUTE FUNCTION public.track_archive_pause();
DROP TRIGGER IF EXISTS track_archive_pause ON public.expense_plans;
CREATE TRIGGER track_archive_pause BEFORE UPDATE OF archived ON public.expense_plans
FOR EACH ROW WHEN (OLD.archived IS DISTINCT FROM NEW.archived) EXECUTE FUNCTION public.track_archive_pause();

-- A plan's month skips its paused months: no budget, and carry-over starts again at zero when it is restored.
CREATE OR REPLACE FUNCTION public.expense_plan_month(p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.expense_plans; m date; chosen date:=date_trunc('month',p_month)::date; budget numeric; roll boolean; spent numeric; carry numeric; incoming numeric; result jsonb:='[]'::jsonb;
BEGIN
 FOR p IN SELECT * FROM public.expense_plans WHERE user_id=public.active_owner() ORDER BY category,name,id LOOP
  carry:=0; incoming:=0; spent:=0; budget:=p.amount; roll:=false;
  FOR m IN SELECT generate_series(least(date_trunc('month',p.start_date)::date,chosen),chosen,interval '1 month')::date LOOP
   SELECT v.amount,v.rollover INTO budget,roll FROM public.expense_plan_versions v WHERE v.plan_id=p.id AND v.user_id=public.active_owner() AND v.effective_month<=m ORDER BY effective_month DESC LIMIT 1;
   budget:=coalesce(budget,p.amount);roll:=coalesce(roll,false);
   IF m<date_trunc('month',p.start_date)::date OR (p.end_date IS NOT NULL AND m>date_trunc('month',p.end_date)::date)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.archive_pauses) x WHERE m>=date_trunc('month',(x->>'from')::date) AND (x->>'to' IS NULL OR m<date_trunc('month',(x->>'to')::date)))
   THEN budget:=0;carry:=0; END IF;
   SELECT coalesce(sum(r.amount),0) INTO spent FROM public.finance_records r WHERE r.expense_plan_id=p.id AND r.user_id=public.active_owner() AND r.date>=m AND r.date<m+interval '1 month';
   incoming:=CASE WHEN roll THEN carry ELSE 0 END;
   carry:=CASE WHEN roll THEN greatest(0,budget+incoming-spent) ELSE 0 END;
  END LOOP;
  result:=result||jsonb_build_array(to_jsonb(p)-'user_id'||jsonb_build_object('amount',budget,'base_amount',p.amount,'spent',spent,'carryover',incoming,'rollover',roll));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.expense_plan_month(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.expense_plan_month(date) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Five more asset kinds. Apply after 115. No existing rows are rewritten.
--  * Precious metals: gold, silver, platinum or palladium by weight. Valued like a
--    stock (units x price per unit); the price per unit follows the metal's live spot
--    price for the chosen weight unit and purity (metal, metal_unit, metal_purity).
--  * Equity compensation: vested RSUs or option shares of a listed company, valued
--    like a stock by its ticker. The date holds the next vesting date.
--  * Bond: a government or corporate bond held for its coupon. It behaves like a
--    Treasury bill: a face value, an annual coupon rate without compounding, a
--    purchase date and a maturity reminder.
--  * Retirement account and Vehicle: tracked-value assets like Valuables, with
--    valuations and cash-funded contributions or withdrawals.
-- Once records of these kinds exist, restoring the previous kind constraint would
-- fail; delete or reclassify them first.
BEGIN;

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

ALTER TABLE public.finance_records
 ADD COLUMN IF NOT EXISTS metal text CHECK (metal IN ('XAU','XAG','XPT','XPD')),
 ADD COLUMN IF NOT EXISTS metal_unit text CHECK (metal_unit IN ('oz','g','kg')),
 ADD COLUMN IF NOT EXISTS metal_purity numeric CHECK (metal_purity > 0 AND metal_purity <= 1);
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_metal_fields;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_metal_fields CHECK (
 (kind = 'Precious metals' AND metal IS NOT NULL AND metal_unit IS NOT NULL AND metal_purity IS NOT NULL)
 OR (kind <> 'Precious metals' AND metal IS NULL AND metal_unit IS NULL AND metal_purity IS NULL));

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_more_assets(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Opening balances and valuations: every new kind has a history; metals and equity count their units.
SELECT pg_temp.patch_more_assets('public.capture_investment_balance()'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);
SELECT pg_temp.patch_more_assets('public.capture_investment_balance()'::regprocedure,
 $old$NEW.kind IN ('Stock','Crypto')$old$,$new$NEW.kind IN ('Stock','Crypto','Precious metals','Equity compensation')$new$,1);

-- Tracker updates, with or without a linked cash account.
SELECT pg_temp.patch_more_assets('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);
SELECT pg_temp.patch_more_assets('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$r.kind NOT IN ('Business','Property','Valuables') THEN$old$,$new$r.kind NOT IN ('Business','Property','Valuables','Vehicle','Retirement account') THEN$new$,1);
SELECT pg_temp.patch_more_assets('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$r.kind IN ('Stock','Crypto')$old$,$new$r.kind IN ('Stock','Crypto','Precious metals','Equity compensation')$new$,2);
SELECT pg_temp.patch_more_assets('public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Debt'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Debt'$new$,1);
SELECT pg_temp.patch_more_assets('public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Debt'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Debt'$new$,1);
SELECT pg_temp.patch_more_assets('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$r.kind IN ('Business','Property','Valuables') AND$old$,$new$r.kind IN ('Business','Property','Valuables','Vehicle','Retirement account') AND$new$,1);

-- Asset lists and summaries. Each vehicle, retirement account and metal holding stays its own
-- summary row, and a metal's row carries its weight unit and purity for live pricing.
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables'))$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation'))$new$,2);
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$r.kind IN ('Stock','Crypto')$old$,$new$r.kind IN ('Stock','Crypto','Precious metals','Equity compensation')$new$,3);
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$CASE WHEN r.kind IN ('Business','Property','Valuables') THEN r.id$old$,$new$CASE WHEN r.kind IN ('Business','Property','Valuables','Vehicle','Retirement account','Precious metals') THEN r.id$new$,1);
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'' AS notes, count(*) AS record_count$old$,$new$'' AS notes, min(r.metal) AS metal, min(r.metal_unit) AS metal_unit, min(r.metal_purity) AS metal_purity, count(*) AS record_count$new$,1);

-- A bond's maturity reminder can be dismissed like a deposit's.
SELECT pg_temp.patch_more_assets('public.planning_action(text,jsonb)'::regprocedure,
 $old$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill','Bond') OR r.date<>day$new$,1);
SELECT pg_temp.patch_more_assets('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill','Bond') OR r.date<>day$new$,1);

-- The purchase date is an opening balance date.
SELECT pg_temp.patch_more_assets('public.guard_opening_balance_date()'::regprocedure,
 $old$('Cash','Deposit','Treasury bill','Stock','Crypto'$old$,$new$('Cash','Deposit','Treasury bill','Bond','Stock','Crypto','Precious metals','Equity compensation'$new$,1);

-- Metals and vested shares are bought and sold in units, like stocks.
SELECT pg_temp.patch_more_assets('public.record_asset_movement(jsonb)'::regprocedure,
 $old$a_units:=a.kind IN ('Stock','Crypto'); b_units:=b.kind IN ('Stock','Crypto');$old$,$new$a_units:=a.kind IN ('Stock','Crypto','Precious metals','Equity compensation'); b_units:=b.kind IN ('Stock','Crypto','Precious metals','Equity compensation');$new$,1);

-- Owners and businesses can be set on the new assets.
SELECT pg_temp.patch_more_assets('public.set_account_owner(uuid,uuid)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);
SELECT pg_temp.patch_more_assets('public.set_account_business(uuid,uuid)'::regprocedure,
 $old$'Treasury bill','Property','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);

-- Records can be saved with a metal, its weight unit and purity.
SELECT pg_temp.patch_more_assets('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$'member_id','shared'];$old$,$new$'member_id','shared','metal','metal_unit','metal_purity'];$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Money lent starts on the day it was lent. Needs only 115; independent of 116.
-- A record's first tracked value (its baseline) is dated with opened_on, and
-- falls back to the day it was saved. Money lent keeps its start in lent_date
-- instead, so a loan entered in October for money lent in August showed up as
-- new investment funding in October. The baseline now follows lent_date when
-- the record is saved or its lent date changes, as long as it stays the
-- record's first event and the date is not in the future. Existing baselines
-- are moved the same way. No balances change.
BEGIN;

CREATE OR REPLACE FUNCTION public.date_money_lent_baseline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind<>'Money lent' OR NEW.lent_date IS NULL OR NEW.lent_date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RETURN NEW; END IF;
 IF public.finance_restore_active() OR current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 UPDATE public.investment_history h SET occurred_on=NEW.lent_date
 WHERE h.record_id=NEW.id AND h.event_type='baseline' AND h.occurred_on<>NEW.lent_date
  AND NOT EXISTS(SELECT 1 FROM public.investment_history o WHERE o.record_id=NEW.id AND o.id<>h.id AND o.occurred_on<NEW.lent_date);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.date_money_lent_baseline() FROM PUBLIC,anon,authenticated;
-- Runs after capture_investment_balance (triggers fire by name), so a new record's baseline exists.
DROP TRIGGER IF EXISTS date_money_lent_baseline ON public.finance_records;
CREATE TRIGGER date_money_lent_baseline AFTER INSERT OR UPDATE OF lent_date,kind ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.date_money_lent_baseline();

UPDATE public.investment_history h SET occurred_on=r.lent_date
FROM public.finance_records r
WHERE r.id=h.record_id AND r.kind='Money lent' AND h.event_type='baseline'
 AND r.lent_date IS NOT NULL AND r.lent_date<=(now() AT TIME ZONE 'Asia/Tashkent')::date AND h.occurred_on<>r.lent_date
 AND NOT EXISTS(SELECT 1 FROM public.investment_history o WHERE o.record_id=r.id AND o.id<>h.id AND o.occurred_on<r.lent_date);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Newest records first within a day, and names that follow their category. Needs 117.
-- Record pages were ordered by date and then by id, a random value, so rows saved
-- on the same day came back in no particular order and the Cash flow preview of
-- recent transactions could leave out the one just saved. Record pages and the
-- transaction history (Cash flow) now order same-day rows by the moment they were
-- saved: newest first, or oldest first when sorted oldest first.
-- A transaction saved without a name is named after its category. Changing its
-- category (inline, Edit multiple or a rule) now renames it too, so a row no
-- longer reads "Other expense" under a Transport pill. Typed names stay. No
-- existing rows change until their category does.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.patch_newest_first(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 -- Re-running is a no-op once every expected match was already patched. The new
 -- text may contain the old, so it is counted first.
 IF (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

SELECT pg_temp.patch_newest_first('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$ORDER BY p.sort_date DESC NULLS LAST, p.id DESC)$old$,$new$ORDER BY p.sort_date DESC NULLS LAST, p.created_at DESC, p.id DESC)$new$,1);
SELECT pg_temp.patch_newest_first('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT$old$,$new$ORDER BY sort_date DESC NULLS LAST, r.created_at DESC, r.id DESC LIMIT$new$,1);
SELECT pg_temp.patch_newest_first('public.transaction_history_page(integer,text,text,text,date,date,text)'::regprocedure,
 $old$CASE WHEN p_order='newest' THEN r.date END DESC NULLS LAST,r.id ASC$old$,
 $new$CASE WHEN p_order='newest' THEN r.date END DESC NULLS LAST,CASE WHEN p_order='newest' THEN r.created_at END DESC,CASE WHEN p_order='oldest' THEN r.created_at END ASC,r.id ASC$new$,1);

SELECT pg_temp.patch_newest_first('public.recategorize_transactions(uuid[],text,uuid)'::regprocedure,
 $old$UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category$old$,
 $new$UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category,name=CASE WHEN lower(trim(r.name)) IN (lower(r.kind),lower(coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=r.custom_category_id),''))) THEN coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=p_category),p_kind) ELSE r.name END$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Payments name their schedule by id. Needs 118.
-- A payment typed in the bot or the record form named its business but not its
-- schedule, so Cash flow counted it while Recurring still showed the month's
-- payment as open or overdue. One rule now links every payment to its schedule:
-- * A payment of a schedule carries the schedule's id (occurrence_record_id) and
--   the due date it pays (occurrence_due_on). The bot asks which scheduled
--   payment it is; Record payment and later payments already name both.
-- * A business or rent income that names no schedule takes the id of the one
--   active schedule of its business or property in its currency. Nothing is
--   guessed from names; with no such schedule, or more than one, it stays unlinked.
-- * The database chooses the due date when only the schedule is named: the
--   earliest open payment of the payment's own month, else last month's open one,
--   else it adds to this month's recorded payment. With none of these it stays
--   unlinked.
-- * The first payment of a due date settles it (payment_occurrences.transaction_id);
--   every other payment naming it adds to what was received or paid.
-- A schedule id cannot be changed afterwards, and a verified restore or an undo
-- keeps rows exactly as they were saved.
-- Business and rent income from this month and last month that is not linked yet
-- settles its open payment once here, oldest first.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.patch_schedule_ids(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Record payment names the schedule and due date on the transaction it writes.
SELECT pg_temp.patch_schedule_ids('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$custom_category_id,account_exchange_rate,account_rate_date,account_currency)
   VALUES(new_id,owner,r.name,r.kind,r.currency,amount,coalesce((p_data->>'paid_on')::date,day),'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency');$old$,
 $new$custom_category_id,account_exchange_rate,account_rate_date,account_currency,occurrence_record_id,occurrence_due_on)
   VALUES(new_id,owner,r.name,r.kind,r.currency,amount,coalesce((p_data->>'paid_on')::date,day),'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency',bid,day);$new$,1);
-- The bot and the record form may name the schedule a new payment belongs to.
SELECT pg_temp.patch_schedule_ids('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$allowed text[]:=ARRAY['id','name',$old$,$new$allowed text[]:=ARRAY['id','occurrence_record_id','name',$new$,1);

-- The schedule a business or rent income belongs to when it names none: the one active schedule of its business or property.
CREATE OR REPLACE FUNCTION public.income_schedule_of(payment public.finance_records) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE found uuid[];
BEGIN
 IF payment.kind NOT IN ('Business income','Rent income') OR payment.earning_source_id IS NOT NULL OR payment.payment_type<>'regular'
  OR (CASE WHEN payment.kind='Business income' THEN payment.business_id ELSE payment.income_source_id END) IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(candidate.id) INTO found FROM public.finance_records candidate
  WHERE candidate.user_id=payment.user_id AND candidate.kind=payment.kind AND candidate.frequency<>'Once' AND candidate.currency=payment.currency
  AND NOT candidate.archived AND NOT candidate.source_paused
  AND (CASE WHEN payment.kind='Business income' THEN candidate.business_id=payment.business_id ELSE candidate.income_source_id=payment.income_source_id END);
 RETURN CASE WHEN cardinality(found)=1 THEN found[1] END;
END $$;
REVOKE ALL ON FUNCTION public.income_schedule_of(public.finance_records) FROM PUBLIC,anon,authenticated;

-- The due date a payment of `schedule` pays: an open one of its own month, else last month's, else this month's recorded one.
CREATE OR REPLACE FUNCTION public.scheduled_payment_due(payment public.finance_records,schedule public.finance_records) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT day::date FROM generate_series(date_trunc('month',payment.date)-interval '1 month',date_trunc('month',payment.date)+interval '1 month - 1 day',interval '1 day') day
 LEFT JOIN public.payment_occurrences o ON o.user_id=schedule.user_id AND o.record_id=schedule.id AND o.due_on=day::date
 WHERE public.is_schedule_date(schedule.frequency,schedule.date,schedule.end_date,day::date,schedule.recurrence_days)
  AND (o.id IS NULL OR (o.status='paid' AND day>=date_trunc('month',payment.date)))
 ORDER BY o.id IS NOT NULL,day<date_trunc('month',payment.date),CASE WHEN o.id IS NOT NULL THEN abs(day::date-payment.date) END,day
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.scheduled_payment_due(public.finance_records,public.finance_records) FROM PUBLIC,anon,authenticated;

-- Before a payment is written: find or check its schedule and the due date it pays.
CREATE OR REPLACE FUNCTION public.name_scheduled_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule public.finance_records; incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income'];
BEGIN
 -- Rows written by a verified restore or an undo keep exactly what they were saved with.
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.occurrence_record_id,NEW.occurrence_due_on) IS DISTINCT FROM (OLD.occurrence_record_id,OLD.occurrence_due_on) THEN RAISE EXCEPTION 'A scheduled payment keeps its schedule.'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.frequency<>'Once' OR NEW.date IS NULL THEN
  IF NEW.occurrence_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
  RETURN NEW;
 END IF;
 NEW.occurrence_record_id:=coalesce(NEW.occurrence_record_id,public.income_schedule_of(NEW));
 IF NEW.occurrence_record_id IS NULL THEN NEW.occurrence_due_on:=NULL; RETURN NEW; END IF;
 SELECT * INTO schedule FROM public.finance_records WHERE id=NEW.occurrence_record_id AND user_id=NEW.user_id AND frequency<>'Once';
 IF NOT FOUND OR (NEW.kind=ANY(incomes))<>(schedule.kind=ANY(incomes)) THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
 IF NEW.currency<>schedule.currency THEN RAISE EXCEPTION 'Record this payment in the currency of its schedule.'; END IF;
 IF NEW.occurrence_due_on IS NULL THEN
  NEW.occurrence_due_on:=public.scheduled_payment_due(NEW,schedule);
  IF NEW.occurrence_due_on IS NULL THEN NEW.occurrence_record_id:=NULL; END IF;
 ELSIF NOT public.is_schedule_date(schedule.frequency,schedule.date,schedule.end_date,NEW.occurrence_due_on,schedule.recurrence_days) THEN
  RAISE EXCEPTION 'Choose a scheduled payment date.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.name_scheduled_payment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS link_scheduled_income ON public.finance_records;
DROP TRIGGER IF EXISTS y_name_scheduled_payment ON public.finance_records;
CREATE TRIGGER y_name_scheduled_payment BEFORE INSERT OR UPDATE OF occurrence_record_id,occurrence_due_on ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.name_scheduled_payment();

-- After it is written: the first payment of a due date settles it.
CREATE OR REPLACE FUNCTION public.settle_scheduled_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.finance_restore_active() AND coalesce(current_setting('finance.restore_transaction',true),'0')<>'1' THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
  VALUES(NEW.id,NEW.user_id,NEW.occurrence_record_id,NEW.occurrence_due_on,'paid',NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.settle_scheduled_payment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS settle_scheduled_payment ON public.finance_records;
CREATE TRIGGER settle_scheduled_payment AFTER INSERT ON public.finance_records
 FOR EACH ROW WHEN (NEW.occurrence_record_id IS NOT NULL AND NEW.occurrence_due_on IS NOT NULL) EXECUTE FUNCTION public.settle_scheduled_payment();

DROP FUNCTION IF EXISTS public.link_scheduled_income_receipt();
DROP FUNCTION IF EXISTS public.link_scheduled_income(uuid);

-- Recent business and rent income saved before this settles its schedule's open payment.
DO $$ DECLARE payment public.finance_records; schedule public.finance_records; due date; BEGIN
 FOR payment IN SELECT * FROM public.finance_records r WHERE r.frequency='Once' AND r.kind IN ('Business income','Rent income') AND r.occurrence_record_id IS NULL
  AND r.date>=date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)-interval '1 month'
  AND NOT EXISTS(SELECT 1 FROM public.payment_occurrences o WHERE o.user_id=r.user_id AND o.transaction_id=r.id) ORDER BY r.date,r.created_at,r.id LOOP
  SELECT * INTO schedule FROM public.finance_records WHERE id=public.income_schedule_of(payment);
  CONTINUE WHEN NOT FOUND;
  due:=public.scheduled_payment_due(payment,schedule);
  CONTINUE WHEN due IS NULL OR EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=payment.user_id AND record_id=schedule.id AND due_on=due);
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id) VALUES(gen_random_uuid(),payment.user_id,schedule.id,due,'paid',payment.id);
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- A payment in another currency settles its schedule. Needs 119.
-- Pixel Game Club pays a USD schedule, but its payment came in UZS: the currency
-- rule left it unlinked, so Transactions showed it while Recurring kept the month
-- open. A payment now names its schedule whatever its currency; it keeps its own
-- currency and amount, and the planning read counts it in the schedule's currency
-- at the official rate of the payment's day.
-- * A business or rent income that names no schedule takes the id of the one active
--   schedule of its business or property, in any currency.
-- * A payment that names a schedule in another currency is accepted.
-- Business and rent income from this month and last month that is still unlinked
-- settles its open payment once here, oldest first, as in 119.
BEGIN;

CREATE OR REPLACE FUNCTION public.income_schedule_of(payment public.finance_records) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE found uuid[];
BEGIN
 IF payment.kind NOT IN ('Business income','Rent income') OR payment.earning_source_id IS NOT NULL OR payment.payment_type<>'regular'
  OR (CASE WHEN payment.kind='Business income' THEN payment.business_id ELSE payment.income_source_id END) IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(candidate.id) INTO found FROM public.finance_records candidate
  WHERE candidate.user_id=payment.user_id AND candidate.kind=payment.kind AND candidate.frequency<>'Once'
  AND NOT candidate.archived AND NOT candidate.source_paused
  AND (CASE WHEN payment.kind='Business income' THEN candidate.business_id=payment.business_id ELSE candidate.income_source_id=payment.income_source_id END);
 RETURN CASE WHEN cardinality(found)=1 THEN found[1] END;
END $$;
REVOKE ALL ON FUNCTION public.income_schedule_of(public.finance_records) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.name_scheduled_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule public.finance_records; incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income'];
BEGIN
 -- Rows written by a verified restore or an undo keep exactly what they were saved with.
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.occurrence_record_id,NEW.occurrence_due_on) IS DISTINCT FROM (OLD.occurrence_record_id,OLD.occurrence_due_on) THEN RAISE EXCEPTION 'A scheduled payment keeps its schedule.'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.frequency<>'Once' OR NEW.date IS NULL THEN
  IF NEW.occurrence_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
  RETURN NEW;
 END IF;
 NEW.occurrence_record_id:=coalesce(NEW.occurrence_record_id,public.income_schedule_of(NEW));
 IF NEW.occurrence_record_id IS NULL THEN NEW.occurrence_due_on:=NULL; RETURN NEW; END IF;
 SELECT * INTO schedule FROM public.finance_records WHERE id=NEW.occurrence_record_id AND user_id=NEW.user_id AND frequency<>'Once';
 IF NOT FOUND OR (NEW.kind=ANY(incomes))<>(schedule.kind=ANY(incomes)) THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
 IF NEW.occurrence_due_on IS NULL THEN
  NEW.occurrence_due_on:=public.scheduled_payment_due(NEW,schedule);
  IF NEW.occurrence_due_on IS NULL THEN NEW.occurrence_record_id:=NULL; END IF;
 ELSIF NOT public.is_schedule_date(schedule.frequency,schedule.date,schedule.end_date,NEW.occurrence_due_on,schedule.recurrence_days) THEN
  RAISE EXCEPTION 'Choose a scheduled payment date.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.name_scheduled_payment() FROM PUBLIC,anon,authenticated;

-- Recent business and rent income in another currency than its schedule settles the schedule's open payment.
DO $$ DECLARE payment public.finance_records; schedule public.finance_records; due date; BEGIN
 FOR payment IN SELECT * FROM public.finance_records r WHERE r.frequency='Once' AND r.kind IN ('Business income','Rent income') AND r.occurrence_record_id IS NULL
  AND r.date>=date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)-interval '1 month'
  AND NOT EXISTS(SELECT 1 FROM public.payment_occurrences o WHERE o.user_id=r.user_id AND o.transaction_id=r.id) ORDER BY r.date,r.created_at,r.id LOOP
  SELECT * INTO schedule FROM public.finance_records WHERE id=public.income_schedule_of(payment);
  CONTINUE WHEN NOT FOUND;
  due:=public.scheduled_payment_due(payment,schedule);
  CONTINUE WHEN due IS NULL OR EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=payment.user_id AND record_id=schedule.id AND due_on=due);
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id) VALUES(gen_random_uuid(),payment.user_id,schedule.id,due,'paid',payment.id);
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Money lent can leave a cash account. Needs 117 (the loan's history starts on its lent date).
-- A new Money lent record names the cash account the money came from. The loan
-- is saved at zero and the lent amount is then added from that account, in one
-- transaction: the account loses what the borrower now owes, net worth stays
-- the same, and the tracker shows the cash link like any later addition. A
-- retry after a lost response returns the saved loan without moving cash twice.
BEGIN;

CREATE OR REPLACE FUNCTION public.lend_from_account(p_record jsonb,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE loan uuid; lent numeric; lent_on date;
BEGIN
 IF jsonb_typeof(p_record)<>'object' OR p_record->>'kind' IS DISTINCT FROM 'Money lent' OR p_account IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 loan:=(p_record->>'id')::uuid; lent:=(p_record->>'amount')::numeric; lent_on:=(p_record->>'lent_date')::date;
 IF loan IS NULL OR lent IS NULL OR lent<=0 OR lent_on IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 -- The cash movement takes the loan's id, so a retry finds it and changes nothing.
 IF EXISTS(SELECT 1 FROM public.investment_account_links WHERE id=loan) THEN
  IF NOT EXISTS(SELECT 1 FROM public.investment_account_links WHERE id=loan AND account_id=p_account AND amount=-lent) THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN (SELECT jsonb_build_array(to_jsonb(r)) FROM public.finance_records r WHERE r.id=loan);
 END IF;
 PERFORM public.save_finance_record(p_record||jsonb_build_object('amount',0),NULL);
 PERFORM public.record_investment_with_account(loan,loan,'contribution',lent_on,lent,NULL,'',p_account);
 RETURN (SELECT jsonb_build_array(to_jsonb(r)) FROM public.finance_records r WHERE r.id=loan);
END $$;
REVOKE ALL ON FUNCTION public.lend_from_account(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lend_from_account(jsonb,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Built-in categories can be deleted (migration 122).
BEGIN;

ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order','business_order','tag_order','tax_lines','category_icons','removed_categories'));

-- What still uses a built-in category without one of the workspace's own categories on it.
CREATE OR REPLACE FUNCTION public.built_in_category_usage(p_kind text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); active_count integer; deleted_count integer; watch_count integer; rule_count integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Category not found.'; END IF;
 SELECT count(*) INTO active_count FROM public.finance_records WHERE user_id=owner AND kind=p_kind AND custom_category_id IS NULL;
 SELECT count(*) INTO deleted_count FROM public.deleted_items WHERE user_id=owner AND source='finance_records' AND data->>'kind'=p_kind AND coalesce(data->>'custom_category_id','')='';
 SELECT count(*) INTO watch_count FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements(w.data->'items') item WHERE w.user_id=owner AND w.key='watchlists' AND item->>'category'=p_kind;
 SELECT (SELECT count(*) FROM public.transaction_rules WHERE user_id=owner AND ((kind=p_kind AND category_id IS NULL) OR (match_kind=p_kind AND match_category_id IS NULL)))
  +(SELECT count(*) FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements(w.data->'items') item WHERE w.user_id=owner AND w.key='entry_templates' AND item->>'kind'=p_kind AND coalesce(item->>'custom_category_id','')='')
  INTO rule_count;
 RETURN jsonb_build_object('records',active_count,'deleted',deleted_count,'watchlists',watch_count,'rules',rule_count);
END $$;

CREATE OR REPLACE FUNCTION public.delete_built_in_category(p_kind text,p_replacement uuid DEFAULT NULL,p_new_name text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); side text; general text; built_ins text[]; removed text[]; target uuid:=p_replacement; usage jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Category not found.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 side:=CASE WHEN p_kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END;
 general:=CASE WHEN side='income' THEN 'Other income' ELSE 'Other expense' END;
 built_ins:=CASE WHEN side='income' THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END;
 SELECT coalesce(array_agg(value),'{}') INTO removed FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements_text(w.data->'kinds') value WHERE w.user_id=owner AND w.key='removed_categories';
 IF p_kind=ANY(removed) THEN RAISE EXCEPTION 'Category not found.'; END IF;
 IF p_new_name IS NOT NULL THEN
  IF target IS NOT NULL OR length(trim(p_new_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Check the category name and type.'; END IF;
  target:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(target,owner,trim(p_new_name),side);
 END IF;
 IF target IS NOT NULL THEN
  PERFORM 1 FROM public.transaction_categories c WHERE c.id=target AND c.user_id=owner AND c.direction=side;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a different category of the same type.'; END IF;
 END IF;
 -- Someone always has a category to record income, and one to record spending, in.
 IF NOT EXISTS(SELECT 1 FROM unnest(built_ins) kind WHERE kind<>p_kind AND kind<>ALL(removed))
  AND NOT EXISTS(SELECT 1 FROM public.transaction_categories c WHERE c.user_id=owner AND c.direction=side) THEN
  RAISE EXCEPTION 'Keep at least one category of this type.';
 END IF;
 usage:=public.built_in_category_usage(p_kind);
 IF target IS NULL AND (usage->>'records')::integer+(usage->>'deleted')::integer+(usage->>'watchlists')::integer+(usage->>'rules')::integer>0 THEN
  RAISE EXCEPTION 'This category is in use. Choose a replacement category.';
 END IF;
 IF target IS NOT NULL THEN
  UPDATE public.finance_records SET custom_category_id=target WHERE user_id=owner AND kind=p_kind AND custom_category_id IS NULL;
  UPDATE public.deleted_items SET data=jsonb_set(data,'{custom_category_id}',to_jsonb(target)) WHERE user_id=owner AND source='finance_records' AND data->>'kind'=p_kind AND coalesce(data->>'custom_category_id','')='';
  -- A rule or template names an added category on its direction's general kind.
  UPDATE public.transaction_rules SET kind=general,category_id=target WHERE user_id=owner AND kind=p_kind AND category_id IS NULL;
  UPDATE public.transaction_rules SET match_kind=general,match_category_id=target WHERE user_id=owner AND match_kind=p_kind AND match_category_id IS NULL;
  UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN item->>'category'=p_kind THEN jsonb_set(item,'{category}',to_jsonb(target::text)) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
   WHERE w.user_id=owner AND w.key='watchlists' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item WHERE item->>'category'=p_kind);
  UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN item->>'kind'=p_kind AND coalesce(item->>'custom_category_id','')='' THEN item||jsonb_build_object('kind',general,'custom_category_id',target) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
   WHERE w.user_id=owner AND w.key='entry_templates' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item WHERE item->>'kind'=p_kind AND coalesce(item->>'custom_category_id','')='');
 END IF;
 INSERT INTO public.workspace_preferences(user_id,key,data) VALUES(owner,'removed_categories',jsonb_build_object('kinds',to_jsonb(removed||p_kind)))
  ON CONFLICT(user_id,key) DO UPDATE SET data=EXCLUDED.data;
 RETURN jsonb_build_object('ok',true,'replacement',target);
END $$;

REVOKE ALL ON FUNCTION public.built_in_category_usage(text),public.delete_built_in_category(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.built_in_category_usage(text),public.delete_built_in_category(text,uuid,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Loan, debt and mortgage start dates can be set or corrected. Apply after 122.
-- A loan's monthly payment falls on its start date's day of the month. The
-- start date was fixed once saved, so a mortgage saved without one (or with the
-- wrong one) kept its payments on the day it was added, and nothing could move
-- them. It can now change, as long as no recorded payment, repayment or tracker
-- update comes before the new date; it cannot be cleared. The record's first
-- tracked value (its baseline) moves with it, as money lent's does (117).
-- Opening dates of cash and holdings stay fixed; a restore still passes through.
-- No balances change.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_opening_balance_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NEW.opened_on IS NOT NULL AND (NEW.kind NOT IN ('Cash','Deposit','Treasury bill','Bond','Stock','Crypto','Precious metals','Equity compensation','Debt','Loan','Mortgage') OR NEW.opened_on>(now() AT TIME ZONE 'Asia/Tashkent')::date) THEN
  RAISE EXCEPTION 'Check the opening balance date.';
 END IF;
 IF NEW.kind IN ('Debt','Loan','Mortgage') AND NEW.opened_on IS NOT NULL AND NEW.date<NEW.opened_on THEN
  RAISE EXCEPTION 'Check the start and due dates.';
 END IF;
 IF TG_OP='UPDATE' AND NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN
  IF OLD.kind NOT IN ('Debt','Loan','Mortgage') THEN RAISE EXCEPTION 'The opening balance date cannot change after creation.'; END IF;
  IF NEW.opened_on IS NULL OR NEW.kind<>OLD.kind THEN RAISE EXCEPTION 'The start date cannot change after creation.'; END IF;
  IF EXISTS(SELECT 1 FROM public.mortgage_payments WHERE mortgage_id=NEW.id AND paid_on<NEW.opened_on)
   OR EXISTS(SELECT 1 FROM public.account_activity WHERE target_id=NEW.id AND occurred_on<NEW.opened_on)
   OR EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=NEW.id AND event_type<>'baseline' AND occurred_on<NEW.opened_on) THEN
   RAISE EXCEPTION 'The start date cannot be after a recorded payment.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_opening_balance_date() FROM PUBLIC,anon,authenticated;

-- The baseline follows a changed start date while it stays the record's first event.
CREATE OR REPLACE FUNCTION public.date_liability_baseline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind NOT IN ('Debt','Loan','Mortgage') OR NEW.opened_on IS NULL OR NEW.opened_on IS NOT DISTINCT FROM OLD.opened_on THEN RETURN NEW; END IF;
 IF public.finance_restore_active() OR current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 UPDATE public.investment_history h SET occurred_on=NEW.opened_on
 WHERE h.record_id=NEW.id AND h.event_type='baseline' AND h.occurred_on<>NEW.opened_on
  AND NOT EXISTS(SELECT 1 FROM public.investment_history o WHERE o.record_id=NEW.id AND o.id<>h.id AND o.occurred_on<NEW.opened_on);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.date_liability_baseline() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS date_liability_baseline ON public.finance_records;
CREATE TRIGGER date_liability_baseline AFTER UPDATE OF opened_on ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.date_liability_baseline();

NOTIFY pgrst,'reload schema';
COMMIT;

-- Database integrity from the 2026-10-09 code review. Apply after 123.
-- 1. save_finance_record refuses an id that belongs to someone else. Called from
--    the Telegram bot it runs with row security bypassed, and a foreign id used to
--    take the "new record" branch and overwrite that row through the upsert.
-- 2. Record amounts, quantities, costs and rates are capped at 1e15 like every
--    other money column. The cap also refuses NaN and Infinity, which pass `>=0`.
-- 3. Restoring a deleted transaction whose statement was imported again meanwhile
--    keeps both copies: the restored one gives up its source identifier instead of
--    failing on finance_import_key.
-- 4. Indexes on the columns that point at records, so deleting a record no longer
--    scans every owner's rows, and on the per-owner reads that had none.
-- 5. The capability version follows the newest migration, so the app reports a
--    missing one as "The app database needs an update."
BEGIN;

-- Re-running is a no-op: a patch whose new text is already present is skipped.
CREATE OR REPLACE FUNCTION pg_temp.patch_integrity(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: % (% of 1 matches)',fn,found; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

SELECT pg_temp.patch_integrity('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$ ELSIF p_expected_revision IS NOT NULL THEN$old$,
 $new$ ELSIF EXISTS(SELECT 1 FROM public.finance_records WHERE id=(p_record->>'id')::uuid) THEN
  RAISE EXCEPTION 'Record not found.';
 ELSIF p_expected_revision IS NOT NULL THEN$new$);
SELECT pg_temp.patch_integrity('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$ON CONFLICT(id) DO UPDATE SET %s RETURNING *',cols,vals,updates) INTO saved USING payload;$old$,
 $new$ON CONFLICT(id) DO UPDATE SET %s WHERE finance_records.user_id=excluded.user_id RETURNING *',cols,vals,updates) INTO saved USING payload;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Record not found.'; END IF;$new$);

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_figures_bounded;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_figures_bounded
 CHECK (amount<=1e15 AND quantity<=1e15 AND cost<=1e15 AND rate<=1e15) NOT VALID;
ALTER TABLE public.finance_records VALIDATE CONSTRAINT finance_records_figures_bounded;

SELECT pg_temp.patch_integrity('public.restore_deleted_item(uuid)'::regprocedure,
 $old$ IF NOT FOUND THEN RETURN; END IF;$old$,
 $new$ IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' AND item.data->>'import_key' IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=public.active_owner() AND import_key=item.data->>'import_key') THEN
  UPDATE public.deleted_items SET data=data-'import_key' WHERE id=item.id;
 END IF;$new$);

CREATE INDEX IF NOT EXISTS finance_records_account_ref ON public.finance_records(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_records_custom_category_ref ON public.finance_records(custom_category_id) WHERE custom_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_occurrences_record_ref ON public.payment_occurrences(record_id);
CREATE INDEX IF NOT EXISTS payment_occurrences_transaction_ref ON public.payment_occurrences(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_activity_account_ref ON public.account_activity(account_id);
CREATE INDEX IF NOT EXISTS account_activity_target_ref ON public.account_activity(target_id) WHERE target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_movements_source_ref ON public.asset_movements(source_id);
CREATE INDEX IF NOT EXISTS asset_movements_target_ref ON public.asset_movements(target_id);
CREATE INDEX IF NOT EXISTS savings_goals_account_ref ON public.savings_goals(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS investment_account_links_account_ref ON public.investment_account_links(account_id);
CREATE INDEX IF NOT EXISTS goal_events_source_ref ON public.goal_events(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_reconciliations_owner_account ON public.account_reconciliations(user_id,account_id,end_date DESC);
CREATE INDEX IF NOT EXISTS corporate_events_owner_record ON public.corporate_events(user_id,record_id,occurred_on DESC);
CREATE INDEX IF NOT EXISTS expense_plans_owner ON public.expense_plans(user_id);
CREATE INDEX IF NOT EXISTS telegram_login_tokens_owner ON public.telegram_login_tokens(user_id);

CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',124,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Category changes work again where migration 118 ran twice. Needs 118.
-- 118 patches recategorize_transactions by appending a name clause to its UPDATE.
-- Its re-run guard looked for the old text, which the new text still contains, so a
-- second run appended the clause again and every category change (inline, Edit
-- multiple and rules) failed with "multiple assignments to same column name"
-- (42601). This collapses repeated copies of the clause in the live definition, so
-- any other patches to the function stay as they are. A database that ran 118 once
-- is left unchanged, and re-running this is a no-op. No rows change.
-- The capability version moves to 125, so the app asks for this migration.
BEGIN;

DO $repair$
DECLARE
 fn regprocedure:='public.recategorize_transactions(uuid[],text,uuid)'::regprocedure;
 clause text:=$clause$,name=CASE WHEN lower(trim(r.name)) IN (lower(r.kind),lower(coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=r.custom_category_id),''))) THEN coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=p_category),p_kind) ELSE r.name END$clause$;
 definition text:=pg_get_functiondef(fn);
 repaired text:=definition;
BEGIN
 WHILE position(clause||clause IN repaired)>0 LOOP repaired:=replace(repaired,clause||clause,clause); END LOOP;
 IF repaired<>definition THEN EXECUTE repaired; END IF;
END $repair$;

CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',125,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Every transaction on the Transactions page can be deleted. Apply after 125.
-- A one-time income or expense written by another operation could not be deleted:
-- a tracker income or expense (history_event_id), a mortgage payment
-- (mortgage_payment_id), an asset movement's fee or interest (movement_id) and an
-- account operation's fee (operation_id). delete_linked_transaction(id) now undoes
-- the whole operation the row belongs to, in one transaction, from the amounts that
-- operation recorded (never today's exchange rate):
-- * tracker event: the linked cash account gives back what the event moved, and the
--   event, its cash link and the row go. The event id is kept in
--   deleted_tracker_updates, so the same update cannot be replayed.
-- * mortgage payment: the payment, its expense row and its history entry go; the
--   outstanding balance gets the principal back and the paying cash account gets
--   back what it paid (account operation or dated cash link). Its id cannot be
--   replayed either. The instalment shows as open again, because Recurring reads
--   paid instalments from mortgage payments.
-- * asset movement (transfer, buy, sell, capitalized interest): the movement with
--   its fee or interest rows and history entries goes; source and destination get
--   back their amounts and units, and a bought holding its earlier average cost.
-- * account operation fee (transfer or repayment): the operation, its fee and, for
--   a repayment in another currency, its dated cash link and history entry go;
--   both sides get back what the operation moved. The instalment opens again.
-- Nothing is undone when a balance or quantity would go below zero (for example
-- bought units that were sold since), and a holding with later purchases keeps its
-- trade until those are deleted. A balance whose history no longer ends at the
-- restored value gets today's corrected value, as delete_tracker_update does.
-- The operation goes to Recently deleted as one entry: data is the clicked row, so
-- the list shows it like any transaction, and the new column
-- deleted_items.linked_operation holds every row removed (transactions, history,
-- cash links, mortgage payment, movement, account activity), the history rows the
-- reversal added, the replay tombstones it wrote and each balance's amount,
-- quantity and cost before and after. restore_deleted_item puts all of it back with
-- the same ids and re-applies the recorded balance changes, or changes nothing when
-- a balance would become invalid. permanently_delete_item only drops the entry; the
-- operation stays undone and its ids stay unusable.
-- The four guards let exactly the row this function is deleting through, named by
-- the transaction-local setting finance.linked_delete. Re-running this is a no-op.
BEGIN;

ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS linked_operation jsonb;

DO $patch$
DECLARE
 fn regprocedure;
 anchor text:=$a$IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;$a$;
 bypass text:=$b$ IF TG_OP='DELETE' AND OLD.id::text=current_setting('finance.linked_delete',true) THEN RETURN OLD; END IF;$b$;
 definition text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.guard_investment_history_record()'::regprocedure,'public.guard_mortgage_payment_record()'::regprocedure,
  'public.guard_movement_record()'::regprocedure,'public.guard_operation_record()'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  CONTINUE WHEN position('finance.linked_delete' IN definition)>0;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected definition of %. Apply migrations in order.',fn; END IF;
  EXECUTE replace(definition,anchor,anchor||chr(10)||bypass);
 END LOOP;
 -- A linked operation restores as a whole.
 definition:=pg_get_functiondef('public.restore_deleted_item(uuid)'::regprocedure);
 IF position('restore_linked_transaction' IN definition)=0 THEN
  -- Placed before the goal branch, so the text migration 124 added stays whole.
  anchor:=$a$ IF item.source='savings_goals' THEN$a$;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected definition of restore_deleted_item. Apply migrations in order.'; END IF;
  EXECUTE replace(definition,anchor,$b$ IF item.linked_operation IS NOT NULL THEN PERFORM public.restore_linked_transaction(item.id); RETURN; END IF;$b$||chr(10)||anchor);
 END IF;
END $patch$;

-- Removes the named rows of the open workspace past the guards. Their single-row
-- Recently deleted entries go too: the operation is archived as one entry.
CREATE OR REPLACE FUNCTION public.delete_linked_rows(p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); item uuid;
BEGIN
 FOR item IN SELECT id FROM public.finance_records WHERE user_id=owner AND id=ANY(p_ids) ORDER BY id LOOP
  PERFORM set_config('finance.linked_delete',item::text,true);
  DELETE FROM public.finance_records WHERE id=item AND user_id=owner;
  DELETE FROM public.deleted_items WHERE user_id=owner AND source='finance_records' AND data->>'id'=item::text;
 END LOOP;
 PERFORM set_config('finance.linked_delete','',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_linked_rows(uuid[]) FROM PUBLIC,anon,authenticated;

-- Sets a balance back. History gets today's corrected value only when what remains
-- of it no longer ends at the restored balance.
CREATE OR REPLACE FUNCTION public.restore_linked_balance(p_record uuid,p_amount numeric,p_quantity numeric,p_cost numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); r public.finance_records; units boolean; latest numeric;
BEGIN
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
 units:=r.kind IN ('Stock','Crypto','Precious metals','Equity compensation');
 IF units AND p_quantity<0 THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.'; END IF;
 IF p_amount<0 OR p_amount>1e15 OR p_quantity<0 OR p_quantity>1e15 OR p_cost<0 OR p_cost>1e15 THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.'; END IF;
 SELECT balance INTO latest FROM public.investment_history WHERE record_id=r.id AND user_id=owner AND balance IS NOT NULL ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 1;
 PERFORM set_config('finance.history_write',CASE WHEN latest IS NOT DISTINCT FROM p_amount*CASE WHEN units THEN p_quantity ELSE 1 END THEN '1' ELSE '0' END,true);
 UPDATE public.finance_records SET amount=p_amount,quantity=p_quantity,cost=p_cost WHERE id=r.id AND user_id=owner;
 PERFORM set_config('finance.history_write','0',true);
END $$;
REVOKE ALL ON FUNCTION public.restore_linked_balance(uuid,numeric,numeric,numeric) FROM PUBLIC,anon,authenticated;

-- Undoes a dated cash link (record_investment_with_fx and its older account form):
-- the cash account gives back the recorded delta, the link goes, and so does the
-- mirrored cash entry a debt or mortgage payment wrote beside it.
CREATE OR REPLACE FUNCTION public.reverse_cash_link(p_link public.investment_account_links,p_event public.investment_history,p_record_currency text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); a public.finance_records;
BEGIN
 SELECT * INTO a FROM public.finance_records WHERE id=p_link.account_id AND user_id=owner AND kind='Cash';
 IF a.id IS NULL OR a.currency<>coalesce(p_link.account_currency,p_record_currency) THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
 IF a.amount-p_link.amount<0 OR a.amount-p_link.amount>1e15 THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.'; END IF;
 DELETE FROM public.investment_account_links WHERE id=p_link.id AND user_id=owner;
 IF EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_event.record_id AND kind IN ('Money lent','Loan','Debt','Mortgage')) THEN
 DELETE FROM public.investment_history WHERE id=(SELECT id FROM public.investment_history WHERE record_id=a.id AND user_id=owner
  AND event_type=CASE WHEN p_link.amount<0 THEN 'withdrawal' ELSE 'contribution' END AND occurred_on=p_event.occurred_on AND amount=abs(p_link.amount)
  AND notes=p_event.notes AND created_at>=p_event.created_at AND created_at<p_event.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1);
 END IF;
 PERFORM public.restore_linked_balance(a.id,a.amount-p_link.amount,a.quantity,a.cost);
END $$;
REVOKE ALL ON FUNCTION public.reverse_cash_link(public.investment_account_links,public.investment_history,text) FROM PUBLIC,anon,authenticated;

-- Everything an operation can touch: balances of its records, their history, and the
-- rows that name the operation's ids. Comparing it before and after a delete gives
-- exactly what the delete removed, added and changed.
CREATE OR REPLACE FUNCTION public.linked_state(p_records uuid[],p_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'balances',(SELECT coalesce(jsonb_object_agg(r.id,jsonb_build_object('amount',r.amount,'quantity',r.quantity,'cost',r.cost)),'{}'::jsonb) FROM public.finance_records r WHERE r.user_id=public.active_owner() AND r.id=ANY(p_records)),
  'records',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.finance_records r WHERE r.user_id=public.active_owner()
   AND (r.id=ANY(p_ids) OR r.history_event_id=ANY(p_ids) OR r.mortgage_payment_id=ANY(p_ids) OR r.movement_id=ANY(p_ids) OR r.operation_id=ANY(p_ids))),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) FROM public.investment_history h WHERE h.user_id=public.active_owner() AND (h.record_id=ANY(p_records) OR h.id=ANY(p_ids))),
  'links',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.investment_account_links l WHERE l.user_id=public.active_owner() AND l.id=ANY(p_ids)),
  'mortgage_payments',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM public.mortgage_payments m WHERE m.user_id=public.active_owner() AND m.id=ANY(p_ids)),
  'asset_movements',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM public.asset_movements m WHERE m.user_id=public.active_owner() AND m.id=ANY(p_ids)),
  'account_activity',(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM public.account_activity o WHERE o.user_id=public.active_owner() AND o.id=ANY(p_ids)),
  'tombstones',(SELECT coalesce(jsonb_agg(d.id),'[]'::jsonb) FROM public.deleted_tracker_updates d WHERE d.user_id=public.active_owner() AND d.id=ANY(p_ids)))
$$;
REVOKE ALL ON FUNCTION public.linked_state(uuid[],uuid[]) FROM PUBLIC,anon,authenticated;

-- The rows of one list in a state that another state no longer has, by id.
CREATE OR REPLACE FUNCTION public.linked_missing(p_from jsonb,p_in jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(p_from) x
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_in) y WHERE coalesce(y->>'id',y#>>'{}')=coalesce(x->>'id',x#>>'{}'))
$$;
REVOKE ALL ON FUNCTION public.linked_missing(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.delete_linked_transaction(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); t public.finance_records; h public.investment_history; link public.investment_account_links;
 r public.finance_records; a public.finance_records; b public.finance_records; op public.account_activity; pay public.mortgage_payments;
 move public.asset_movements; units boolean; quantity numeric; cost numeric;
 ids uuid[]; touched uuid[]; before jsonb; after jsonb; splits jsonb; occurrences jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO t FROM public.finance_records WHERE id=p_id AND user_id=owner FOR UPDATE;
 IF t.id IS NULL THEN
  -- A retry after a tracker event or payment was deleted.
  IF EXISTS(SELECT 1 FROM public.deleted_tracker_updates WHERE id=p_id AND user_id=owner) THEN RETURN jsonb_build_object('ok',true); END IF;
  RAISE EXCEPTION 'Record not found.';
 END IF;
 IF t.history_event_id IS NULL AND t.mortgage_payment_id IS NULL AND t.movement_id IS NULL AND t.operation_id IS NULL THEN
  RAISE EXCEPTION 'This transaction has no linked operation. Delete it normally.';
 END IF;
 ids:=array_remove(ARRAY[t.id,t.history_event_id,t.mortgage_payment_id,t.movement_id,t.operation_id],NULL);
 touched:=ARRAY(SELECT DISTINCT x FROM (
   SELECT record_id AS x FROM public.investment_history WHERE user_id=owner AND id=t.history_event_id
   UNION ALL SELECT account_id FROM public.investment_account_links WHERE user_id=owner AND id=ANY(ids)
   UNION ALL SELECT mortgage_id FROM public.mortgage_payments WHERE user_id=owner AND id=t.mortgage_payment_id
   UNION ALL SELECT unnest(ARRAY[account_id,target_id]) FROM public.account_activity WHERE user_id=owner AND id=ANY(ids)
   UNION ALL SELECT unnest(ARRAY[source_id,target_id]) FROM public.asset_movements WHERE user_id=owner AND id=t.movement_id) s WHERE x IS NOT NULL);
 before:=public.linked_state(touched,ids);
 SELECT coalesce(jsonb_agg(jsonb_build_object('category_id',coalesce(category_id::text,kind),'amount',amount) ORDER BY position),'[]'::jsonb) INTO splits
  FROM public.transaction_splits WHERE record_id=t.id AND user_id=owner;
 SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) INTO occurrences FROM public.payment_occurrences o WHERE o.transaction_id=t.id AND o.user_id=owner;
 BEGIN
 IF t.history_event_id IS NOT NULL THEN
  SELECT * INTO h FROM public.investment_history WHERE id=t.history_event_id AND user_id=owner FOR UPDATE;
  SELECT * INTO link FROM public.investment_account_links WHERE id=h.id AND user_id=owner;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(h.record_id,link.account_id) ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.finance_records WHERE id=h.record_id AND user_id=owner;
  IF h.id IS NULL OR r.id IS NULL OR h.event_type NOT IN ('income','expense') THEN RAISE EXCEPTION 'Record not found.'; END IF;
  PERFORM public.delete_linked_rows(ARRAY[t.id]);
  INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link) VALUES(h.id,owner,r.id,to_jsonb(h),CASE WHEN link.id IS NOT NULL THEN to_jsonb(link) END);
  IF link.id IS NOT NULL THEN PERFORM public.reverse_cash_link(link,h,r.currency); END IF;
  DELETE FROM public.investment_history WHERE id=h.id AND user_id=owner;
 ELSIF t.mortgage_payment_id IS NOT NULL THEN
  SELECT * INTO pay FROM public.mortgage_payments WHERE id=t.mortgage_payment_id AND user_id=owner FOR UPDATE;
  SELECT * INTO op FROM public.account_activity WHERE id=pay.id AND user_id=owner AND action='mortgage';
  SELECT * INTO link FROM public.investment_account_links WHERE id=pay.id AND user_id=owner;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(pay.mortgage_id,op.account_id,link.account_id) ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.finance_records WHERE id=pay.mortgage_id AND user_id=owner AND kind='Mortgage';
  IF pay.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Mortgage not found.'; END IF;
  SELECT * INTO h FROM public.investment_history WHERE id=pay.id AND user_id=owner AND record_id=r.id AND event_type='mortgage_payment';
  PERFORM public.delete_linked_rows(ARRAY(SELECT id FROM public.finance_records WHERE user_id=owner AND mortgage_payment_id=pay.id));
  INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link)
  VALUES(pay.id,owner,r.id,coalesce(to_jsonb(h),to_jsonb(pay)),CASE WHEN link.id IS NOT NULL THEN to_jsonb(link) END) ON CONFLICT(id) DO NOTHING;
  IF link.id IS NOT NULL THEN PERFORM public.reverse_cash_link(link,h,r.currency); END IF;
  IF op.id IS NOT NULL THEN
   SELECT * INTO a FROM public.finance_records WHERE id=op.account_id AND user_id=owner AND kind='Cash';
   IF a.id IS NULL OR a.currency<>r.currency THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
   DELETE FROM public.account_activity WHERE id=op.id AND user_id=owner;
   PERFORM public.restore_linked_balance(a.id,a.amount+op.amount+op.fee,a.quantity,a.cost);
  END IF;
  DELETE FROM public.investment_history WHERE id=h.id AND user_id=owner;
  DELETE FROM public.mortgage_payments WHERE id=pay.id AND user_id=owner;
  PERFORM public.restore_linked_balance(r.id,r.amount+pay.principal,r.quantity,r.cost);
 ELSIF t.movement_id IS NOT NULL THEN
  SELECT * INTO move FROM public.asset_movements WHERE id=t.movement_id AND user_id=owner FOR UPDATE;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(move.source_id,move.target_id) ORDER BY id FOR UPDATE;
  SELECT * INTO a FROM public.finance_records WHERE id=move.source_id AND user_id=owner;
  SELECT * INTO b FROM public.finance_records WHERE id=move.target_id AND user_id=owner;
  IF move.id IS NULL OR a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Record not found.'; END IF;
  units:=b.kind IN ('Stock','Crypto','Precious metals','Equity compensation');
  quantity:=CASE WHEN units THEN b.quantity-move.received ELSE b.quantity END;
  IF (units AND quantity<0) OR (NOT units AND b.amount-move.received<0) THEN
   RAISE EXCEPTION '%',CASE WHEN units THEN 'Insufficient balance or holding quantity.' ELSE 'The cash reversal would create an invalid balance.' END;
  END IF;
  cost:=b.cost;
  -- A purchase moved the holding's average cost; take that back. Later purchases
  -- averaged on top of it, so they go first.
  IF units AND EXISTS(SELECT 1 FROM public.asset_movements WHERE user_id=owner AND target_id=b.id AND id<>move.id AND (created_at,id)>(move.created_at,move.id)) THEN
   RAISE EXCEPTION 'Delete later trades of this holding first.';
  END IF;
  IF units AND move.target_before>0 THEN cost:=greatest((b.cost*move.target_after-move.target_value)/move.target_before,0); END IF;
  PERFORM public.delete_linked_rows(ARRAY(SELECT id FROM public.finance_records WHERE user_id=owner AND movement_id=move.id));
  DELETE FROM public.investment_history WHERE id IN(
   (SELECT id FROM public.investment_history WHERE move.kind<>'interest' AND record_id=a.id AND user_id=owner AND event_type='withdrawal' AND occurred_on=move.occurred_on
     AND amount=move.source_value AND notes=move.notes AND created_at>=move.created_at AND created_at<move.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1),
   (SELECT id FROM public.investment_history WHERE record_id=b.id AND user_id=owner AND event_type=CASE WHEN move.kind='interest' THEN 'income' ELSE 'contribution' END AND occurred_on=move.occurred_on
     AND amount=move.target_value AND notes=move.notes AND created_at>=move.created_at AND created_at<move.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1));
  DELETE FROM public.asset_movements WHERE id=move.id AND user_id=owner;
  PERFORM public.restore_linked_balance(b.id,CASE WHEN units THEN b.amount ELSE b.amount-move.received END,quantity,cost);
  IF move.kind<>'interest' THEN
   SELECT * INTO a FROM public.finance_records WHERE id=a.id;
   PERFORM public.restore_linked_balance(a.id,CASE WHEN a.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN a.amount ELSE a.amount+move.sent END,
    CASE WHEN a.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN a.quantity+move.sent ELSE a.quantity END,a.cost);
  END IF;
 ELSE
  SELECT * INTO op FROM public.account_activity WHERE id=t.operation_id AND user_id=owner FOR UPDATE;
  IF op.id IS NULL OR op.action NOT IN ('transfer','repayment') THEN RAISE EXCEPTION 'This operation cannot be deleted.'; END IF;
  SELECT * INTO link FROM public.investment_account_links WHERE id=op.id AND user_id=owner;
  SELECT * INTO h FROM public.investment_history WHERE id=op.id AND user_id=owner;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(op.account_id,op.target_id) ORDER BY id FOR UPDATE;
  SELECT * INTO a FROM public.finance_records WHERE id=op.account_id AND user_id=owner AND kind='Cash';
  SELECT * INTO b FROM public.finance_records WHERE id=op.target_id AND user_id=owner;
  IF a.id IS NULL OR b.id IS NULL OR (op.action='transfer' AND b.kind<>'Cash') OR (op.action='repayment' AND b.kind NOT IN ('Money lent','Loan','Debt'))
   OR (link.id IS NOT NULL AND (h.id IS NULL OR h.record_id<>b.id OR link.account_id<>a.id)) THEN RAISE EXCEPTION 'This operation cannot be deleted.'; END IF;
  -- The fee rows go first; the account trigger gives their amount back to the account.
  PERFORM set_config('finance.history_write','1',true);
  PERFORM public.delete_linked_rows(ARRAY(SELECT id FROM public.finance_records WHERE user_id=owner AND operation_id=op.id));
  PERFORM set_config('finance.history_write','0',true);
  DELETE FROM public.account_activity WHERE id=op.id AND user_id=owner;
  SELECT * INTO a FROM public.finance_records WHERE id=a.id;
  IF link.id IS NOT NULL THEN
   -- A repayment in another currency: undo its dated cash link and debt history.
   INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link) VALUES(h.id,owner,b.id,to_jsonb(h),to_jsonb(link)) ON CONFLICT(id) DO NOTHING;
   PERFORM public.reverse_cash_link(link,h,b.currency);
   DELETE FROM public.investment_history WHERE id=h.id AND user_id=owner;
   PERFORM public.restore_linked_balance(b.id,b.amount+CASE WHEN h.event_type='withdrawal' THEN h.amount ELSE -h.amount END,b.quantity,b.cost);
  ELSIF op.action='transfer' THEN
   PERFORM public.restore_linked_balance(b.id,b.amount-op.received,b.quantity,b.cost);
   PERFORM public.restore_linked_balance(a.id,a.amount+op.amount,a.quantity,a.cost);
  ELSE
   PERFORM public.restore_linked_balance(b.id,b.amount+op.amount,b.quantity,b.cost);
   PERFORM public.restore_linked_balance(a.id,a.amount-CASE WHEN b.kind='Money lent' THEN op.amount ELSE -op.amount END,a.quantity,a.cost);
  END IF;
 END IF;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.';
 END;
 after:=public.linked_state(touched,ids);
 INSERT INTO public.deleted_items(user_id,source,data,splits,occurrences,linked_operation)
 VALUES(owner,'finance_records',to_jsonb(t),splits,occurrences,jsonb_build_object(
  'records',public.linked_missing(before->'records',after->'records'),
  'history',public.linked_missing(before->'history',after->'history'),
  'links',public.linked_missing(before->'links',after->'links'),
  'mortgage_payments',public.linked_missing(before->'mortgage_payments',after->'mortgage_payments'),
  'asset_movements',public.linked_missing(before->'asset_movements',after->'asset_movements'),
  'account_activity',public.linked_missing(before->'account_activity',after->'account_activity'),
  'added_history',(SELECT coalesce(jsonb_agg(x->'id'),'[]'::jsonb) FROM jsonb_array_elements(public.linked_missing(after->'history',before->'history')) x),
  'tombstones',public.linked_missing(after->'tombstones',before->'tombstones'),
  'balances',(SELECT coalesce(jsonb_object_agg(key,jsonb_build_object('before',value,'after',after->'balances'->key)),'{}'::jsonb) FROM jsonb_each(before->'balances'))));
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_linked_transaction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_linked_transaction(uuid) TO authenticated;

-- Puts a deleted operation back exactly: the same rows with the same ids, and each
-- balance changed again by what the delete gave back. Nothing changes when a
-- balance or quantity would become invalid (the money was spent meanwhile).
CREATE OR REPLACE FUNCTION public.restore_linked_transaction(p_item uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); item public.deleted_items; snap jsonb; key text; change jsonb; r public.finance_records;
 targets jsonb:='{}'::jsonb; amount numeric; quantity numeric; cost numeric; previous_write text; previous_restore text;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO item FROM public.deleted_items WHERE id=p_item AND user_id=owner FOR UPDATE;
 IF item.id IS NULL OR item.linked_operation IS NULL THEN RETURN; END IF;
 snap:=item.linked_operation;
 PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(SELECT k::uuid FROM jsonb_object_keys(snap->'balances') k) ORDER BY id FOR UPDATE;
 FOR key,change IN SELECT * FROM jsonb_each(snap->'balances') LOOP
  SELECT * INTO r FROM public.finance_records WHERE id=key::uuid AND user_id=owner;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Record not found.'; END IF;
  amount:=r.amount+(change->'before'->>'amount')::numeric-(change->'after'->>'amount')::numeric;
  quantity:=r.quantity+(change->'before'->>'quantity')::numeric-(change->'after'->>'quantity')::numeric;
  -- A cost the delete set back returns to the trade's average unless it moved since.
  cost:=CASE WHEN r.cost=(change->'after'->>'cost')::numeric THEN (change->'before'->>'cost')::numeric ELSE r.cost END;
  IF amount<0 OR amount>1e15 OR quantity<0 OR quantity>1e15 THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.'; END IF;
  targets:=targets||jsonb_build_object(key,jsonb_build_object('amount',amount,'quantity',quantity,'cost',cost));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'records') x JOIN public.finance_records f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'mortgage_payments') x JOIN public.mortgage_payments f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'asset_movements') x JOIN public.asset_movements f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'account_activity') x JOIN public.account_activity f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'links') x JOIN public.investment_account_links f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'history') x JOIN public.investment_history f ON f.id=(x->>'id')::uuid) THEN
  RAISE EXCEPTION 'This transaction already exists.';
 END IF;
 BEGIN
 DELETE FROM public.deleted_tracker_updates WHERE user_id=owner AND id IN(SELECT (x#>>'{}')::uuid FROM jsonb_array_elements(snap->'tombstones') x);
 DELETE FROM public.investment_history WHERE user_id=owner AND id IN(SELECT (x#>>'{}')::uuid FROM jsonb_array_elements(snap->'added_history') x);
 previous_write:=coalesce(current_setting('finance.history_write',true),'0');
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.history_write','1',true);
 PERFORM set_config('finance.restore_transaction','1',true);
 INSERT INTO public.mortgage_payments SELECT * FROM jsonb_populate_recordset(NULL::public.mortgage_payments,snap->'mortgage_payments');
 -- The payment trigger writes a fresh history entry; the saved one replaces it.
 DELETE FROM public.investment_history WHERE user_id=owner AND id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(snap->'history') x);
 INSERT INTO public.investment_history SELECT * FROM jsonb_populate_recordset(NULL::public.investment_history,snap->'history');
 INSERT INTO public.investment_account_links SELECT * FROM jsonb_populate_recordset(NULL::public.investment_account_links,snap->'links');
 INSERT INTO public.asset_movements SELECT * FROM jsonb_populate_recordset(NULL::public.asset_movements,snap->'asset_movements');
 INSERT INTO public.account_activity SELECT * FROM jsonb_populate_recordset(NULL::public.account_activity,snap->'account_activity');
 INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,public.normalize_finance_record_snapshot(x)||jsonb_build_object('user_id',owner))).*
  FROM jsonb_array_elements(snap->'records') x;
 -- Fee rows on an account moved it again as they went in; the recorded totals set every balance.
 FOR key,change IN SELECT * FROM jsonb_each(targets) LOOP
  UPDATE public.finance_records SET amount=(change->>'amount')::numeric,quantity=(change->>'quantity')::numeric,cost=(change->>'cost')::numeric WHERE id=key::uuid AND user_id=owner;
 END LOOP;
 PERFORM set_config('finance.history_write',previous_write,true);
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 IF jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;
 INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
 SELECT o.id,o.user_id,o.record_id,o.due_on,o.status,o.transaction_id FROM jsonb_populate_recordset(NULL::public.payment_occurrences,item.occurrences) o
 WHERE o.user_id=owner AND EXISTS(SELECT 1 FROM public.finance_records f WHERE f.id=o.record_id AND f.user_id=owner)
  AND EXISTS(SELECT 1 FROM public.finance_records f WHERE f.id=o.transaction_id AND f.user_id=owner)
 ON CONFLICT DO NOTHING;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=owner;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.';
 END;
END $$;
REVOKE ALL ON FUNCTION public.restore_linked_transaction(uuid) FROM PUBLIC,anon,authenticated;

-- The capability version moves to 126, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',126,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Deleting a category moves its budget too. Apply after 126.
-- A budget names its category by key (a built-in kind or a category id). Deleting a
-- category moved its transactions to the replacement but left the budget amounts,
-- rollover fund and settings under a key no category has: the budget disappeared
-- and the replacement got none. Now, in the same transaction:
-- * with a replacement, each month's budget becomes the sum of both categories'
--   budgets for that month (the replacement's own amount where the two are in
--   different currencies; no rate is inferred), and a rollover fund in the same
--   currency adds to the replacement's; the replacement keeps its own settings;
-- * without one, the deleted category's budget rows go with it.
-- Existing orphaned rows are left as they are.
BEGIN;

-- Internal: called only by the two delete functions, which check the owner first.
CREATE OR REPLACE FUNCTION public.merge_budget_category(p_owner uuid,p_from text,p_to text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE merged public.budget_amounts[]; source public.budget_categories; target public.budget_categories;
BEGIN
 IF p_owner IS NULL OR p_from IS NULL OR p_from IS NOT DISTINCT FROM p_to THEN RETURN; END IF;
 IF p_to IS NOT NULL THEN
  -- Every month where either budget changes: each saved month, and the month after a
  -- one-month amount, when the earlier forward amount (or none) applies again.
  WITH keyed AS (
   SELECT * FROM public.budget_amounts WHERE user_id=p_owner AND category_key IN (p_from,p_to)
  ), points AS (
   SELECT month FROM keyed UNION SELECT (month+interval '1 month')::date FROM keyed WHERE NOT applies_forward
  ), totals AS (
   -- The amount in effect: the one saved for that month, or else the latest forward one before it (budgetAmountFor).
   SELECT p.month, f.amount AS f_amount, f.currency AS f_currency, t.amount AS t_amount, t.currency AS t_currency
   FROM points p
   LEFT JOIN LATERAL (SELECT k.amount,k.currency FROM keyed k WHERE k.category_key=p_from AND (k.month=p.month OR (k.month<p.month AND k.applies_forward)) ORDER BY k.month=p.month DESC,k.month DESC LIMIT 1) f ON true
   LEFT JOIN LATERAL (SELECT k.amount,k.currency FROM keyed k WHERE k.category_key=p_to AND (k.month=p.month OR (k.month<p.month AND k.applies_forward)) ORDER BY k.month=p.month DESC,k.month DESC LIMIT 1) t ON true
  )
  SELECT coalesce(array_agg(ROW(p_owner,p_to,x.month,
    CASE WHEN x.t_amount IS NULL THEN x.f_amount WHEN x.f_amount IS NULL OR x.f_currency<>x.t_currency THEN x.t_amount ELSE least(x.f_amount+x.t_amount,1e15) END,
    coalesce(x.t_currency,x.f_currency),
    -- Forward until the next change; a month followed by one without any budget covers only itself.
    NOT EXISTS(SELECT 1 FROM totals n WHERE n.month=(x.month+interval '1 month')::date AND n.f_amount IS NULL AND n.t_amount IS NULL)
   )::public.budget_amounts ORDER BY x.month),'{}')
  INTO merged FROM totals x WHERE x.f_amount IS NOT NULL OR x.t_amount IS NOT NULL;
  DELETE FROM public.budget_amounts WHERE user_id=p_owner AND category_key IN (p_from,p_to);
  INSERT INTO public.budget_amounts SELECT * FROM unnest(merged);

  SELECT * INTO source FROM public.budget_categories WHERE user_id=p_owner AND category_key=p_from FOR UPDATE;
  SELECT * INTO target FROM public.budget_categories WHERE user_id=p_owner AND category_key=p_to FOR UPDATE;
  IF source.category_key IS NOT NULL AND target.category_key IS NULL THEN
   UPDATE public.budget_categories SET category_key=p_to,updated_at=now() WHERE user_id=p_owner AND category_key=p_from;
   RETURN;
  END IF;
  IF source.rollover AND target.rollover AND source.rollover_balance>0 AND (target.rollover_balance=0 OR target.rollover_currency=source.rollover_currency) THEN
   UPDATE public.budget_categories SET rollover_balance=least(target.rollover_balance+source.rollover_balance,1e15),rollover_currency=source.rollover_currency,updated_at=now()
    WHERE user_id=p_owner AND category_key=p_to;
  END IF;
 END IF;
 DELETE FROM public.budget_amounts WHERE user_id=p_owner AND category_key=p_from;
 DELETE FROM public.budget_categories WHERE user_id=p_owner AND category_key=p_from;
END $$;
REVOKE ALL ON FUNCTION public.merge_budget_category(uuid,text,text) FROM PUBLIC,anon,authenticated;

-- Both delete functions call it just before the category goes. Their bodies are
-- patched in place, so the owner checks they already have (migration 100) stay.
DO $$
DECLARE fn record; patched text;
BEGIN
 FOR fn IN SELECT p.oid, p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('delete_transaction_category','delete_built_in_category') LOOP
  CONTINUE WHEN fn.prosrc LIKE '%merge_budget_category%';
  IF fn.proname='delete_transaction_category' THEN
   patched:=replace(pg_get_functiondef(fn.oid),' DELETE FROM public.transaction_categories WHERE id=p_category AND user_id=owner;',
    ' PERFORM public.merge_budget_category(owner,p_category::text,target::text);'||chr(10)||' DELETE FROM public.transaction_categories WHERE id=p_category AND user_id=owner;');
  ELSE
   patched:=replace(pg_get_functiondef(fn.oid),' INSERT INTO public.workspace_preferences(user_id,key,data) VALUES(owner,''removed_categories''',
    ' PERFORM public.merge_budget_category(owner,p_kind,target::text);'||chr(10)||' INSERT INTO public.workspace_preferences(user_id,key,data) VALUES(owner,''removed_categories''');
  END IF;
  IF patched=pg_get_functiondef(fn.oid) THEN RAISE EXCEPTION 'Could not update %; apply the earlier migrations first.',fn.proname; END IF;
  EXECUTE patched;
 END LOOP;
END $$;

-- The capability version moves to 127, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',127,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Spending plans become Budget categories. Apply after 129.
-- A monthly spending plan was a second budget beside Budget, with its own four
-- labels (Groceries, Family support, Household, Other). Each plan now becomes a
-- spending category named after the plan (an existing spending category of that
-- name is reused):
-- * its monthly amounts become the category's budget, in the plan's currency, month
--   by month as the plan had them: each amount change, no budget (0) in archived
--   months and after the end date;
-- * a plan that carried unspent money over becomes a rollover category from the
--   month it started carrying, without negative carry (a plan never carried a deficit);
-- * its label becomes the category's Budget group (Other leaves the default group);
-- * the transactions paid from it move into the category. Amounts, kinds, dates,
--   accounts and owners stay; their earlier category label is replaced;
-- * two plans with the same name join one category, their budgets added month by
--   month (merge_budget_category, migration 127).
-- A plan that comes back later, from an old backup or Recently deleted, is
-- converted the same way when its transaction commits. Nothing creates plans any
-- more; the tables stay so old backups still restore.
BEGIN;

CREATE OR REPLACE FUNCTION public.convert_expense_plan(p_plan uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE plan public.expense_plans; owner uuid; category uuid; label text; key text; first_month date; last_month date; m date;
 budget numeric; roll boolean; previous numeric; paused boolean; roll_start date; last_roll boolean:=false;
BEGIN
 SELECT * INTO plan FROM public.expense_plans WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 owner:=plan.user_id; key:='plan:'||plan.id;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 label:=left(trim(plan.name),80);
 SELECT id INTO category FROM public.transaction_categories WHERE user_id=owner AND direction='expense' AND name=label;
 IF category IS NULL THEN
  category:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(category,owner,label,'expense');
 END IF;

 -- The plan's budget month by month, as expense_plan_month read it, written as a forward
 -- amount wherever it changes: a new amount, an archived month or the month after the end.
 first_month:=date_trunc('month',plan.start_date)::date;
 SELECT greatest(first_month,
   coalesce((SELECT max(effective_month) FROM public.expense_plan_versions WHERE plan_id=plan.id),first_month),
   coalesce((SELECT max(greatest(date_trunc('month',(x->>'from')::date),date_trunc('month',coalesce((x->>'to')::date,(x->>'from')::date)))) FROM jsonb_array_elements(plan.archive_pauses) x)::date,first_month),
   coalesce((date_trunc('month',plan.end_date)+interval '1 month')::date,first_month))
  INTO last_month;
 FOR m IN SELECT generate_series(first_month,last_month,interval '1 month')::date LOOP
  SELECT v.amount,v.rollover INTO budget,roll FROM public.expense_plan_versions v WHERE v.plan_id=plan.id AND v.effective_month<=m ORDER BY v.effective_month DESC LIMIT 1;
  budget:=coalesce(budget,plan.amount); roll:=coalesce(roll,false);
  paused:=EXISTS(SELECT 1 FROM jsonb_array_elements(plan.archive_pauses) x WHERE m>=date_trunc('month',(x->>'from')::date) AND (x->>'to' IS NULL OR m<date_trunc('month',(x->>'to')::date)));
  IF paused OR (plan.end_date IS NOT NULL AND m>date_trunc('month',plan.end_date)::date) THEN budget:=0; roll:=false; END IF;
  IF previous IS DISTINCT FROM budget THEN
   INSERT INTO public.budget_amounts(user_id,category_key,month,amount,currency,applies_forward) VALUES(owner,key,m,budget,plan.currency,true);
   previous:=budget;
  END IF;
  -- Carry-over restarts whenever it was off or the plan was paused.
  IF roll AND NOT last_roll THEN roll_start:=m; END IF;
  last_roll:=roll;
 END LOOP;
 INSERT INTO public.budget_categories(user_id,category_key,budget_type,group_name,rollover,rollover_start,rollover_negative)
 VALUES(owner,key,'flexible',CASE WHEN plan.category<>'Other' THEN plan.category END,last_roll,CASE WHEN last_roll THEN roll_start END,false);
 PERFORM public.merge_budget_category(owner,key,category::text);

 UPDATE public.finance_records SET custom_category_id=category,expense_plan_id=NULL WHERE user_id=owner AND expense_plan_id=plan.id;
 UPDATE public.deleted_items SET data=data||jsonb_build_object('custom_category_id',category,'expense_plan_id',NULL)
  WHERE user_id=owner AND source='finance_records' AND data->>'expense_plan_id'=plan.id::text;
 DELETE FROM public.expense_plans WHERE id=plan.id;
 RETURN category;
END $$;
REVOKE ALL ON FUNCTION public.convert_expense_plan(uuid) FROM PUBLIC,anon,authenticated;

-- A plan restored later converts at commit, once its spending is back too.
CREATE OR REPLACE FUNCTION public.convert_restored_expense_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.convert_expense_plan(NEW.id);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.convert_restored_expense_plan() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS convert_restored_expense_plan ON public.expense_plans;
CREATE CONSTRAINT TRIGGER convert_restored_expense_plan AFTER INSERT ON public.expense_plans
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.convert_restored_expense_plan();

DO $$ DECLARE item uuid; BEGIN
 FOR item IN SELECT id FROM public.expense_plans ORDER BY user_id,created_at,id LOOP PERFORM public.convert_expense_plan(item); END LOOP;
END $$;

-- Nothing writes plans directly any more.
REVOKE INSERT,UPDATE ON public.expense_plans FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_budget_plan(jsonb,date,boolean) FROM authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
