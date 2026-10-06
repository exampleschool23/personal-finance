-- Restore resumes from the month it happens. Apply after 114.
-- Each archive opens a pause and each restore closes it: archive_pauses is a
-- list of {from, to} dates on repeating records and spending plans, kept by a
-- trigger whenever `archived` changes. The archive month leaves budgets,
-- forecasts and schedules; the restore month comes back. Months in between add
-- no planned amount, no carry-over and no overdue payments, and the months
-- before the archive keep the plan as it was. Rows archived before this
-- migration get a pause from today. No other rows are rewritten.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS archive_pauses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(archive_pauses)='array');
ALTER TABLE public.expense_plans ADD COLUMN IF NOT EXISTS archive_pauses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(archive_pauses)='array');

UPDATE public.finance_records SET archive_pauses=jsonb_build_array(jsonb_build_object('from',(now() AT TIME ZONE 'Asia/Tashkent')::date,'to',NULL))
WHERE archived AND archive_pauses='[]'::jsonb;
UPDATE public.expense_plans SET archive_pauses=jsonb_build_array(jsonb_build_object('from',(now() AT TIME ZONE 'Asia/Tashkent')::date,'to',NULL))
WHERE archived AND archive_pauses='[]'::jsonb;

-- Archiving opens a pause from today; restoring closes the open one today, or drops it when it opened today.
CREATE OR REPLACE FUNCTION public.track_archive_pause() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Tashkent')::date;
BEGIN
 -- A verified backup restore brings its pauses back as they were.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF NEW.archived THEN
  NEW.archive_pauses:=coalesce(OLD.archive_pauses,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('from',today,'to',NULL));
 ELSE
  NEW.archive_pauses:=(SELECT coalesce(jsonb_agg(CASE WHEN x.p->>'to' IS NULL THEN jsonb_set(x.p,'{to}',to_jsonb(today)) ELSE x.p END ORDER BY x.n),'[]'::jsonb)
   FROM jsonb_array_elements(coalesce(OLD.archive_pauses,'[]'::jsonb)) WITH ORDINALITY x(p,n)
   WHERE NOT (x.p->>'to' IS NULL AND (x.p->>'from')::date=today));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.track_archive_pause() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS track_archive_pause ON public.finance_records;
CREATE TRIGGER track_archive_pause BEFORE UPDATE OF archived ON public.finance_records
FOR EACH ROW WHEN (OLD.archived IS DISTINCT FROM NEW.archived) EXECUTE FUNCTION public.track_archive_pause();
DROP TRIGGER IF EXISTS track_archive_pause ON public.expense_plans;
CREATE TRIGGER track_archive_pause BEFORE UPDATE OF archived ON public.expense_plans
FOR EACH ROW WHEN (OLD.archived IS DISTINCT FROM NEW.archived) EXECUTE FUNCTION public.track_archive_pause();

-- A plan's month skips its paused months: no budget, and carry-over starts again at zero when it is restored.
CREATE OR REPLACE FUNCTION public.expense_plan_month(p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.expense_plans; m date; chosen date:=date_trunc('month',p_month)::date; budget numeric; roll boolean; spent numeric; carry numeric; incoming numeric; result jsonb:='[]'::jsonb;
BEGIN
 FOR p IN SELECT * FROM public.expense_plans WHERE user_id=public.active_owner() ORDER BY category,name,id LOOP
  carry:=0; incoming:=0; spent:=0; budget:=p.amount; roll:=false;
  FOR m IN SELECT generate_series(least(date_trunc('month',p.start_date)::date,chosen),chosen,interval '1 month')::date LOOP
   SELECT v.amount,v.rollover INTO budget,roll FROM public.expense_plan_versions v WHERE v.plan_id=p.id AND v.user_id=public.active_owner() AND v.effective_month<=m ORDER BY effective_month DESC LIMIT 1;
   budget:=coalesce(budget,p.amount);roll:=coalesce(roll,false);
   IF m<date_trunc('month',p.start_date)::date OR (p.end_date IS NOT NULL AND m>date_trunc('month',p.end_date)::date)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.archive_pauses) x WHERE m>=date_trunc('month',(x->>'from')::date) AND (x->>'to' IS NULL OR m<date_trunc('month',(x->>'to')::date)))
   THEN budget:=0;carry:=0; END IF;
   SELECT coalesce(sum(r.amount),0) INTO spent FROM public.finance_records r WHERE r.expense_plan_id=p.id AND r.user_id=public.active_owner() AND r.date>=m AND r.date<m+interval '1 month';
   incoming:=CASE WHEN roll THEN carry ELSE 0 END;
   carry:=CASE WHEN roll THEN greatest(0,budget+incoming-spent) ELSE 0 END;
  END LOOP;
  result:=result||jsonb_build_array(to_jsonb(p)-'user_id'||jsonb_build_object('amount',budget,'base_amount',p.amount,'spent',spent,'carryover',incoming,'rollover',roll));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.expense_plan_month(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.expense_plan_month(date) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
