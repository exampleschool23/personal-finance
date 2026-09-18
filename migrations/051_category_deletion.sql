BEGIN;
CREATE FUNCTION public.category_usage(p_category uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); active_count integer; deleted_count integer; watch_count integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=p_category AND user_id=owner) THEN RAISE EXCEPTION 'Category not found.'; END IF;
 SELECT count(*) INTO active_count FROM public.finance_records r WHERE r.user_id=owner AND
  (r.custom_category_id=p_category OR EXISTS(SELECT 1 FROM public.transaction_splits s WHERE s.user_id=owner AND s.record_id=r.id AND s.category_id=p_category));
 SELECT count(*) INTO deleted_count FROM public.deleted_items d WHERE d.user_id=owner AND d.source='finance_records' AND
  (d.data->>'custom_category_id'=p_category::text OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.splits) part WHERE part->>'category_id'=p_category::text));
 SELECT count(*) INTO watch_count FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements(w.data->'items') item WHERE w.user_id=owner AND w.key='watchlists' AND item->>'category'=p_category::text;
 RETURN jsonb_build_object('records',active_count,'deleted',deleted_count,'watchlists',watch_count);
END $$;

-- Immutable generated transactions may change only their category label.
-- Their amounts, account links and every other stored value remain protected.
DO $$
DECLARE guard_name text; definition text;
BEGIN
 FOREACH guard_name IN ARRAY ARRAY['guard_mortgage_payment_record','guard_investment_history_record','guard_operation_record','guard_movement_record'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=guard_name AND p.pronargs=0;
  definition:=regexp_replace(definition,'BEGIN',E'BEGIN\n IF TG_OP=''UPDATE'' AND NEW.user_id=auth.uid() AND (to_jsonb(NEW)-''custom_category_id'')=(to_jsonb(OLD)-''custom_category_id'') THEN RETURN NEW; END IF;');
  EXECUTE definition;
 END LOOP;
END $$;

CREATE FUNCTION public.delete_transaction_category(p_category uuid,p_replacement uuid DEFAULT NULL,p_new_name text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); selected_category public.transaction_categories; target uuid:=p_replacement; usage jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 -- The category lock coordinates with FK checks on concurrent record inserts.
 SELECT * INTO selected_category FROM public.transaction_categories WHERE id=p_category AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Category not found.'; END IF;
 IF p_new_name IS NOT NULL THEN
  IF target IS NOT NULL OR length(trim(p_new_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Check the category name and type.'; END IF;
  target:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(target,owner,trim(p_new_name),selected_category.direction);
 END IF;
 IF target IS NOT NULL THEN
  IF target=p_category THEN RAISE EXCEPTION 'Choose a different category of the same type.'; END IF;
  PERFORM 1 FROM public.transaction_categories WHERE id=target AND user_id=owner AND direction=selected_category.direction FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a different category of the same type.'; END IF;
 END IF;
 usage:=public.category_usage(p_category);
 IF target IS NULL AND (usage->>'records')::integer+(usage->>'deleted')::integer+(usage->>'watchlists')::integer>0 THEN
  RAISE EXCEPTION 'This category is in use. Choose a replacement category.';
 END IF;
 IF target IS NOT NULL THEN
  -- Only category labels change: amounts, kinds, source links and dates stay put.
  UPDATE public.finance_records SET custom_category_id=target WHERE user_id=owner AND custom_category_id=p_category;
  UPDATE public.transaction_splits SET category_id=target WHERE user_id=owner AND category_id=p_category;
  UPDATE public.deleted_items SET data=jsonb_set(data,'{custom_category_id}',to_jsonb(target)) WHERE user_id=owner AND source='finance_records' AND data->>'custom_category_id'=p_category::text;
  UPDATE public.deleted_items d SET splits=(SELECT jsonb_agg(CASE WHEN part->>'category_id'=p_category::text THEN jsonb_set(part,'{category_id}',to_jsonb(target)) ELSE part END ORDER BY ord) FROM jsonb_array_elements(d.splits) WITH ORDINALITY p(part,ord))
   WHERE d.user_id=owner AND d.source='finance_records' AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.splits) part WHERE part->>'category_id'=p_category::text);
  UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN item->>'category'=p_category::text THEN jsonb_set(item,'{category}',to_jsonb(target::text)) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
   WHERE w.user_id=owner AND w.key='watchlists' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item WHERE item->>'category'=p_category::text);
 END IF;
 DELETE FROM public.transaction_categories WHERE id=p_category AND user_id=owner;
 RETURN jsonb_build_object('ok',true,'replacement',target);
END $$;
-- All deletes must use the checked, atomic operation (including empty categories).
REVOKE DELETE ON public.transaction_categories FROM authenticated;
REVOKE ALL ON FUNCTION public.category_usage(uuid),public.delete_transaction_category(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.category_usage(uuid),public.delete_transaction_category(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
