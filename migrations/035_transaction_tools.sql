BEGIN;
CREATE TABLE public.category_rules (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 pattern text NOT NULL CHECK(length(trim(pattern)) BETWEEN 1 AND 120),
 direction text NOT NULL CHECK(direction IN ('income','expense','all')),
 category_id uuid NOT NULL, priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 1000), enabled boolean NOT NULL DEFAULT true,
 FOREIGN KEY(category_id,user_id) REFERENCES public.custom_categories(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.transaction_splits (
 record_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 49), category_id uuid NOT NULL,
 amount numeric NOT NULL CHECK(amount>0 AND amount<=1e15),
 PRIMARY KEY(record_id,position),
 FOREIGN KEY(user_id,record_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(category_id,user_id) REFERENCES public.custom_categories(id,user_id)
);
CREATE TABLE public.forecast_assignments (
 record_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, account_id uuid NOT NULL,
 FOREIGN KEY(user_id,record_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,account_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE
);
CREATE INDEX category_rules_owner_priority ON public.category_rules(user_id,priority,id);
CREATE INDEX transaction_splits_owner_record ON public.transaction_splits(user_id,record_id,position);
CREATE INDEX forecast_assignments_owner_record ON public.forecast_assignments(user_id,record_id);
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_rules ON public.category_rules FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY owner_splits ON public.transaction_splits FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY owner_forecasts ON public.forecast_assignments FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.category_rules TO authenticated;
GRANT SELECT ON public.transaction_splits,public.forecast_assignments TO authenticated;

-- One classifier serves manual entry, scheduled receipts and bank imports.
CREATE FUNCTION public.classify_new_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT. BEFORE INSERT also runs
 -- for existing rows, so edits must not reclassify historical transactions.
 IF EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 IF coalesce(current_setting('finance.restore_transaction',true),'0')<>'1' AND NEW.custom_category_id IS NULL AND NEW.frequency='Once' AND NEW.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') THEN
  SELECT category_id INTO NEW.custom_category_id FROM public.category_rules
  WHERE user_id=NEW.user_id AND enabled AND strpos(lower(NEW.name),lower(trim(pattern)))>0
   AND (direction='all' OR direction=CASE WHEN NEW.kind IN ('Salary','Rent income','Other income') THEN 'income' ELSE 'expense' END)
  ORDER BY priority,id LIMIT 1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER classify_transaction BEFORE INSERT ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.classify_new_transaction();

CREATE FUNCTION public.save_transaction_splits(p_record uuid,p_splits jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records; part jsonb; n integer:=0; total numeric:=0;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.movement_id IS NOT NULL OR r.operation_id IS NOT NULL OR r.mortgage_payment_id IS NOT NULL OR r.history_event_id IS NOT NULL OR r.frequency<>'Once' OR r.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose an actual transaction.'; END IF;
 IF jsonb_typeof(p_splits) IS DISTINCT FROM 'array' OR jsonb_array_length(p_splits)>50 OR jsonb_array_length(p_splits)=1 THEN RAISE EXCEPTION 'Use at least two split categories, or clear the split.'; END IF;
 DELETE FROM public.transaction_splits WHERE record_id=r.id AND user_id=owner;
 FOR part IN SELECT value FROM jsonb_array_elements(p_splits) LOOP
  IF (part->>'amount') IS NULL OR (part->>'amount')::numeric<=0 OR (part->>'amount')::numeric>1e15 THEN RAISE EXCEPTION 'Check the split amounts.'; END IF;
  INSERT INTO public.transaction_splits(record_id,user_id,position,category_id,amount) VALUES(r.id,owner,n,(part->>'category_id')::uuid,(part->>'amount')::numeric);
  total:=total+(part->>'amount')::numeric;n:=n+1;
 END LOOP;
 IF n>0 AND total<>r.amount THEN RAISE EXCEPTION 'Split amounts must equal the transaction amount.'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
-- A split must not silently become inconsistent after a parent transaction edit.
CREATE FUNCTION public.protect_split_total() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.amount,NEW.currency,NEW.kind,NEW.frequency) IS DISTINCT FROM (OLD.amount,OLD.currency,OLD.kind,OLD.frequency) AND EXISTS(SELECT 1 FROM public.transaction_splits WHERE record_id=OLD.id) THEN RAISE EXCEPTION 'Clear the split before changing the transaction amount or type.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_split_total BEFORE UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.protect_split_total();
CREATE FUNCTION public.save_forecast_assignment(p_record uuid,p_account uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.frequency='Once' OR r.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose a recurring schedule.'; END IF;
 IF p_account IS NULL THEN DELETE FROM public.forecast_assignments WHERE record_id=p_record AND user_id=owner;
 ELSE
  PERFORM 1 FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash' AND currency=r.currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a cash account in the schedule currency.'; END IF;
  INSERT INTO public.forecast_assignments(record_id,user_id,account_id) VALUES(p_record,owner,p_account) ON CONFLICT(record_id) DO UPDATE SET account_id=EXCLUDED.account_id;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.save_transaction_splits(uuid,jsonb),public.save_forecast_assignment(uuid,uuid),public.classify_new_transaction(),public.protect_split_total() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_transaction_splits(uuid,jsonb),public.save_forecast_assignment(uuid,uuid) TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_transaction_tools;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.export_finance_backup_before_transaction_tools();
 result:=jsonb_set(result,'{tables,category_rules}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.category_rules r));
 result:=jsonb_set(result,'{tables,transaction_splits}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.transaction_splits r));
 result:=jsonb_set(result,'{tables,forecast_assignments}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.forecast_assignments r));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;

-- Preserve category allocations when a transaction is moved to Recently deleted.
ALTER TABLE public.deleted_items ADD COLUMN splits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(splits)='array');
CREATE FUNCTION public.archive_transaction_splits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.user_id=auth.uid() THEN
  UPDATE public.deleted_items SET splits=(SELECT coalesce(jsonb_agg(jsonb_build_object('category_id',category_id,'amount',amount) ORDER BY position),'[]'::jsonb) FROM public.transaction_splits WHERE record_id=OLD.id AND user_id=OLD.user_id)
  WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=OLD.user_id AND source='finance_records' AND data->>'id'=OLD.id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 END IF;
 RETURN OLD;
END $$;
-- Trigger names are ordered: archive_deleted_record creates the archive first.
CREATE TRIGGER archive_transaction_splits BEFORE DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.archive_transaction_splits();
ALTER FUNCTION public.restore_deleted_item(uuid) RENAME TO restore_deleted_item_before_transaction_tools;
CREATE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_restore text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.restore_transaction','1',true);
 PERFORM public.restore_deleted_item_before_transaction_tools(p_id);
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 IF item.source='finance_records' AND jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;
END $$;
REVOKE ALL ON FUNCTION public.archive_transaction_splits(),public.restore_deleted_item(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.restore_deleted_item_before_transaction_tools(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
