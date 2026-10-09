-- An income source and its schedule share one id. Apply after 131.
-- A fixed income source keeps its repeating schedule in finance_records
-- (schedule_id). Sources made from an older schedule already used the schedule's
-- id, but a source saved in the app, and the source added for a property's or a
-- business's estimated income, got a second, random id for the schedule. Payments
-- then named the same income by either id (earning_source_id or the schedule's
-- occurrence_record_id / income_source_id).
-- * Each existing source whose schedule has another id takes the schedule's id;
--   the payments that name the source follow it, also in Recently deleted. The
--   schedule, its occurrences and every link to it keep their id.
-- * save_income_source gives a new schedule the source's own id, and the income
--   source added for a property or business takes its new schedule's id.
-- A variable source has no schedule and keeps its id. A restored backup made
-- before this migration keeps the ids it was saved with.
BEGIN;

-- New schedules take the source's id.
DO $$
DECLARE patched text;
BEGIN
 patched:=pg_get_functiondef('public.save_income_source(jsonb)'::regprocedure);
 IF position('schedule:=coalesce(schedule,item);' in patched)=0 THEN
  IF position('schedule:=coalesce(schedule,gen_random_uuid());' in patched)=0 THEN RAISE EXCEPTION 'Could not update save_income_source; apply the earlier migrations first.'; END IF;
  EXECUTE replace(patched,'schedule:=coalesce(schedule,gen_random_uuid());','schedule:=coalesce(schedule,item);');
 END IF;
 patched:=pg_get_functiondef('public.ensure_asset_income_plan()'::regprocedure);
 IF position('schedule uuid:=source_id;' in patched)=0 THEN
  IF position('source_id uuid:=gen_random_uuid(); schedule uuid:=gen_random_uuid();' in patched)=0 THEN RAISE EXCEPTION 'Could not update ensure_asset_income_plan; apply the earlier migrations first.'; END IF;
  EXECUTE replace(patched,'source_id uuid:=gen_random_uuid(); schedule uuid:=gen_random_uuid();','source_id uuid:=gen_random_uuid(); schedule uuid:=source_id;');
 END IF;
END $$;

-- Existing sources move onto their schedule's id. Only ids change: no payment is
-- re-validated, re-dated or counted again, so the row triggers stay off meanwhile.
ALTER TABLE public.finance_records DROP CONSTRAINT finance_earning_source_owner;
ALTER TABLE public.finance_records DISABLE TRIGGER USER;
ALTER TABLE public.income_sources DISABLE TRIGGER USER;
CREATE TEMP TABLE income_source_rekey ON COMMIT DROP AS
 SELECT s.id AS old_id,s.schedule_id AS new_id,s.user_id FROM public.income_sources s
 WHERE s.schedule_id IS NOT NULL AND s.schedule_id<>s.id
  AND NOT EXISTS(SELECT 1 FROM public.income_sources other WHERE other.id=s.schedule_id);
UPDATE public.income_sources s SET id=k.new_id FROM income_source_rekey k WHERE s.id=k.old_id;
UPDATE public.finance_records r SET earning_source_id=k.new_id FROM income_source_rekey k WHERE r.user_id=k.user_id AND r.earning_source_id=k.old_id;
UPDATE public.deleted_items d SET data=jsonb_set(d.data,'{earning_source_id}',to_jsonb(k.new_id)) FROM income_source_rekey k
 WHERE d.user_id=k.user_id AND d.source='finance_records' AND d.data->>'earning_source_id'=k.old_id::text;
ALTER TABLE public.income_sources ENABLE TRIGGER USER;
ALTER TABLE public.finance_records ENABLE TRIGGER USER;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_earning_source_owner FOREIGN KEY(user_id,earning_source_id) REFERENCES public.income_sources(user_id,id);

-- The capability version moves to 132, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',132,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
