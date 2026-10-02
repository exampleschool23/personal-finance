-- Transaction rules join the signed backup, with everything they name.
-- * Rules keep their criteria (093): exact or contained name, account, business,
--   category and amount range, and the category, business and tags they set.
-- * Tags and tag links come too: rules name tags, and without them a restore
--   would drop the labels on restored transactions.
-- * The backup table list is extended rather than rewritten, so other tables
--   added to backups by other migrations stay in it whichever runs last.
-- * Backups downloaded before this change have no such tables; they still
--   preview and restore, with no rules, tags or tag links.
-- Apply after 093. No rows are changed.
BEGIN;

DO $$ DECLARE added text[]:=ARRAY['transaction_tags','transaction_tag_links','transaction_rules']; tables text[]; BEGIN
 tables:=public.finance_backup_tables()||ARRAY(SELECT name FROM unnest(added) name WHERE NOT name=ANY(public.finance_backup_tables()));
 EXECUTE format('CREATE OR REPLACE FUNCTION public.finance_backup_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $list$ SELECT %L::text[] $list$',tables);
END $$;

-- As for every backup table (059): foreign keys are checked at the end of a restore.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT c.conrelid::regclass AS tbl,c.conname,c.condeferred,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE c.contype='f' AND NOT c.condeferrable AND n.nspname='public' AND r.relname IN ('transaction_tags','transaction_tag_links','transaction_rules') LOOP
  IF item.definition LIKE '%ON DELETE RESTRICT%' THEN
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.tbl,item.conname);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',item.tbl,item.conname,replace(item.definition,'ON DELETE RESTRICT','ON DELETE NO ACTION'));
  END IF;
  EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY %s',item.tbl,item.conname,CASE WHEN item.condeferred THEN 'DEFERRED' ELSE 'IMMEDIATE' END);
 END LOOP;
END $$;

-- As for every backup table (062): their triggers stand aside during a restore,
-- and ordinary writes take the owner's restore lock.
DO $$ DECLARE item record; definition text; tbl text; BEGIN
 FOR item IN SELECT DISTINCT p.oid,l.lanname FROM pg_trigger t
  JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
  JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='public' AND r.relname IN ('transaction_tags','transaction_tag_links','transaction_rules') AND NOT t.tgisinternal
   AND p.proname<>'serialize_finance_owner_write' AND position('public.finance_restore_active()' in p.prosrc)=0
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
 FOREACH tbl IN ARRAY ARRAY['transaction_tags','transaction_tag_links','transaction_rules'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||tbl)::regclass AND tgname='serialize_owner_write') THEN
   EXECUTE format('CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write()',tbl);
  END IF;
 END LOOP;
END $$;

-- A table missing from an older backup reads as empty. Present tables are still
-- checked to be lists of the owner's rows, and the backup must still be verified.
DO $$ DECLARE fn regprocedure; definition text; BEGIN
 FOREACH fn IN ARRAY ARRAY['public.preview_finance_restore(text)','public.restore_finance_backup(text,text)','public.register_verified_finance_backup(text,uuid)']::regprocedure[] LOOP
  definition:=pg_get_functiondef(fn);
  IF position($q$backup->'tables'->tbl$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected backup function %',fn; END IF;
  EXECUTE replace(definition,$q$backup->'tables'->tbl$q$,$q$coalesce(backup->'tables'->tbl,'[]'::jsonb)$q$);
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
