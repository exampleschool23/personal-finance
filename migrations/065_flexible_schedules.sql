BEGIN;
ALTER TABLE public.finance_records ADD COLUMN recurrence_days integer;
ALTER TABLE public.income_sources ADD COLUMN recurrence_days integer;
ALTER TABLE public.finance_records DROP CONSTRAINT finance_records_frequency_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_frequency_check CHECK(frequency IN ('Once','Weekly','Fortnightly','Monthly','Yearly','Custom'));
ALTER TABLE public.income_sources DROP CONSTRAINT income_sources_frequency_check;
ALTER TABLE public.income_sources ADD CONSTRAINT income_sources_frequency_check CHECK(frequency IN ('Weekly','Fortnightly','Monthly','Yearly','Custom'));
ALTER TABLE public.finance_records ADD CONSTRAINT finance_recurrence_interval CHECK((frequency='Custom' AND recurrence_days BETWEEN 1 AND 366 AND recurrence_days IS NOT NULL) OR (frequency<>'Custom' AND recurrence_days IS NULL));
ALTER TABLE public.income_sources ADD CONSTRAINT source_recurrence_interval CHECK((frequency='Custom' AND recurrence_days BETWEEN 1 AND 366 AND recurrence_days IS NOT NULL) OR (frequency IS DISTINCT FROM 'Custom' AND recurrence_days IS NULL));
ALTER TABLE public.finance_records DROP CONSTRAINT finance_records_end_date_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_end_date_check CHECK(end_date IS NULL OR (date IS NOT NULL AND end_date>=date AND frequency IN ('Weekly','Fortnightly','Monthly','Yearly','Custom') AND kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')));
CREATE FUNCTION public.is_schedule_date(frequency text,anchor date,until_day date,day date,days integer DEFAULT NULL) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(day>=anchor AND (until_day IS NULL OR day<=until_day) AND CASE
 WHEN frequency IN ('Weekly','Fortnightly','Custom') THEN (day-anchor)%nullif(CASE frequency WHEN 'Weekly' THEN 7 WHEN 'Fortnightly' THEN 14 ELSE days END,0)=0
 WHEN frequency IN ('Monthly','Yearly') THEN extract(day FROM day)=least(extract(day FROM anchor),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day')) AND (frequency='Monthly' OR extract(month FROM day)=extract(month FROM anchor)) ELSE false END,false)
$$;
REVOKE ALL ON FUNCTION public.is_schedule_date(text,date,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_schedule_date(text,date,date,date,integer) TO authenticated;
-- Exact guarded patches preserve restore guards and existing operation protections.
CREATE FUNCTION pg_temp.patch_daily(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); BEGIN
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
SELECT pg_temp.patch_daily('public.save_finance_record(jsonb,bigint)'::regprocedure,$old$'is_investment'];$old$,$new$'is_investment','recurrence_days'];$new$);
SELECT pg_temp.patch_daily('public.planning_action(text,jsonb)'::regprocedure,$old$r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date))$old$,$new$r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,day,r.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,$old$r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date))$old$,$new$r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,day,r.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.validate_earning_receipt()'::regprocedure,$old$due IS NULL OR due<source.start_date OR (source.end_date IS NOT NULL AND due>source.end_date) OR extract(day FROM due)<>least(extract(day FROM source.start_date),extract(day FROM (month_start+interval '1 month - 1 day'))) OR (source.frequency='Yearly' AND extract(month FROM due)<>extract(month FROM source.start_date))$old$,$new$NOT public.is_schedule_date(source.frequency,source.start_date,source.end_date,due,source.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.validate_income_source()'::regprocedure,$old$IF due<source.date OR (source.end_date IS NOT NULL AND due>source.end_date) OR
    extract(day FROM due)<>least(extract(day FROM source.date),extract(day FROM (month_start+interval '1 month - 1 day'))) OR
    (source.frequency='Yearly' AND extract(month FROM due)<>extract(month FROM source.date))$old$,$new$IF NOT public.is_schedule_date(source.frequency,source.date,source.end_date,due,source.recurrence_days)$new$);
SELECT pg_temp.patch_daily('public.validate_income_source()'::regprocedure,$old$source.frequency IN ('Monthly','Yearly')$old$,$new$source.frequency IN ('Weekly','Fortnightly','Monthly','Yearly','Custom')$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$saved.frequency,saved.start_date$old$,$new$saved.frequency,saved.recurrence_days,saved.start_date$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$old.frequency,old.start_date$old$,$new$old.frequency,old.recurrence_days,old.start_date$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$frequency,end_date,business_id,income_source_id,source_paused)$old$,$new$frequency,recurrence_days,end_date,business_id,income_source_id,source_paused)$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$saved.start_date,saved.frequency,saved.end_date$old$,$new$saved.start_date,saved.frequency,saved.recurrence_days,saved.end_date$new$);
SELECT pg_temp.patch_daily('public.save_income_source(jsonb)'::regprocedure,$old$frequency=EXCLUDED.frequency,$old$,$new$frequency=EXCLUDED.frequency,recurrence_days=EXCLUDED.recurrence_days,$new$);
SELECT pg_temp.patch_daily('public.protect_income_schedule()'::regprocedure,$old$NEW.frequency,NEW.date$old$,$new$NEW.frequency,NEW.recurrence_days,NEW.date$new$);
SELECT pg_temp.patch_daily('public.protect_income_schedule()'::regprocedure,$old$OLD.frequency,OLD.date$old$,$new$OLD.frequency,OLD.recurrence_days,OLD.date$new$);
SELECT pg_temp.patch_daily('public.finance_records_page(integer,text,text,boolean)'::regprocedure,$old$r.currency,r.frequency,$old$,$new$r.currency,r.frequency,r.recurrence_days,$new$);
CREATE FUNCTION public.set_schedule_exception(p_record uuid,p_day date,p_skip boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.payment_occurrences;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_skip IS NULL THEN RAISE EXCEPTION 'Choose a schedule action.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=auth.uid();
 IF NOT FOUND OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,p_day,r.recurrence_days) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
 SELECT * INTO existing FROM public.payment_occurrences WHERE user_id=auth.uid() AND record_id=p_record AND due_on=p_day;
 IF existing.status='paid' THEN RAISE EXCEPTION 'A recorded payment cannot be skipped.'; END IF;
 IF p_skip THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status) VALUES(gen_random_uuid(),auth.uid(),p_record,p_day,'dismissed') ON CONFLICT(user_id,record_id,due_on) DO NOTHING;
 ELSE DELETE FROM public.payment_occurrences WHERE user_id=auth.uid() AND record_id=p_record AND due_on=p_day AND status='dismissed';
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.set_schedule_exception(uuid,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_schedule_exception(uuid,date,boolean) TO authenticated;
CREATE FUNCTION public.protect_settled_schedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=OLD.user_id AND record_id=OLD.id) THEN
  IF (NEW.kind,NEW.currency,NEW.frequency,NEW.recurrence_days) IS DISTINCT FROM (OLD.kind,OLD.currency,OLD.frequency,OLD.recurrence_days)
   OR (NEW.date IS DISTINCT FROM OLD.date AND NOT EXISTS(SELECT 1 FROM public.income_sources WHERE user_id=OLD.user_id AND schedule_id=OLD.id))
   OR (NEW.end_date IS NOT NULL AND EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=OLD.user_id AND record_id=OLD.id AND due_on>NEW.end_date AND status='paid')) THEN
   RAISE EXCEPTION 'Keep the schedule compatible with settled payments. Stop it and create a new plan to change its cadence.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_settled_schedule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_settled_schedule BEFORE UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.protect_settled_schedule();
NOTIFY pgrst,'reload schema';
COMMIT;
