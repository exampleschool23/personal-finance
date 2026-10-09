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
