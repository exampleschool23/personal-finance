-- Spending plans become Budget categories. Apply after 129.
-- A monthly spending plan was a second budget beside Budget, with its own four
-- labels (Groceries, Family support, Household, Other). Each plan now becomes a
-- spending category named after the plan (an existing spending category of that
-- name is reused):
-- * its monthly amounts become the category's budget, in the plan's currency, month
--   by month as the plan had them: each amount change, no budget (0) in archived
--   months and after the end date;
-- * a plan that carried unspent money over becomes a rollover category from the
--   month it started carrying, without negative carry (a plan never carried a deficit);
-- * its label becomes the category's Budget group (Other leaves the default group);
-- * the transactions paid from it move into the category. Amounts, kinds, dates,
--   accounts and owners stay; their earlier category label is replaced;
-- * two plans with the same name join one category, their budgets added month by
--   month (merge_budget_category, migration 127).
-- A plan that comes back later, from an old backup or Recently deleted, is
-- converted the same way when its transaction commits. Nothing creates plans any
-- more; the tables stay so old backups still restore.
BEGIN;

CREATE OR REPLACE FUNCTION public.convert_expense_plan(p_plan uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE plan public.expense_plans; owner uuid; category uuid; label text; key text; first_month date; last_month date; m date;
 budget numeric; roll boolean; previous numeric; paused boolean; roll_start date; last_roll boolean:=false;
BEGIN
 SELECT * INTO plan FROM public.expense_plans WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 owner:=plan.user_id; key:='plan:'||plan.id;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 label:=left(trim(plan.name),80);
 SELECT id INTO category FROM public.transaction_categories WHERE user_id=owner AND direction='expense' AND name=label;
 IF category IS NULL THEN
  category:=gen_random_uuid();
  INSERT INTO public.transaction_categories(id,user_id,name,direction) VALUES(category,owner,label,'expense');
 END IF;

 -- The plan's budget month by month, as expense_plan_month read it, written as a forward
 -- amount wherever it changes: a new amount, an archived month or the month after the end.
 first_month:=date_trunc('month',plan.start_date)::date;
 SELECT greatest(first_month,
   coalesce((SELECT max(effective_month) FROM public.expense_plan_versions WHERE plan_id=plan.id),first_month),
   coalesce((SELECT max(greatest(date_trunc('month',(x->>'from')::date),date_trunc('month',coalesce((x->>'to')::date,(x->>'from')::date)))) FROM jsonb_array_elements(plan.archive_pauses) x)::date,first_month),
   coalesce((date_trunc('month',plan.end_date)+interval '1 month')::date,first_month))
  INTO last_month;
 FOR m IN SELECT generate_series(first_month,last_month,interval '1 month')::date LOOP
  SELECT v.amount,v.rollover INTO budget,roll FROM public.expense_plan_versions v WHERE v.plan_id=plan.id AND v.effective_month<=m ORDER BY v.effective_month DESC LIMIT 1;
  budget:=coalesce(budget,plan.amount); roll:=coalesce(roll,false);
  paused:=EXISTS(SELECT 1 FROM jsonb_array_elements(plan.archive_pauses) x WHERE m>=date_trunc('month',(x->>'from')::date) AND (x->>'to' IS NULL OR m<date_trunc('month',(x->>'to')::date)));
  IF paused OR (plan.end_date IS NOT NULL AND m>date_trunc('month',plan.end_date)::date) THEN budget:=0; roll:=false; END IF;
  IF previous IS DISTINCT FROM budget THEN
   INSERT INTO public.budget_amounts(user_id,category_key,month,amount,currency,applies_forward) VALUES(owner,key,m,budget,plan.currency,true);
   previous:=budget;
  END IF;
  -- Carry-over restarts whenever it was off or the plan was paused.
  IF roll AND NOT last_roll THEN roll_start:=m; END IF;
  last_roll:=roll;
 END LOOP;
 INSERT INTO public.budget_categories(user_id,category_key,budget_type,group_name,rollover,rollover_start,rollover_negative)
 VALUES(owner,key,'flexible',CASE WHEN plan.category<>'Other' THEN plan.category END,last_roll,CASE WHEN last_roll THEN roll_start END,false);
 PERFORM public.merge_budget_category(owner,key,category::text);

 UPDATE public.finance_records SET custom_category_id=category,expense_plan_id=NULL WHERE user_id=owner AND expense_plan_id=plan.id;
 UPDATE public.deleted_items SET data=data||jsonb_build_object('custom_category_id',category,'expense_plan_id',NULL)
  WHERE user_id=owner AND source='finance_records' AND data->>'expense_plan_id'=plan.id::text;
 DELETE FROM public.expense_plans WHERE id=plan.id;
 RETURN category;
END $$;
REVOKE ALL ON FUNCTION public.convert_expense_plan(uuid) FROM PUBLIC,anon,authenticated;

-- A plan restored later converts at commit, once its spending is back too.
CREATE OR REPLACE FUNCTION public.convert_restored_expense_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.convert_expense_plan(NEW.id);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.convert_restored_expense_plan() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS convert_restored_expense_plan ON public.expense_plans;
CREATE CONSTRAINT TRIGGER convert_restored_expense_plan AFTER INSERT ON public.expense_plans
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.convert_restored_expense_plan();

DO $$ DECLARE item uuid; BEGIN
 FOR item IN SELECT id FROM public.expense_plans ORDER BY user_id,created_at,id LOOP PERFORM public.convert_expense_plan(item); END LOOP;
END $$;

-- Nothing writes plans directly any more.
REVOKE INSERT,UPDATE ON public.expense_plans FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_budget_plan(jsonb,date,boolean) FROM authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
