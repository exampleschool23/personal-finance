-- One link for every income payment. Apply after 139.
-- A payment names the schedule it pays by occurrence_record_id and occurrence_due_on
-- (migration 119). Two older pairs were still live for income: a receipt of a fixed
-- income source named it by earning_source_id and earning_due_on (migration 043), and a
-- salary recorded against a salary plan by income_source_id and income_due_on. Their
-- triggers wrote the payment_occurrences row, but the payment's own occurrence columns
-- stayed NULL, so every reader that follows them (laterPayments, scheduleHistory,
-- delete_schedule, the Cash flow income cards) missed those payments, and the app kept
-- a client-side copy of the rule for each pair.
-- * income_schedule_of also names the schedule of a fixed source's regular receipt and
--   of a salary with a salary plan, so name_scheduled_payment fills the occurrence
--   columns, taking the due date the receipt chose (earning_due_on, income_due_on).
--   settle_scheduled_payment writes the occurrence row; the older sync triggers leave a
--   row that exists alone.
-- * A saved payment that named no schedule may name one when it is edited (NULL to an
--   id, settled like a new payment). A named schedule, its due date, earning_due_on and
--   income_due_on still never change.
-- * Every existing one-time payment that a paid occurrence row names takes that row's
--   schedule and due date, also in Recently deleted. Only two columns are copied: no
--   revision, no re-validation, no occurrence written, so the row triggers stay off.
BEGIN;

CREATE OR REPLACE FUNCTION public.income_schedule_of(payment public.finance_records) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE found uuid[];
BEGIN
 IF payment.frequency<>'Once' OR payment.payment_type<>'regular' THEN RETURN NULL; END IF;
 -- A regular receipt of a fixed income source pays that source's schedule (one id since migration 132).
 IF payment.earning_source_id IS NOT NULL THEN
  RETURN (SELECT s.schedule_id FROM public.income_sources s WHERE s.id=payment.earning_source_id AND s.user_id=payment.user_id AND s.mode='fixed' AND payment.earning_due_on IS NOT NULL);
 END IF;
 -- A salary recorded against a salary plan pays that plan.
 IF payment.kind='Salary' THEN RETURN payment.income_source_id; END IF;
 IF payment.kind NOT IN ('Business income','Rent income')
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
DECLARE schedule public.finance_records; incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income']; named uuid;
BEGIN
 -- Rows written by a verified restore or an undo keep exactly what they were saved with.
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.occurrence_record_id IS NOT NULL THEN
  -- A named schedule and its due date never change, nor the source due date it was taken from.
  IF (NEW.occurrence_record_id,NEW.occurrence_due_on) IS DISTINCT FROM (OLD.occurrence_record_id,OLD.occurrence_due_on)
   OR (NEW.earning_due_on,NEW.income_due_on) IS DISTINCT FROM (OLD.earning_due_on,OLD.income_due_on) THEN RAISE EXCEPTION 'A scheduled payment keeps its schedule.'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.frequency<>'Once' OR NEW.date IS NULL THEN
  IF NEW.occurrence_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
  RETURN NEW;
 END IF;
 -- A payment that named no schedule links when it names one, when it moves into a bill's category (an edit, a bulk
 -- recategorisation) or when it takes a source due date.
 IF TG_OP='UPDATE' AND NEW.occurrence_record_id IS NULL
  AND (NEW.custom_category_id,NEW.kind,NEW.date,NEW.earning_due_on,NEW.income_due_on) IS NOT DISTINCT FROM (OLD.custom_category_id,OLD.kind,OLD.date,OLD.earning_due_on,OLD.income_due_on) THEN RETURN NEW; END IF;
 -- The owner's lock, shared with link_category_bill and the category moves, so a payment and its bill saved at the same instant still meet.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 named:=public.income_schedule_of(NEW);
 NEW.occurrence_record_id:=coalesce(NEW.occurrence_record_id,named,public.category_bill_of(NEW));
 IF NEW.occurrence_record_id IS NULL THEN NEW.occurrence_due_on:=NULL; RETURN NEW; END IF;
 SELECT * INTO schedule FROM public.finance_records WHERE id=NEW.occurrence_record_id AND user_id=NEW.user_id AND frequency<>'Once';
 IF NOT FOUND OR (NEW.kind=ANY(incomes))<>(schedule.kind=ANY(incomes)) THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
 -- The due date a source receipt chose is the one it pays; any other payment takes the open due date of its month.
 IF NEW.occurrence_due_on IS NULL AND NEW.occurrence_record_id=named THEN
  NEW.occurrence_due_on:=coalesce(NEW.earning_due_on,CASE WHEN NEW.kind='Salary' THEN NEW.income_due_on END);
 END IF;
 IF NEW.occurrence_due_on IS NULL THEN
  NEW.occurrence_due_on:=public.scheduled_payment_due(NEW,schedule);
  IF NEW.occurrence_due_on IS NULL THEN NEW.occurrence_record_id:=NULL; END IF;
 ELSIF NOT public.is_schedule_date(schedule.frequency,schedule.date,schedule.end_date,NEW.occurrence_due_on,schedule.recurrence_days) THEN
  RAISE EXCEPTION 'Choose a scheduled payment date.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.name_scheduled_payment() FROM PUBLIC,anon,authenticated;
-- A source due date set on an edit can name a schedule now, so both triggers watch those columns too.
DROP TRIGGER IF EXISTS y_name_scheduled_payment ON public.finance_records;
CREATE TRIGGER y_name_scheduled_payment BEFORE INSERT OR UPDATE OF occurrence_record_id,occurrence_due_on,custom_category_id,kind,date,earning_due_on,income_due_on ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.name_scheduled_payment();
DROP TRIGGER IF EXISTS settle_scheduled_payment ON public.finance_records;
CREATE TRIGGER settle_scheduled_payment AFTER INSERT OR UPDATE OF occurrence_record_id,occurrence_due_on,custom_category_id,kind,date,earning_due_on,income_due_on ON public.finance_records
 FOR EACH ROW WHEN (NEW.occurrence_record_id IS NOT NULL AND NEW.occurrence_due_on IS NOT NULL) EXECUTE FUNCTION public.settle_scheduled_payment();

-- The older sync triggers run after settle_scheduled_payment (trigger name order) and leave the row it wrote alone;
-- a restore writes its own occurrences (the guard of migration 062).
CREATE OR REPLACE FUNCTION public.sync_earning_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.income_sources;
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP<>'INSERT' AND OLD.earning_source_id IS NOT NULL THEN
  DELETE FROM public.payment_occurrences WHERE user_id=OLD.user_id AND transaction_id=OLD.id;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.earning_source_id IS NOT NULL AND NEW.earning_due_on IS NOT NULL THEN
  SELECT * INTO source FROM public.income_sources WHERE id=NEW.earning_source_id AND user_id=NEW.user_id;
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id) VALUES(gen_random_uuid(),NEW.user_id,source.schedule_id,NEW.earning_due_on,'paid',NEW.id)
   ON CONFLICT (user_id,record_id,due_on) DO NOTHING;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.sync_salary_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP<>'INSERT' AND OLD.kind='Salary' AND OLD.income_source_id IS NOT NULL THEN
  DELETE FROM public.payment_occurrences WHERE user_id=OLD.user_id AND transaction_id=OLD.id AND record_id=OLD.income_source_id;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.kind='Salary' AND NEW.income_source_id IS NOT NULL THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
  VALUES(gen_random_uuid(),NEW.user_id,NEW.income_source_id,NEW.income_due_on,'paid',NEW.id)
   ON CONFLICT (user_id,record_id,due_on) DO NOTHING;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_earning_receipt(),public.sync_salary_receipt() FROM PUBLIC,anon,authenticated;

-- Existing payments take the schedule and due date of the paid occurrence row that names them.
ALTER TABLE public.finance_records DISABLE TRIGGER USER;
UPDATE public.finance_records r SET occurrence_record_id=o.record_id,occurrence_due_on=o.due_on
 FROM (SELECT DISTINCT ON (user_id,transaction_id) user_id,transaction_id,record_id,due_on FROM public.payment_occurrences
       WHERE status='paid' AND transaction_id IS NOT NULL ORDER BY user_id,transaction_id,due_on) o
 WHERE o.user_id=r.user_id AND o.transaction_id=r.id AND r.occurrence_record_id IS NULL AND r.frequency='Once';
ALTER TABLE public.finance_records ENABLE TRIGGER USER;
UPDATE public.deleted_items d SET data=d.data||jsonb_build_object('occurrence_record_id',o.record_id,'occurrence_due_on',o.due_on)
 FROM (SELECT b.id,(b.occurrences->0)->>'record_id' AS record_id,(b.occurrences->0)->>'due_on' AS due_on FROM public.deleted_items b
       WHERE b.source='finance_records' AND jsonb_array_length(b.occurrences)>0 AND (b.occurrences->0)->>'status'='paid'
        AND coalesce(b.data->>'occurrence_record_id','')='' AND b.data->>'frequency'='Once') o
 WHERE d.id=o.id;

-- The capability version moves to 140, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',140,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
