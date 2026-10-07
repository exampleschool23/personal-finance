-- A payment in another currency settles its schedule. Needs 119.
-- Pixel Game Club pays a USD schedule, but its payment came in UZS: the currency
-- rule left it unlinked, so Transactions showed it while Recurring kept the month
-- open. A payment now names its schedule whatever its currency; it keeps its own
-- currency and amount, and the planning read counts it in the schedule's currency
-- at the official rate of the payment's day.
-- * A business or rent income that names no schedule takes the id of the one active
--   schedule of its business or property, in any currency.
-- * A payment that names a schedule in another currency is accepted.
-- Business and rent income from this month and last month that is still unlinked
-- settles its open payment once here, oldest first, as in 119.
BEGIN;

CREATE OR REPLACE FUNCTION public.income_schedule_of(payment public.finance_records) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE found uuid[];
BEGIN
 IF payment.kind NOT IN ('Business income','Rent income') OR payment.earning_source_id IS NOT NULL OR payment.payment_type<>'regular'
  OR (CASE WHEN payment.kind='Business income' THEN payment.business_id ELSE payment.income_source_id END) IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(candidate.id) INTO found FROM public.finance_records candidate
  WHERE candidate.user_id=payment.user_id AND candidate.kind=payment.kind AND candidate.frequency<>'Once'
  AND NOT candidate.archived AND NOT candidate.source_paused
  AND (CASE WHEN payment.kind='Business income' THEN candidate.business_id=payment.business_id ELSE candidate.income_source_id=payment.income_source_id END);
 RETURN CASE WHEN cardinality(found)=1 THEN found[1] END;
END $$;
REVOKE ALL ON FUNCTION public.income_schedule_of(public.finance_records) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.name_scheduled_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule public.finance_records; incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income'];
BEGIN
 -- Rows written by a verified restore or an undo keep exactly what they were saved with.
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.occurrence_record_id,NEW.occurrence_due_on) IS DISTINCT FROM (OLD.occurrence_record_id,OLD.occurrence_due_on) THEN RAISE EXCEPTION 'A scheduled payment keeps its schedule.'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.frequency<>'Once' OR NEW.date IS NULL THEN
  IF NEW.occurrence_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
  RETURN NEW;
 END IF;
 NEW.occurrence_record_id:=coalesce(NEW.occurrence_record_id,public.income_schedule_of(NEW));
 IF NEW.occurrence_record_id IS NULL THEN NEW.occurrence_due_on:=NULL; RETURN NEW; END IF;
 SELECT * INTO schedule FROM public.finance_records WHERE id=NEW.occurrence_record_id AND user_id=NEW.user_id AND frequency<>'Once';
 IF NOT FOUND OR (NEW.kind=ANY(incomes))<>(schedule.kind=ANY(incomes)) THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
 IF NEW.occurrence_due_on IS NULL THEN
  NEW.occurrence_due_on:=public.scheduled_payment_due(NEW,schedule);
  IF NEW.occurrence_due_on IS NULL THEN NEW.occurrence_record_id:=NULL; END IF;
 ELSIF NOT public.is_schedule_date(schedule.frequency,schedule.date,schedule.end_date,NEW.occurrence_due_on,schedule.recurrence_days) THEN
  RAISE EXCEPTION 'Choose a scheduled payment date.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.name_scheduled_payment() FROM PUBLIC,anon,authenticated;

-- Recent business and rent income in another currency than its schedule settles the schedule's open payment.
DO $$ DECLARE payment public.finance_records; schedule public.finance_records; due date; BEGIN
 FOR payment IN SELECT * FROM public.finance_records r WHERE r.frequency='Once' AND r.kind IN ('Business income','Rent income') AND r.occurrence_record_id IS NULL
  AND r.date>=date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)-interval '1 month'
  AND NOT EXISTS(SELECT 1 FROM public.payment_occurrences o WHERE o.user_id=r.user_id AND o.transaction_id=r.id) ORDER BY r.date,r.created_at,r.id LOOP
  SELECT * INTO schedule FROM public.finance_records WHERE id=public.income_schedule_of(payment);
  CONTINUE WHEN NOT FOUND;
  due:=public.scheduled_payment_due(payment,schedule);
  CONTINUE WHEN due IS NULL OR EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=payment.user_id AND record_id=schedule.id AND due_on=due);
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id) VALUES(gen_random_uuid(),payment.user_id,schedule.id,due,'paid',payment.id);
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
