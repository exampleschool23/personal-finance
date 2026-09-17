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
