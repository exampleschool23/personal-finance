-- A new income source cannot take over a record; a restored plan keeps its budget. Apply after 133.
-- * Since migration 132 a source's new schedule takes the source's own id, and the
--   schedule was written with INSERT ... ON CONFLICT(id) DO UPDATE. A new source whose
--   id already named a record (a one-time Salary payment, say) rewrote that record
--   into its schedule. Now a source without a schedule refuses an id another record
--   has, and only the source's own schedule is ever updated.
-- * A spending plan restored later (old backup, Recently deleted) joined a spending
--   category of the same name. When that category budgets in another currency, the
--   merge keeps the category's amount and the plan's budget was lost. Now the plan
--   reuses a same-named category only when its budget is in the plan's currency or it
--   has none; otherwise it gets its own category, named after the plan and its
--   currency ("Food (USD)"). Names follow the category rule: letter case and spaces
--   are ignored and built-in names are never repeated.
-- No existing rows are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_income_source(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); item uuid:=(p_data->>'id')::uuid; old public.income_sources; saved public.income_sources; linked public.finance_records; schedule uuid; has_payments boolean; previous_write text; written int;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO old FROM public.income_sources WHERE id=item FOR UPDATE;
 IF FOUND AND old.user_id<>owner THEN RAISE EXCEPTION 'Income source not found.'; END IF;
 saved:=jsonb_populate_record(NULL::public.income_sources,p_data||jsonb_build_object('user_id',owner,'archived',coalesce((p_data->>'archived')::boolean,false)));
 IF saved.name IS NULL OR saved.kind IS NULL OR saved.currency IS NULL OR saved.mode IS NULL THEN RAISE EXCEPTION 'Check the income source fields.'; END IF;
 IF saved.kind IN ('Rent income','Business income') THEN
  SELECT * INTO linked FROM public.finance_records WHERE user_id=owner AND id=saved.linked_record_id AND kind=CASE WHEN saved.kind='Rent income' THEN 'Property' ELSE 'Business' END FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
 ELSIF saved.linked_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=owner AND (earning_source_id=item OR income_source_id=old.schedule_id)) OR EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=owner AND record_id=old.schedule_id) INTO has_payments;
 IF old.id IS NOT NULL AND has_payments AND (saved.kind,saved.currency,saved.mode,saved.frequency,saved.recurrence_days,saved.start_date,saved.end_date,saved.linked_record_id) IS DISTINCT FROM (old.kind,old.currency,old.mode,old.frequency,old.recurrence_days,old.start_date,old.end_date,old.linked_record_id) THEN
  RAISE EXCEPTION 'Keep the type, currency and schedule compatible with recorded payments.';
 END IF;
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 PERFORM set_config('finance.income_source_write','1',true);
 schedule:=old.schedule_id;
 IF saved.mode='fixed' THEN
  schedule:=coalesce(schedule,item);
  -- A new schedule takes the source's id, which may not already name a record (anyone's).
  IF old.schedule_id IS NULL AND EXISTS(SELECT 1 FROM public.finance_records WHERE id=schedule) THEN RAISE EXCEPTION 'Check the income source fields.'; END IF;
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,recurrence_days,end_date,business_id,income_source_id,source_paused)
  VALUES(schedule,owner,saved.name,saved.kind,saved.currency,saved.amount,saved.start_date,saved.frequency,saved.recurrence_days,saved.end_date,CASE WHEN saved.kind='Business income' THEN saved.linked_record_id ELSE NULL END,CASE WHEN saved.kind='Rent income' THEN saved.linked_record_id ELSE NULL END,saved.archived)
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,currency=EXCLUDED.currency,amount=EXCLUDED.amount,date=EXCLUDED.date,frequency=EXCLUDED.frequency,recurrence_days=EXCLUDED.recurrence_days,end_date=EXCLUDED.end_date,business_id=EXCLUDED.business_id,income_source_id=EXCLUDED.income_source_id,source_paused=EXCLUDED.source_paused
   WHERE finance_records.user_id=owner AND finance_records.id=old.schedule_id;
  GET DIAGNOSTICS written=ROW_COUNT;
  IF written=0 THEN RAISE EXCEPTION 'Check the income source fields.'; END IF;
 ELSIF schedule IS NOT NULL THEN
  UPDATE public.finance_records SET source_paused=true WHERE id=schedule AND user_id=owner;
 END IF;
 saved.schedule_id:=schedule;
 INSERT INTO public.income_sources SELECT saved.* ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,currency=EXCLUDED.currency,mode=EXCLUDED.mode,archived=EXCLUDED.archived,amount=EXCLUDED.amount,frequency=EXCLUDED.frequency,recurrence_days=EXCLUDED.recurrence_days,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,linked_record_id=EXCLUDED.linked_record_id,schedule_id=EXCLUDED.schedule_id,approx_monthly=EXCLUDED.approx_monthly;
 PERFORM set_config('finance.income_source_write',previous_write,true);
 RETURN to_jsonb(saved)-'user_id';
END $$;

-- Internal: the spending category a converted plan joins (convert_expense_plan).
CREATE OR REPLACE FUNCTION public.expense_plan_category(p_owner uuid,p_name text,p_currency text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE base text:=left(trim(p_name),80); label text; suffix text; match uuid; n int:=0;
BEGIN
 LOOP
  -- "Food", then "Food (USD)", "Food (USD 2)", ...
  suffix:=CASE WHEN n=0 THEN '' ELSE ' ('||p_currency||CASE WHEN n>1 THEN ' '||n ELSE '' END||')' END;
  label:=left(base,80-length(suffix))||suffix;
  IF lower(label)=ANY(ARRAY['rent expense','living expense','charity','other expense']) THEN n:=n+1; CONTINUE; END IF;
  SELECT id INTO match FROM public.transaction_categories WHERE user_id=p_owner AND direction='expense' AND lower(trim(name))=lower(label) ORDER BY name=label DESC,id LIMIT 1;
  IF match IS NULL THEN
   match:=gen_random_uuid();
   INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(match,p_owner,label,'expense');
   RETURN match;
  END IF;
  -- A budget in another currency would keep its own amount in the merge and drop the plan's.
  IF NOT EXISTS(SELECT 1 FROM public.budget_amounts WHERE user_id=p_owner AND category_key=match::text AND currency<>p_currency) THEN RETURN match; END IF;
  match:=NULL; n:=n+1;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.expense_plan_category(uuid,text,text) FROM PUBLIC,anon,authenticated;

DO $$
DECLARE patched text;
BEGIN
 patched:=pg_get_functiondef('public.convert_expense_plan(uuid)'::regprocedure);
 IF position('public.expense_plan_category(' in patched)=0 THEN
  IF position($q$ SELECT id INTO category FROM public.transaction_categories WHERE user_id=owner AND direction='expense' AND name=label;
 IF category IS NULL THEN
  category:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(category,owner,label,'expense');
 END IF;$q$ in patched)=0 THEN RAISE EXCEPTION 'Could not update convert_expense_plan; apply migration 133 first.'; END IF;
  EXECUTE replace(patched,$q$ SELECT id INTO category FROM public.transaction_categories WHERE user_id=owner AND direction='expense' AND name=label;
 IF category IS NULL THEN
  category:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(category,owner,label,'expense');
 END IF;$q$,' category:=public.expense_plan_category(owner,label,plan.currency);');
 END IF;
END $$;

-- The capability version moves to 134, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',134,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
