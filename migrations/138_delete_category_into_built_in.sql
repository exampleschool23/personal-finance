-- Deleting a category can move its records into a built-in one. Apply after 137.
-- Settings lists built-in categories (Living expense, Charity, ...) beside added ones,
-- but a deleted category's records could only move to an added category or a new one.
-- delete_category_into_kind moves everything a category holds into a kept built-in
-- category of the same type, then deletes it as before, in one transaction:
-- * transactions and schedules take the built-in kind and leave the added category;
--   a record that may not change its kind (an income source payment, a tracked
--   movement) refuses the whole move with its own reason, and nothing changes;
-- * Recently deleted records, rules, entry templates and spending watchlists follow;
-- * the budget adds to the built-in category's (merge_budget_category, migration 127).
-- Split allocations name an added category only, so a category used in splits still
-- needs an added replacement. A bill may not move into a category that already has an
-- active bill (137); the move is refused with the reason, not a duplicate error, and nothing
-- changes. A recurring bill with paid months keeps its cadence and
-- currency (protect_settled_schedule, migration 065); during this move only, its kind
-- may change within the same type, since the kind is then only its category.
BEGIN;

DO $$ DECLARE definition text:=pg_get_functiondef('public.protect_settled_schedule()'::regprocedure); BEGIN
 IF position('finance.category_move' in definition)>0 THEN RETURN; END IF;
 IF position('IF (NEW.kind,NEW.currency,NEW.frequency,NEW.recurrence_days) IS DISTINCT FROM' in definition)=0 THEN RAISE EXCEPTION 'Could not update protect_settled_schedule; apply the earlier migrations first.'; END IF;
 EXECUTE replace(definition,'IF (NEW.kind,NEW.currency,NEW.frequency,NEW.recurrence_days) IS DISTINCT FROM',
  'IF (CASE WHEN coalesce(current_setting(''finance.category_move'',true),''0'')=''1'' AND (NEW.kind IN (''Salary'',''Rent income'',''Business income'',''Other income''))=(OLD.kind IN (''Salary'',''Rent income'',''Business income'',''Other income'')) THEN OLD.kind ELSE NEW.kind END,NEW.currency,NEW.frequency,NEW.recurrence_days) IS DISTINCT FROM');
END $$;

-- A category has one active bill (137). Moving a bill into a category that has one, whether a deleted
-- category's records move there (delete_transaction_category, delete_built_in_category) or the bill is
-- edited into it, used to fail on the unique index with a bare duplicate message after everything was
-- rolled back. The reason is named before the row is written; the whole move stops and nothing changes.
CREATE OR REPLACE FUNCTION public.guard_category_bill_move() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_records other WHERE other.user_id=NEW.user_id AND other.id<>NEW.id AND other.custom_category_id=NEW.custom_category_id
  AND other.frequency<>'Once' AND NOT other.archived AND other.kind IN ('Rent expense','Living expense','Charity','Other expense')) THEN
  RAISE EXCEPTION 'Both categories have a recurring bill. Archive one of them first.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_category_bill_move() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_category_bill_move ON public.finance_records;
CREATE TRIGGER guard_category_bill_move BEFORE UPDATE OF custom_category_id ON public.finance_records
 FOR EACH ROW WHEN (NEW.custom_category_id IS NOT NULL AND NEW.custom_category_id IS DISTINCT FROM OLD.custom_category_id AND NEW.frequency<>'Once' AND NOT NEW.archived
  AND NEW.kind IN ('Rent expense','Living expense','Charity','Other expense')) EXECUTE FUNCTION public.guard_category_bill_move();

CREATE OR REPLACE FUNCTION public.delete_category_into_kind(p_from text,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income'];
 spending text[]:=ARRAY['Rent expense','Living expense','Charity','Other expense']; side text; removed text[]; category uuid; built_in boolean;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 built_in:=p_from=ANY(incomes||spending);
 IF built_in THEN side:=CASE WHEN p_from=ANY(incomes) THEN 'income' ELSE 'expense' END;
 ELSE
  BEGIN category:=p_from::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Category not found.'; END;
  SELECT direction INTO side FROM public.transaction_categories WHERE id=category AND user_id=owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found.'; END IF;
 END IF;
 SELECT coalesce(array_agg(value),'{}') INTO removed FROM public.workspace_preferences w CROSS JOIN LATERAL jsonb_array_elements_text(w.data->'kinds') value WHERE w.user_id=owner AND w.key='removed_categories';
 IF p_kind IS NULL OR p_kind=p_from OR p_kind=ANY(removed) OR NOT p_kind=ANY(CASE WHEN side='income' THEN incomes ELSE spending END) THEN
  RAISE EXCEPTION 'Choose a different category of the same type.';
 END IF;
 IF NOT built_in AND (EXISTS(SELECT 1 FROM public.transaction_splits WHERE user_id=owner AND category_id=category)
  OR EXISTS(SELECT 1 FROM public.deleted_items d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.splits,'[]')) part WHERE d.user_id=owner AND d.source='finance_records' AND part->>'category_id'=p_from)) THEN
  RAISE EXCEPTION 'Split allocations can only move to an added category.';
 END IF;

 -- Transactions and schedules, then the same in Recently deleted.
 PERFORM set_config('finance.category_move','1',true);
 UPDATE public.finance_records SET kind=p_kind,custom_category_id=NULL
  WHERE user_id=owner AND (CASE WHEN built_in THEN kind=p_from AND custom_category_id IS NULL ELSE custom_category_id=category END);
 PERFORM set_config('finance.category_move','0',true);
 UPDATE public.deleted_items SET data=data||jsonb_build_object('kind',p_kind,'custom_category_id',NULL)
  WHERE user_id=owner AND source='finance_records' AND (CASE WHEN built_in THEN data->>'kind'=p_from AND coalesce(data->>'custom_category_id','')='' ELSE data->>'custom_category_id'=p_from END);
 -- Rules and templates name a built-in category by its kind alone.
 UPDATE public.transaction_rules SET kind=p_kind,category_id=NULL
  WHERE user_id=owner AND (CASE WHEN built_in THEN kind=p_from AND category_id IS NULL ELSE category_id=category END);
 UPDATE public.transaction_rules SET match_kind=p_kind,match_category_id=NULL
  WHERE user_id=owner AND (CASE WHEN built_in THEN match_kind=p_from AND match_category_id IS NULL ELSE match_category_id=category END);
 UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN item->>'category'=p_from THEN jsonb_set(item,'{category}',to_jsonb(p_kind)) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
  WHERE w.user_id=owner AND w.key='watchlists' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item WHERE item->>'category'=p_from);
 UPDATE public.workspace_preferences w SET data=jsonb_set(data,'{items}',(SELECT jsonb_agg(CASE WHEN (CASE WHEN built_in THEN item->>'kind'=p_from AND coalesce(item->>'custom_category_id','')='' ELSE item->>'custom_category_id'=p_from END)
   THEN item||jsonb_build_object('kind',p_kind,'custom_category_id',NULL) ELSE item END ORDER BY ord) FROM jsonb_array_elements(w.data->'items') WITH ORDINALITY p(item,ord)))
  WHERE w.user_id=owner AND w.key='entry_templates' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.data->'items') item
   WHERE CASE WHEN built_in THEN item->>'kind'=p_from AND coalesce(item->>'custom_category_id','')='' ELSE item->>'custom_category_id'=p_from END);
 -- The budget joins the built-in category's; then the emptied category is deleted as before.
 PERFORM public.merge_budget_category(owner,p_from,p_kind);
 IF built_in THEN PERFORM public.delete_built_in_category(p_from); ELSE PERFORM public.delete_transaction_category(category); END IF;
 RETURN jsonb_build_object('ok',true,'replacement',p_kind);
END $$;
REVOKE ALL ON FUNCTION public.delete_category_into_kind(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_category_into_kind(text,text) TO authenticated;

-- The capability version moves to 138, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',138,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
