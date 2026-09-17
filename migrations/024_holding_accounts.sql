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
