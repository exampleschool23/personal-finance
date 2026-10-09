-- Database integrity from the 2026-10-09 code review. Apply after 123.
-- 1. save_finance_record refuses an id that belongs to someone else. Called from
--    the Telegram bot it runs with row security bypassed, and a foreign id used to
--    take the "new record" branch and overwrite that row through the upsert.
-- 2. Record amounts, quantities, costs and rates are capped at 1e15 like every
--    other money column. The cap also refuses NaN and Infinity, which pass `>=0`.
-- 3. Restoring a deleted transaction whose statement was imported again meanwhile
--    keeps both copies: the restored one gives up its source identifier instead of
--    failing on finance_import_key.
-- 4. Indexes on the columns that point at records, so deleting a record no longer
--    scans every owner's rows, and on the per-owner reads that had none.
-- 5. The capability version follows the newest migration, so the app reports a
--    missing one as "The app database needs an update."
BEGIN;

-- Re-running is a no-op: a patch whose new text is already present is skipped.
CREATE OR REPLACE FUNCTION pg_temp.patch_integrity(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: % (% of 1 matches)',fn,found; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

SELECT pg_temp.patch_integrity('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$ ELSIF p_expected_revision IS NOT NULL THEN$old$,
 $new$ ELSIF EXISTS(SELECT 1 FROM public.finance_records WHERE id=(p_record->>'id')::uuid) THEN
  RAISE EXCEPTION 'Record not found.';
 ELSIF p_expected_revision IS NOT NULL THEN$new$);
SELECT pg_temp.patch_integrity('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$ON CONFLICT(id) DO UPDATE SET %s RETURNING *',cols,vals,updates) INTO saved USING payload;$old$,
 $new$ON CONFLICT(id) DO UPDATE SET %s WHERE finance_records.user_id=excluded.user_id RETURNING *',cols,vals,updates) INTO saved USING payload;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Record not found.'; END IF;$new$);

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_figures_bounded;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_figures_bounded
 CHECK (amount<=1e15 AND quantity<=1e15 AND cost<=1e15 AND rate<=1e15) NOT VALID;
ALTER TABLE public.finance_records VALIDATE CONSTRAINT finance_records_figures_bounded;

SELECT pg_temp.patch_integrity('public.restore_deleted_item(uuid)'::regprocedure,
 $old$ IF NOT FOUND THEN RETURN; END IF;$old$,
 $new$ IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' AND item.data->>'import_key' IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=public.active_owner() AND import_key=item.data->>'import_key') THEN
  UPDATE public.deleted_items SET data=data-'import_key' WHERE id=item.id;
 END IF;$new$);

CREATE INDEX IF NOT EXISTS finance_records_account_ref ON public.finance_records(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_records_custom_category_ref ON public.finance_records(custom_category_id) WHERE custom_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_occurrences_record_ref ON public.payment_occurrences(record_id);
CREATE INDEX IF NOT EXISTS payment_occurrences_transaction_ref ON public.payment_occurrences(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_activity_account_ref ON public.account_activity(account_id);
CREATE INDEX IF NOT EXISTS account_activity_target_ref ON public.account_activity(target_id) WHERE target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_movements_source_ref ON public.asset_movements(source_id);
CREATE INDEX IF NOT EXISTS asset_movements_target_ref ON public.asset_movements(target_id);
CREATE INDEX IF NOT EXISTS savings_goals_account_ref ON public.savings_goals(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS investment_account_links_account_ref ON public.investment_account_links(account_id);
CREATE INDEX IF NOT EXISTS goal_events_source_ref ON public.goal_events(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_reconciliations_owner_account ON public.account_reconciliations(user_id,account_id,end_date DESC);
CREATE INDEX IF NOT EXISTS corporate_events_owner_record ON public.corporate_events(user_id,record_id,occurred_on DESC);
CREATE INDEX IF NOT EXISTS expense_plans_owner ON public.expense_plans(user_id);
CREATE INDEX IF NOT EXISTS telegram_login_tokens_owner ON public.telegram_login_tokens(user_id);

CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',124,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
