BEGIN;
CREATE TABLE public.expense_plan_versions (
 plan_id uuid NOT NULL REFERENCES public.expense_plans(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 effective_month date NOT NULL CHECK(extract(day FROM effective_month)=1),
 amount numeric NOT NULL CHECK(amount>0 AND amount<=1e15), rollover boolean NOT NULL DEFAULT false,
 PRIMARY KEY(plan_id,effective_month)
);
ALTER TABLE public.expense_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.expense_plan_versions FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.expense_plan_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.expense_plan_versions TO authenticated;
-- Seed the first known allowance; there is no invented history of older edits.
INSERT INTO public.expense_plan_versions SELECT id,user_id,date_trunc('month',start_date)::date,amount,false FROM public.expense_plans;
CREATE FUNCTION public.seed_budget_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.expense_plan_versions VALUES(NEW.id,NEW.user_id,date_trunc('month',NEW.start_date)::date,NEW.amount,false);
 RETURN NEW;
END $$;
CREATE TRIGGER seed_budget_version AFTER INSERT ON public.expense_plans FOR EACH ROW EXECUTE FUNCTION public.seed_budget_version();
CREATE FUNCTION public.save_budget_plan(p_plan jsonb,p_month date,p_rollover boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.expense_plans; owner uuid:=auth.uid(); item uuid:=(p_plan->>'id')::uuid;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_month IS NULL OR extract(day FROM p_month)<>1 OR p_rollover IS NULL THEN RAISE EXCEPTION 'Check the plan fields.'; END IF;
 SELECT * INTO existing FROM public.expense_plans WHERE id=item FOR UPDATE;
 IF FOUND THEN
  IF existing.user_id<>owner THEN RAISE EXCEPTION 'Plan not found.'; END IF;
  IF existing.currency<>p_plan->>'currency' OR existing.start_date<>(p_plan->>'start_date')::date THEN RAISE EXCEPTION 'Keep the currency and start date of an existing budget.'; END IF;
  UPDATE public.expense_plans SET name=p_plan->>'name',category=p_plan->>'category',end_date=(p_plan->>'end_date')::date WHERE id=item;
 ELSE
  INSERT INTO public.expense_plans(id,user_id,name,category,currency,amount,start_date,end_date)
  VALUES(item,owner,p_plan->>'name',p_plan->>'category',p_plan->>'currency',(p_plan->>'amount')::numeric,(p_plan->>'start_date')::date,(p_plan->>'end_date')::date);
 END IF;
 IF p_month<date_trunc('month',(p_plan->>'start_date')::date)::date THEN RAISE EXCEPTION 'Budget changes cannot start before the plan.'; END IF;
 INSERT INTO public.expense_plan_versions VALUES(item,owner,p_month,(p_plan->>'amount')::numeric,p_rollover)
 ON CONFLICT(plan_id,effective_month) DO UPDATE SET amount=excluded.amount,rollover=excluded.rollover;
END $$;
REVOKE ALL ON FUNCTION public.save_budget_plan(jsonb,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_budget_plan(jsonb,date,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.expense_plan_month(p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.expense_plans; m date; chosen date:=date_trunc('month',p_month)::date; budget numeric; roll boolean; spent numeric; carry numeric; incoming numeric; result jsonb:='[]'::jsonb;
BEGIN
 FOR p IN SELECT * FROM public.expense_plans WHERE user_id=auth.uid() ORDER BY category,name,id LOOP
  carry:=0; incoming:=0; spent:=0; budget:=p.amount; roll:=false;
  FOR m IN SELECT generate_series(least(date_trunc('month',p.start_date)::date,chosen),chosen,interval '1 month')::date LOOP
   SELECT v.amount,v.rollover INTO budget,roll FROM public.expense_plan_versions v WHERE v.plan_id=p.id AND v.user_id=auth.uid() AND v.effective_month<=m ORDER BY effective_month DESC LIMIT 1;
   budget:=coalesce(budget,p.amount);roll:=coalesce(roll,false);
   IF m<date_trunc('month',p.start_date)::date OR (p.end_date IS NOT NULL AND m>date_trunc('month',p.end_date)::date) THEN budget:=0;carry:=0; END IF;
   SELECT coalesce(sum(r.amount),0) INTO spent FROM public.finance_records r WHERE r.expense_plan_id=p.id AND r.user_id=auth.uid() AND r.date>=m AND r.date<m+interval '1 month';
   incoming:=CASE WHEN roll THEN carry ELSE 0 END;
   carry:=CASE WHEN roll THEN greatest(0,budget+incoming-spent) ELSE 0 END;
  END LOOP;
  result:=result||jsonb_build_array(to_jsonb(p)-'user_id'||jsonb_build_object('amount',budget,'base_amount',p.amount,'spent',spent,'carryover',incoming,'rollover',roll));
 END LOOP;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
