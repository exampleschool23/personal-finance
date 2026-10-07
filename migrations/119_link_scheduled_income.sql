-- Payments name their schedule by id. Needs 118.
-- A payment typed in the bot or the record form named its business but not its
-- schedule, so Cash flow counted it while Recurring still showed the month's
-- payment as open or overdue. One rule now links every payment to its schedule:
-- * A payment of a schedule carries the schedule's id (occurrence_record_id) and
--   the due date it pays (occurrence_due_on). The bot asks which scheduled
--   payment it is; Record payment and later payments already name both.
-- * A business or rent income that names no schedule takes the id of the one
--   active schedule of its business or property in its currency. Nothing is
--   guessed from names; with no such schedule, or more than one, it stays unlinked.
-- * The database chooses the due date when only the schedule is named: the
--   earliest open payment of the payment's own month, else last month's open one,
--   else it adds to this month's recorded payment. With none of these it stays
--   unlinked.
-- * The first payment of a due date settles it (payment_occurrences.transaction_id);
--   every other payment naming it adds to what was received or paid.
-- A schedule id cannot be changed afterwards, and a verified restore or an undo
-- keeps rows exactly as they were saved.
-- Business and rent income from this month and last month that is not linked yet
-- settles its open payment once here, oldest first.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.patch_schedule_ids(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Record payment names the schedule and due date on the transaction it writes.
SELECT pg_temp.patch_schedule_ids('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$custom_category_id,account_exchange_rate,account_rate_date,account_currency)
   VALUES(new_id,owner,r.name,r.kind,r.currency,amount,coalesce((p_data->>'paid_on')::date,day),'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency');$old$,
 $new$custom_category_id,account_exchange_rate,account_rate_date,account_currency,occurrence_record_id,occurrence_due_on)
   VALUES(new_id,owner,r.name,r.kind,r.currency,amount,coalesce((p_data->>'paid_on')::date,day),'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency',bid,day);$new$,1);
-- The bot and the record form may name the schedule a new payment belongs to.
SELECT pg_temp.patch_schedule_ids('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$allowed text[]:=ARRAY['id','name',$old$,$new$allowed text[]:=ARRAY['id','occurrence_record_id','name',$new$,1);

-- The schedule a business or rent income belongs to when it names none: the one active schedule of its business or property.
CREATE OR REPLACE FUNCTION public.income_schedule_of(payment public.finance_records) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE found uuid[];
BEGIN
 IF payment.kind NOT IN ('Business income','Rent income') OR payment.earning_source_id IS NOT NULL OR payment.payment_type<>'regular'
  OR (CASE WHEN payment.kind='Business income' THEN payment.business_id ELSE payment.income_source_id END) IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(candidate.id) INTO found FROM public.finance_records candidate
  WHERE candidate.user_id=payment.user_id AND candidate.kind=payment.kind AND candidate.frequency<>'Once' AND candidate.currency=payment.currency
  AND NOT candidate.archived AND NOT candidate.source_paused
  AND (CASE WHEN payment.kind='Business income' THEN candidate.business_id=payment.business_id ELSE candidate.income_source_id=payment.income_source_id END);
 RETURN CASE WHEN cardinality(found)=1 THEN found[1] END;
END $$;
REVOKE ALL ON FUNCTION public.income_schedule_of(public.finance_records) FROM PUBLIC,anon,authenticated;

-- The due date a payment of `schedule` pays: an open one of its own month, else last month's, else this month's recorded one.
CREATE OR REPLACE FUNCTION public.scheduled_payment_due(payment public.finance_records,schedule public.finance_records) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT day::date FROM generate_series(date_trunc('month',payment.date)-interval '1 month',date_trunc('month',payment.date)+interval '1 month - 1 day',interval '1 day') day
 LEFT JOIN public.payment_occurrences o ON o.user_id=schedule.user_id AND o.record_id=schedule.id AND o.due_on=day::date
 WHERE public.is_schedule_date(schedule.frequency,schedule.date,schedule.end_date,day::date,schedule.recurrence_days)
  AND (o.id IS NULL OR (o.status='paid' AND day>=date_trunc('month',payment.date)))
 ORDER BY o.id IS NOT NULL,day<date_trunc('month',payment.date),CASE WHEN o.id IS NOT NULL THEN abs(day::date-payment.date) END,day
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.scheduled_payment_due(public.finance_records,public.finance_records) FROM PUBLIC,anon,authenticated;

-- Before a payment is written: find or check its schedule and the due date it pays.
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
 IF NEW.currency<>schedule.currency THEN RAISE EXCEPTION 'Record this payment in the currency of its schedule.'; END IF;
 IF NEW.occurrence_due_on IS NULL THEN
  NEW.occurrence_due_on:=public.scheduled_payment_due(NEW,schedule);
  IF NEW.occurrence_due_on IS NULL THEN NEW.occurrence_record_id:=NULL; END IF;
 ELSIF NOT public.is_schedule_date(schedule.frequency,schedule.date,schedule.end_date,NEW.occurrence_due_on,schedule.recurrence_days) THEN
  RAISE EXCEPTION 'Choose a scheduled payment date.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.name_scheduled_payment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS link_scheduled_income ON public.finance_records;
DROP TRIGGER IF EXISTS y_name_scheduled_payment ON public.finance_records;
CREATE TRIGGER y_name_scheduled_payment BEFORE INSERT OR UPDATE OF occurrence_record_id,occurrence_due_on ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.name_scheduled_payment();

-- After it is written: the first payment of a due date settles it.
CREATE OR REPLACE FUNCTION public.settle_scheduled_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.finance_restore_active() AND coalesce(current_setting('finance.restore_transaction',true),'0')<>'1' THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
  VALUES(NEW.id,NEW.user_id,NEW.occurrence_record_id,NEW.occurrence_due_on,'paid',NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.settle_scheduled_payment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS settle_scheduled_payment ON public.finance_records;
CREATE TRIGGER settle_scheduled_payment AFTER INSERT ON public.finance_records
 FOR EACH ROW WHEN (NEW.occurrence_record_id IS NOT NULL AND NEW.occurrence_due_on IS NOT NULL) EXECUTE FUNCTION public.settle_scheduled_payment();

DROP FUNCTION IF EXISTS public.link_scheduled_income_receipt();
DROP FUNCTION IF EXISTS public.link_scheduled_income(uuid);

-- Recent business and rent income saved before this settles its schedule's open payment.
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
