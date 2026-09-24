BEGIN;
-- Private transaction-local authorization for suppressing derived writes during
-- exact restoration. A caller cannot enable this by setting a session variable.
CREATE TABLE public.finance_restore_context (
 transaction_id bigint NOT NULL, user_id uuid NOT NULL, PRIMARY KEY(transaction_id,user_id)
);
REVOKE ALL ON public.finance_restore_context FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.finance_restore_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.finance_restore_context WHERE transaction_id=txid_current() AND user_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION public.finance_restore_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_restore_active() TO authenticated;
-- Preserve each trigger's implementation and privileges. Install the bypass
-- inside the functions once, rather than changing shared trigger state at runtime.
DO $$ DECLARE item record; definition text; BEGIN
 FOR item IN SELECT DISTINCT p.oid,l.lanname FROM pg_trigger t
  JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
  JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='public' AND r.relname=ANY(public.finance_backup_tables()) AND NOT t.tgisinternal
 LOOP
  IF item.lanname<>'plpgsql' THEN RAISE EXCEPTION 'Restore guard requires a PL/pgSQL trigger.'; END IF;
  definition:=pg_get_functiondef(item.oid);
  definition:=regexp_replace(definition,'\mBEGIN\M',
   'BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL=''STATEMENT'' THEN RETURN NULL; ELSIF TG_OP=''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;', 'i');
  EXECUTE definition;
 END LOOP;
END $$;
-- Every ordinary write takes the same owner lock as restore, including direct
-- RLS writes. Different owners use different locks. Statement triggers run before
-- row locks, preventing an update/restore lock-order inversion.
CREATE FUNCTION public.serialize_finance_owner_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0)); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.serialize_finance_owner_write() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  EXECUTE format('CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write()',tbl);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.restore_finance_backup(p_backup text,p_expected_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE backup jsonb; tbl text; recovery jsonb; operation_key text; prior_id uuid;
BEGIN
 PERFORM public.preview_finance_restore(p_backup);backup:=p_backup::jsonb;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 operation_key:=encode(sha256(convert_to(coalesce(p_expected_state,'')||':'||(backup->>'id'),'UTF8')),'hex');
 SELECT id INTO prior_id FROM public.backup_recovery_points WHERE user_id=auth.uid() AND backup_recovery_points.restore_key=operation_key;
 IF prior_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'recovery_id',prior_id); END IF;
 IF p_expected_state IS DISTINCT FROM encode(sha256(convert_to(public.finance_backup_state()::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Your workspace changed. Preview the backup again before restoring.'; END IF;
 recovery:=public.export_finance_backup();
 INSERT INTO public.backup_recovery_points(id,user_id,backup,restore_key) VALUES((recovery->>'id')::uuid,auth.uid(),recovery,operation_key);
 -- This context is writable only by privileged functions, never by a caller's
 -- custom GUC. Other sessions keep their triggers and continue normally.
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname=ANY(public.finance_backup_tables()) AND NOT t.tgisinternal AND p.proname<>'serialize_finance_owner_write' AND position('public.finance_restore_active()' in p.prosrc)=0) THEN RAISE EXCEPTION 'Restore requires updated financial trigger guards.'; END IF;
 INSERT INTO public.finance_restore_context(transaction_id,user_id) VALUES(txid_current(),auth.uid());
 SET CONSTRAINTS ALL DEFERRED;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',tbl) USING auth.uid(); END LOOP;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I,$1)',tbl,tbl) USING backup->'tables'->tbl;
 END LOOP;
 -- FK and CHECK constraints remain enforced. Failure rolls back all rows and the restore context.
 SET CONSTRAINTS ALL IMMEDIATE;
 DELETE FROM public.finance_restore_context WHERE transaction_id=txid_current() AND user_id=auth.uid();
 RETURN jsonb_build_object('ok',true,'recovery_id',recovery->>'id');
END $$;
-- Background captures use the same owner lock before writing. The cron's
-- service-role token has no auth.uid(), so it cannot rely on the caller trigger.
CREATE FUNCTION public.capture_owner_portfolio_snapshot(p_owner uuid,p_day date,p_totals jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_owner IS NULL OR p_day IS NULL THEN RAISE EXCEPTION 'Invalid snapshot.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 INSERT INTO public.portfolio_snapshots(user_id,occurred_on,assets,debt,rates,updated_at)
 VALUES(p_owner,p_day,(p_totals->>'assets')::numeric,(p_totals->>'debt')::numeric,p_totals->'rates',now())
 ON CONFLICT(user_id,occurred_on) DO UPDATE SET assets=excluded.assets,debt=excluded.debt,rates=excluded.rates,updated_at=excluded.updated_at;
END $$;
REVOKE ALL ON FUNCTION public.capture_owner_portfolio_snapshot(uuid,date,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.capture_owner_portfolio_snapshot(uuid,date,jsonb) TO service_role; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
