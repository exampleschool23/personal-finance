-- The "Apply to all future months" tick comes off in one transaction. Apply after 138.
-- Taking the tick off on Budget sent two requests: this month's amount for this month
-- only, then an amount of 0 applying forward from next month, so later months plan
-- nothing. When the second request failed, the budget was left half-changed: this
-- month's amount no longer applied forward, yet every later month still planned the
-- old amount. set_budget_amount_once does both steps in one call, all or nothing:
-- it saves this month's amount for this month only (set_budget_amount, keeping a
-- forward amount of the same month by moving it on), then plans nothing from next
-- month on (0 applying forward, replacing the months after). Mirrors
-- repeatBudgetAmount in lib/budget-schedules.ts. No existing rows are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_budget_amount_once(p_key text,p_month date,p_amount numeric,p_currency text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM public.set_budget_amount(p_key,p_month,p_amount,p_currency,false);
 PERFORM public.set_budget_amount(p_key,(p_month+interval '1 month')::date,0,p_currency,true);
END $$;
REVOKE ALL ON FUNCTION public.set_budget_amount_once(text,date,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_budget_amount_once(text,date,numeric,text) TO authenticated;

-- The capability version moves to 139, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',139,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
