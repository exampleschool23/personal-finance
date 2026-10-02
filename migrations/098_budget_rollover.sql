-- Budget rollover funds: a starting balance (in its own currency) carried
-- into the fund's start month, and whether overspending carries into the
-- next month as a negative amount (on by default, as before) or resets the
-- fund to zero. The Flexible bucket's rollover is saved as the
-- 'flex:flexible' row. Existing owner RLS on budget_categories applies.
-- Budgets join the verified backup and restore. Backups made before this
-- migration have no budget tables; restoring one keeps the current budget.
-- Apply after 093. No existing rows are changed.
BEGIN;

ALTER TABLE public.budget_categories
 ADD COLUMN rollover_balance numeric NOT NULL DEFAULT 0 CHECK (rollover_balance>=0 AND rollover_balance<=1e15),
 ADD COLUMN rollover_currency text CHECK (rollover_currency IS NULL OR rollover_currency ~ '^[A-Z]{3}$'),
 ADD COLUMN rollover_negative boolean NOT NULL DEFAULT true,
 ADD CONSTRAINT budget_categories_rollover_currency CHECK (rollover_balance=0 OR rollover_currency IS NOT NULL);

-- Budget writes take the same owner lock as restore, like every backed-up table.
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.budget_settings FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.budget_categories FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.budget_amounts FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();

DO $$ DECLARE definition text; fn regprocedure; BEGIN
 definition:=pg_get_functiondef('public.finance_backup_tables()'::regprocedure);
 EXECUTE replace(definition,'''account_activity''','''account_activity'',''budget_amounts'',''budget_categories'',''budget_settings''');
 -- A signed backup from before budgets were included has no budget tables: accept it.
 FOREACH fn IN ARRAY ARRAY['public.preview_finance_restore(text)'::regprocedure,'public.register_verified_finance_backup(text,uuid)'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  definition:=replace(definition,'FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP','FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  IF tbl IN (''budget_amounts'',''budget_categories'',''budget_settings'') AND NOT (backup->''tables'' ? tbl) THEN CONTINUE; END IF;');
  EXECUTE definition;
 END LOOP;
 -- Restoring such a backup leaves the current budget as it is rather than emptying it.
 definition:=pg_get_functiondef('public.restore_finance_backup(text,text)'::regprocedure);
 EXECUTE replace(definition,'LOOP EXECUTE format(''DELETE FROM public.%I WHERE user_id=$1'',tbl)','LOOP CONTINUE WHEN tbl IN (''budget_amounts'',''budget_categories'',''budget_settings'') AND NOT (backup->''tables'' ? tbl); EXECUTE format(''DELETE FROM public.%I WHERE user_id=$1'',tbl)');
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
