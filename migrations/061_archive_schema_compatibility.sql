BEGIN;
-- Archived JSON predates later columns. Rehydrate missing columns using the
-- current schema defaults, preserving every explicitly saved value (even null).
-- This also keeps revision=1 for pre-revision imports, so later edits still fail.
CREATE FUNCTION public.normalize_finance_record_snapshot(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE field record; result jsonb:=p_data; default_value jsonb;
BEGIN
 FOR field IN SELECT a.attname,pg_get_expr(d.adbin,d.adrelid) AS expression
  FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.finance_records'::regclass AND NOT a.attisdropped AND NOT(p_data ? a.attname)
 LOOP
  EXECUTE 'SELECT to_jsonb('||field.expression||')' INTO default_value;
  result:=result||jsonb_build_object(field.attname,default_value);
 END LOOP;
 RETURN to_jsonb(jsonb_populate_record(NULL::public.finance_records,result));
END $$;
REVOKE ALL ON FUNCTION public.normalize_finance_record_snapshot(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.restore_deleted_item_before_transaction_tools(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_write text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' THEN
  previous_write:=coalesce(current_setting('finance.history_write',true),'0');
  IF jsonb_array_length(item.history)>0 THEN PERFORM set_config('finance.history_write','1',true); END IF;
  INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,public.normalize_finance_record_snapshot(item.data) || jsonb_build_object('user_id',auth.uid()))).*;
  IF jsonb_array_length(item.history)>0 THEN
   INSERT INTO public.investment_history SELECT * FROM jsonb_populate_recordset(NULL::public.investment_history,item.history);
   PERFORM set_config('finance.history_write',previous_write,true);
  END IF;
 ELSE
  INSERT INTO public.expense_plans SELECT (jsonb_populate_record(NULL::public.expense_plans,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 END IF;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
END $$;
CREATE OR REPLACE FUNCTION public.undo_statement_import(p_batch uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); batch public.import_batches; item public.import_batch_items; current_record jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO batch FROM public.import_batches WHERE id=p_batch AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found.'; END IF;
 IF batch.undone_at IS NOT NULL THEN RETURN; END IF;
 -- Lock and check everything before deleting anything. Later edits must be reviewed.
 FOR item IN SELECT * FROM public.import_batch_items WHERE batch_id=p_batch AND user_id=owner ORDER BY record_id LOOP
  SELECT to_jsonb(f) INTO current_record FROM public.finance_records f WHERE id=item.record_id AND user_id=owner FOR UPDATE;
  IF NOT FOUND OR current_record<>public.normalize_finance_record_snapshot(item.original) OR EXISTS(SELECT 1 FROM public.transaction_splits WHERE record_id=item.record_id) OR EXISTS(SELECT 1 FROM public.goal_events WHERE source_id=item.record_id) THEN RAISE EXCEPTION 'An imported transaction has changed or is linked to a goal. Review these records individually.'; END IF;
 END LOOP;
 -- Remove outflows first so undoing a balanced batch does not transiently overdraw.
 FOR item IN SELECT * FROM public.import_batch_items WHERE batch_id=p_batch AND user_id=owner ORDER BY CASE WHEN original->>'kind'='Other expense' THEN 0 ELSE 1 END,record_id LOOP
  DELETE FROM public.finance_records WHERE id=item.record_id AND user_id=owner;
 END LOOP;
 UPDATE public.import_batches SET undone_at=now() WHERE id=p_batch;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
