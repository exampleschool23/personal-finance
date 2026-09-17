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
