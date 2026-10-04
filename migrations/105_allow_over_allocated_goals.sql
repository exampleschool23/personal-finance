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
