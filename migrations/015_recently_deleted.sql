-- Keep a private, durable copy of each successful deletion. Existing relationship
-- and history guards still apply; a failed deletion never creates an archive row.
CREATE TABLE public.deleted_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source text NOT NULL CHECK(source IN ('finance_records','expense_plans')),
 data jsonb NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deleted_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read deleted items" ON public.deleted_items FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.deleted_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.deleted_items TO authenticated;
CREATE INDEX deleted_items_owner_date ON public.deleted_items(user_id,deleted_at DESC,id);

CREATE FUNCTION public.archive_deleted_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- Do not archive account deletion cascades or privileged maintenance.
 IF OLD.user_id=auth.uid() AND EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
  INSERT INTO public.deleted_items(user_id,source,data) VALUES(OLD.user_id,TG_TABLE_NAME,to_jsonb(OLD));
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.archive_deleted_item() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER archive_deleted_record AFTER DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_item();
CREATE TRIGGER archive_deleted_plan AFTER DELETE ON public.expense_plans FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_item();

CREATE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 -- Retrying an already successful restoration is safe and does not duplicate it.
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='finance_records' THEN
  INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 ELSE
  INSERT INTO public.expense_plans SELECT (jsonb_populate_record(NULL::public.expense_plans,item.data || jsonb_build_object('user_id',auth.uid()))).*;
 END IF;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.restore_deleted_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid) TO authenticated;
-- APIs call this function so removal fails safely until this migration is installed.
CREATE FUNCTION public.move_item_to_deleted(p_id uuid,p_source text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_source='finance_records' THEN
  DELETE FROM public.finance_records WHERE id=p_id AND user_id=auth.uid();
 ELSIF p_source='expense_plans' THEN
  DELETE FROM public.expense_plans WHERE id=p_id AND user_id=auth.uid();
 ELSE RAISE EXCEPTION 'Check the record fields.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.move_item_to_deleted(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_item_to_deleted(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
