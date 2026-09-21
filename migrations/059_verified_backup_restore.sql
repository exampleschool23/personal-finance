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
