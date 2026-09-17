-- An automatic opening snapshot is not a user-recorded transaction. Archive it
-- with an otherwise unused record, so restoring retains the exact original date.
BEGIN;
ALTER TABLE public.deleted_items ADD COLUMN history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array');
CREATE OR REPLACE FUNCTION public.archive_deleted_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshots jsonb:='[]'::jsonb;
BEGIN
 IF OLD.user_id=auth.uid() AND EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
  IF TG_TABLE_NAME='finance_records' THEN
   IF EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=OLD.id AND event_type<>'baseline') THEN
    RAISE EXCEPTION 'This record has saved tracker updates or transactions and cannot be deleted.';
   END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at,h.id),'[]'::jsonb) INTO snapshots
    FROM public.investment_history h WHERE record_id=OLD.id AND user_id=auth.uid();
   DELETE FROM public.investment_history WHERE record_id=OLD.id AND user_id=auth.uid() AND event_type='baseline';
  END IF;
  INSERT INTO public.deleted_items(user_id,source,data,history) VALUES(OLD.user_id,TG_TABLE_NAME,to_jsonb(OLD),snapshots);
 END IF;
 RETURN OLD;
END $$;
-- Before deletion is necessary to move the snapshot out of the restrictive FK.
-- Any other relationship/transaction guard failure rolls the whole archive back.
DROP TRIGGER archive_deleted_record ON public.finance_records;
CREATE TRIGGER archive_deleted_record BEFORE DELETE ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_item();
CREATE OR REPLACE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_write text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' THEN
  previous_write:=coalesce(current_setting('finance.history_write',true),'0');
  IF jsonb_array_length(item.history)>0 THEN PERFORM set_config('finance.history_write','1',true); END IF;
  INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,item.data || jsonb_build_object('user_id',auth.uid()))).*;
  IF jsonb_array_length(item.history)>0 THEN
   INSERT INTO public.investment_history SELECT * FROM jsonb_populate_recordset(NULL::public.investment_history,item.history);
   PERFORM set_config('finance.history_write',previous_write,true);
  END IF;
 ELSE
  INSERT INTO public.expense_plans SELECT (jsonb_populate_record(NULL::public.expense_plans,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 END IF;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
