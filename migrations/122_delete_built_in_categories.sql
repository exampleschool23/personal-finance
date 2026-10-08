-- Built-in categories can be deleted. Apply after 121.
-- A built-in category (Salary, Rent expense and the rest) is a record kind, so
-- it is never dropped from the database: deleting it adds its name to the
-- shared workspace preference 'removed_categories', and the app stops offering
-- it. Records that use it first move to one of the workspace's own categories
-- of the same direction, as when an added category is deleted: only the
-- category label changes (custom_category_id); amounts, kinds, links and dates
-- stay put. Rules, entry templates and spending watchlists follow. At least
-- one category of each direction always remains. Restoring a category removes
-- its name from the preference again.
BEGIN;

ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order','business_order','tag_order','tax_lines','category_icons','removed_categories'));

-- What still uses a built-in category without one of the workspace's own categories on it.
CREATE OR REPLACE FUNCTION public.built_in_category_usage(p_kind text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); active_count integer; deleted_count integer; watch_count integer; rule_count integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Category not found.'; END IF;
 SELECT count(*) INTO active_count FROM public.finance_records WHERE user_id=owner AND kind=p_kind AND custom_category_id IS NULL;
 SELECT count(*) INTO deleted_count FROM public.deleted_items WHERE user_id=owner AND source='finance_records' AND data->>'kind'=p_kind AND coalesce(data->>'custom_category_id','')='';
 SELECT count(*) INTO watch_count FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements(w.data->'items') item WHERE w.user_id=owner AND w.key='watchlists' AND item->>'category'=p_kind;
 SELECT (SELECT count(*) FROM public.transaction_rules WHERE user_id=owner AND ((kind=p_kind AND category_id IS NULL) OR (match_kind=p_kind AND match_category_id IS NULL)))
  +(SELECT count(*) FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements(w.data->'items') item WHERE w.user_id=owner AND w.key='entry_templates' AND item->>'kind'=p_kind AND coalesce(item->>'custom_category_id','')='')
  INTO rule_count;
 RETURN jsonb_build_object('records',active_count,'deleted',deleted_count,'watchlists',watch_count,'rules',rule_count);
END $$;

CREATE OR REPLACE FUNCTION public.delete_built_in_category(p_kind text,p_replacement uuid DEFAULT NULL,p_new_name text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); side text; general text; built_ins text[]; removed text[]; target uuid:=p_replacement; usage jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Category not found.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 side:=CASE WHEN p_kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END;
 general:=CASE WHEN side='income' THEN 'Other income' ELSE 'Other expense' END;
 built_ins:=CASE WHEN side='income' THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END;
 SELECT coalesce(array_agg(value),'{}') INTO removed FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements_text(w.data->'kinds') value WHERE w.user_id=owner AND w.key='removed_categories';
 IF p_kind=ANY(removed) THEN RAISE EXCEPTION 'Category not found.'; END IF;
 IF p_new_name IS NOT NULL THEN
  IF target IS NOT NULL OR length(trim(p_new_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Check the category name and type.'; END IF;
  target:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(target,owner,trim(p_new_name),side);
 END IF;
 IF target IS NOT NULL THEN
  PERFORM 1 FROM public.transaction_categories c WHERE c.id=target AND c.user_id=owner AND c.direction=side;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a different category of the same type.'; END IF;
 END IF;
 -- Someone always has a category to record income, and one to record spending, in.
 IF NOT EXISTS(SELECT 1 FROM unnest(built_ins) kind WHERE kind<>p_kind AND kind<>ALL(removed))
  AND NOT EXISTS(SELECT 1 FROM public.transaction_categories c WHERE c.user_id=owner AND c.direction=side) THEN
  RAISE EXCEPTION 'Keep at least one category of this type.';
 END IF;
 usage:=public.built_in_category_usage(p_kind);
 IF target IS NULL AND (usage->>'records')::integer+(usage->>'deleted')::integer+(usage->>'watchlists')::integer+(usage->>'rules')::integer>0 THEN
  RAISE EXCEPTION 'This category is in use. Choose a replacement category.';
 END IF;
 IF target IS NOT NULL THEN
  UPDATE public.finance_records SET custom_category_id=target WHERE user_id=owner AND kind=p_kind AND custom_category_id IS NULL;
  UPDATE public.deleted_items SET data=jsonb_set(data,'{custom_category_id}',to_jsonb(target)) WHERE user_id=owner AND source='finance_records' AND data->>'kind'=p_kind AND coalesce(data->>'custom_category_id','')='';
  -- A rule or template names an added category on its direction's general kind.
  UPDATE public.transaction_rules SET kind=general,category_id=target WHERE user_id=owner AND kind=p_kind AND category_id IS NULL;
  UPDATE public.transaction_rules SET match_kind=general,match_category_id=target WHERE user_id=owner AND match_kind=p_kind AND match_category_id IS NULL;
  UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN item->>'category'=p_kind THEN jsonb_set(item,'{category}',to_jsonb(target::text)) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
   WHERE w.user_id=owner AND w.key='watchlists' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item WHERE item->>'category'=p_kind);
  UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN item->>'kind'=p_kind AND coalesce(item->>'custom_category_id','')='' THEN item||jsonb_build_object('kind',general,'custom_category_id',target) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
   WHERE w.user_id=owner AND w.key='entry_templates' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item WHERE item->>'kind'=p_kind AND coalesce(item->>'custom_category_id','')='');
 END IF;
 INSERT INTO public.workspace_preferences(user_id,key,data) VALUES(owner,'removed_categories',jsonb_build_object('kinds',to_jsonb(removed||p_kind)))
  ON CONFLICT(user_id,key) DO UPDATE SET data=EXCLUDED.data;
 RETURN jsonb_build_object('ok',true,'replacement',target);
END $$;

REVOKE ALL ON FUNCTION public.built_in_category_usage(text),public.delete_built_in_category(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.built_in_category_usage(text),public.delete_built_in_category(text,uuid,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
