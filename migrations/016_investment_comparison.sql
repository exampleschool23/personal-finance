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
