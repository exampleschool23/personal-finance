-- Budget groups are gone: drop budget_categories.group_name. Apply after 141.
-- Budget lists each side's categories without group headings, and Settings no longer
-- adds, renames or removes groups, so nothing reads the column any more. The app stopped
-- sending it too (the API's schema strips it from older clients). One function still
-- wrote it: convert_expense_plan (migration 131, used when a spending plan comes back
-- from Recently deleted or a backup) stored the plan's label as the category's group.
-- It is rewritten without the column before the column goes. Backups that still carry
-- group_name restore as before: jsonb_populate_recordset ignores keys a table lacks.
-- The groups people named are lost; categories, types, rollover and amounts are kept.
BEGIN;

DO $$
DECLARE patched text;
BEGIN
 patched:=pg_get_functiondef('public.convert_expense_plan(uuid)'::regprocedure);
 IF position('group_name' in patched)>0 THEN
  IF position($q$budget_type,group_name,rollover,$q$ in patched)=0 OR position($q$'fixed',CASE WHEN plan.category<>'Other' THEN plan.category END,$q$ in patched)=0 THEN
   RAISE EXCEPTION 'Could not update convert_expense_plan; apply migration 133 first.';
  END IF;
  patched:=replace(patched,$q$budget_type,group_name,rollover,$q$,$q$budget_type,rollover,$q$);
  patched:=replace(patched,$q$'fixed',CASE WHEN plan.category<>'Other' THEN plan.category END,$q$,$q$'fixed',$q$);
  EXECUTE patched;
 END IF;
END $$;

ALTER TABLE public.budget_categories DROP COLUMN IF EXISTS group_name;

-- The capability version moves to 142, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',142,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
