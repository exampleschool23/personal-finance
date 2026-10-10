-- A monthly schedule's day of the month and its currency can change after payments. Apply after 140.
-- protect_settled_schedule (migration 065) froze a schedule with recorded or skipped payments: its
-- kind, currency, cadence and start date. The start date stays as it was saved (the forms no longer
-- offer to change it), but two edits are allowed now:
-- * The day of the month of an "Every month" schedule. The start date moves to that day within its own
--   month, and every recorded or skipped occurrence moves to the same day of its own month (the last day
--   of a shorter month), together with the payments that name it (occurrence_due_on, and a salary's
--   income_due_on). Nothing moves to another month and nothing is counted twice.
-- * The currency. Since migration 120 a payment keeps its own currency and counts in its schedule's at
--   the official rate of its day, so payments made before the change are counted in the new currency.
-- Any other change of the start date, the kind or the cadence is still refused.
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_settled_schedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income'];
BEGIN
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=OLD.user_id AND record_id=OLD.id) THEN
  -- While a deleted category's records move (migration 138), a bill's kind may change within the same type.
  IF (CASE WHEN coalesce(current_setting('finance.category_move',true),'0')='1' AND (NEW.kind=ANY(incomes))=(OLD.kind=ANY(incomes)) THEN OLD.kind ELSE NEW.kind END,NEW.frequency,NEW.recurrence_days)
     IS DISTINCT FROM (OLD.kind,OLD.frequency,OLD.recurrence_days)
   -- The start date stays; a monthly schedule may move to another day of the same month (move_schedule_day).
   OR (NEW.date IS DISTINCT FROM OLD.date AND NOT EXISTS(SELECT 1 FROM public.income_sources WHERE user_id=OLD.user_id AND schedule_id=OLD.id)
       AND NOT (OLD.frequency='Monthly' AND NEW.date IS NOT NULL AND OLD.date IS NOT NULL AND date_trunc('month',NEW.date)=date_trunc('month',OLD.date)))
   OR (NEW.end_date IS NOT NULL AND EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=OLD.user_id AND record_id=OLD.id AND due_on>NEW.end_date AND status='paid')) THEN
   RAISE EXCEPTION 'Keep the schedule compatible with settled payments. Stop it and create a new plan to change its cadence.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_settled_schedule() FROM PUBLIC,anon,authenticated;

-- The day a monthly schedule falls on in a month: its day, or the month's last day when the month is shorter.
CREATE OR REPLACE FUNCTION public.schedule_day_in(p_day integer,p_month date) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (date_trunc('month',p_month)+make_interval(days=>least(p_day,extract(day FROM date_trunc('month',p_month)+interval '1 month - 1 day')::integer)-1))::date
$$;
REVOKE ALL ON FUNCTION public.schedule_day_in(integer,date) FROM PUBLIC,anon;

-- After a monthly schedule moved to another day: its occurrences and the payments naming them follow, each in its own month.
CREATE OR REPLACE FUNCTION public.move_schedule_day() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE day integer:=extract(day FROM NEW.date)::integer; previous_restore text;
BEGIN
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 UPDATE public.payment_occurrences o SET due_on=public.schedule_day_in(day,o.due_on)
  WHERE o.user_id=NEW.user_id AND o.record_id=NEW.id AND o.due_on<>public.schedule_day_in(day,o.due_on);
 -- A payment keeps its schedule (name_scheduled_payment); only its due date follows, as a restore writes it.
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.restore_transaction','1',true);
 -- One statement per payment: a salary is checked against its plan's new day with both of its due dates moved.
 UPDATE public.finance_records r SET
   occurrence_due_on=CASE WHEN r.occurrence_record_id=NEW.id THEN public.schedule_day_in(day,r.occurrence_due_on) ELSE r.occurrence_due_on END,
   income_due_on=CASE WHEN r.kind='Salary' AND r.income_source_id=NEW.id AND r.income_due_on IS NOT NULL THEN public.schedule_day_in(day,r.income_due_on) ELSE r.income_due_on END
  WHERE r.user_id=NEW.user_id AND (
   (r.occurrence_record_id=NEW.id AND r.occurrence_due_on<>public.schedule_day_in(day,r.occurrence_due_on))
   OR (r.kind='Salary' AND r.income_source_id=NEW.id AND r.income_due_on IS NOT NULL AND r.income_due_on<>public.schedule_day_in(day,r.income_due_on)));
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.move_schedule_day() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS move_schedule_day ON public.finance_records;
CREATE TRIGGER move_schedule_day AFTER UPDATE OF date ON public.finance_records
 FOR EACH ROW WHEN (OLD.frequency='Monthly' AND NEW.frequency='Monthly' AND OLD.date IS NOT NULL AND NEW.date IS NOT NULL
  AND extract(day FROM NEW.date)<>extract(day FROM OLD.date) AND date_trunc('month',NEW.date)=date_trunc('month',OLD.date))
 EXECUTE FUNCTION public.move_schedule_day();

-- The capability version moves to 141, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',141,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
