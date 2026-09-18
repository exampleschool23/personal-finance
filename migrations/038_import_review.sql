-- Import provenance and atomic undo for unchanged imported transactions.
BEGIN;
CREATE TABLE public.import_batches (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz,
 FOREIGN KEY(account_id,user_id) REFERENCES public.finance_records(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.import_batch_items (
 batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL, original jsonb NOT NULL, PRIMARY KEY(batch_id,record_id)
);
CREATE INDEX import_batches_owner ON public.import_batches(user_id,created_at DESC,id);
CREATE INDEX import_batch_items_owner ON public.import_batch_items(user_id,batch_id);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.import_batches FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY owner_read ON public.import_batch_items FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.import_batches,public.import_batch_items TO authenticated;
CREATE FUNCTION public.import_statement(p_batch uuid,p_account uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); previous public.import_batches; existing public.finance_records; r jsonb; before_ids uuid[]; result jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_batch IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Check the import fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO previous FROM public.import_batches WHERE id=p_batch;
 IF FOUND THEN
  IF previous.user_id<>owner OR previous.account_id<>p_account OR previous.payload<>p_rows THEN RAISE EXCEPTION 'This import identifier was used with different details.'; END IF;
  IF previous.undone_at IS NOT NULL THEN RAISE EXCEPTION 'This import was undone. Start a new import.'; END IF;
  RETURN previous.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash') THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) value GROUP BY value->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate source identifiers in this statement.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO before_ids FROM public.finance_records WHERE user_id=owner AND import_key IN (SELECT value->>'key' FROM jsonb_array_elements(p_rows));
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT * INTO existing FROM public.finance_records WHERE user_id=owner AND import_key=r->>'key' FOR UPDATE;
  IF FOUND AND (existing.account_id IS DISTINCT FROM p_account OR existing.amount<>abs((r->>'amount')::numeric) OR existing.date<>(r->>'date')::date OR existing.name<>r->>'name' OR existing.kind<>CASE WHEN (r->>'amount')::numeric>0 THEN 'Other income' ELSE 'Other expense' END) THEN RAISE EXCEPTION 'An imported transaction with this source identifier has different details. Review it before importing.'; END IF;
 END LOOP;
 result:=public.import_account_transactions(p_account,p_rows);
 INSERT INTO public.import_batches(id,user_id,account_id,payload,result) VALUES(p_batch,owner,p_account,p_rows,result);
 INSERT INTO public.import_batch_items(batch_id,user_id,record_id,original)
 SELECT p_batch,owner,id,to_jsonb(f) FROM public.finance_records f WHERE user_id=owner AND NOT(id=ANY(before_ids)) AND import_key IN (SELECT value->>'key' FROM jsonb_array_elements(p_rows));
 RETURN result;
END $$;
CREATE FUNCTION public.undo_statement_import(p_batch uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  IF NOT FOUND OR current_record<>item.original OR EXISTS(SELECT 1 FROM public.transaction_splits WHERE record_id=item.record_id) OR EXISTS(SELECT 1 FROM public.goal_events WHERE source_id=item.record_id) THEN RAISE EXCEPTION 'An imported transaction has changed or is linked to a goal. Review these records individually.'; END IF;
 END LOOP;
 -- Remove outflows first so undoing a balanced batch does not transiently overdraw.
 FOR item IN SELECT * FROM public.import_batch_items WHERE batch_id=p_batch AND user_id=owner ORDER BY CASE WHEN original->>'kind'='Other expense' THEN 0 ELSE 1 END,record_id LOOP
  DELETE FROM public.finance_records WHERE id=item.record_id AND user_id=owner;
 END LOOP;
 UPDATE public.import_batches SET undone_at=now() WHERE id=p_batch;
END $$;
REVOKE ALL ON FUNCTION public.import_statement(uuid,uuid,jsonb),public.undo_statement_import(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_statement(uuid,uuid,jsonb),public.undo_statement_import(uuid) TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_import_review;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb:=public.export_finance_backup_before_import_review();
BEGIN
 result:=jsonb_set(result,'{tables,import_batches}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.import_batches r));
 RETURN jsonb_set(result,'{tables,import_batch_items}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.import_batch_items r));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
