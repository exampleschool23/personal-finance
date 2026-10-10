-- A spending category and its recurring bill are one item with one history. Apply after 136.
-- Budget counted a payment by its category while Recurring counted it only when it
-- named the bill, so "Dildora Wife" could read $252 spent on Budget and unpaid on
-- Recurring. Now, for a custom spending category:
-- * it has at most one active recurring bill (archive one to start another);
-- * every payment in it settles that bill, whatever its spending kind: one that names
--   no schedule takes the bill's id (as business and rent income already take theirs,
--   migration 120), and the database picks the due date as before; a payment edited or
--   recategorised into the category takes the bill the same way, and settles it;
-- * when the bill is saved, restored from the archive or moved to the category, the payments
--   already made in the category from its start date settle it too: the first of a
--   due date settles it and the others add to it, as later payments do. This happens
--   in the same transaction as the save, so a bill is never saved without its history.
-- Built-in kinds (Living expense, Charity, ...) are too broad to be one bill and keep
-- naming a schedule by hand. Replaces link_schedule_payments (135, 136), which the app
-- called after the save and which matched the spending kind as well as the category.
BEGIN;

-- Two active bills in one category would split its history; name them so one can be archived.
DO $$ DECLARE clash text; BEGIN
 SELECT string_agg(DISTINCT r.name,', ') INTO clash FROM public.finance_records r
  WHERE r.frequency<>'Once' AND NOT r.archived AND r.custom_category_id IS NOT NULL AND r.kind IN ('Rent expense','Living expense','Charity','Other expense')
  AND EXISTS(SELECT 1 FROM public.finance_records o WHERE o.user_id=r.user_id AND o.id<>r.id AND o.custom_category_id=r.custom_category_id
   AND o.frequency<>'Once' AND NOT o.archived AND o.kind IN ('Rent expense','Living expense','Charity','Other expense'));
 IF clash IS NOT NULL THEN RAISE EXCEPTION 'These recurring bills share a category: %. Archive or delete the extra ones, then apply this migration again.',clash; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS finance_records_one_bill_per_category ON public.finance_records(user_id,custom_category_id)
 WHERE frequency<>'Once' AND NOT archived AND custom_category_id IS NOT NULL AND kind IN ('Rent expense','Living expense','Charity','Other expense');

-- The one active bill of a payment's custom spending category, or null.
CREATE OR REPLACE FUNCTION public.category_bill_of(payment public.finance_records) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT bill.id FROM public.finance_records bill
 WHERE payment.custom_category_id IS NOT NULL AND payment.kind IN ('Rent expense','Living expense','Charity','Other expense')
  AND payment.earning_source_id IS NULL AND payment.movement_id IS NULL AND payment.operation_id IS NULL
  AND payment.mortgage_payment_id IS NULL AND payment.history_event_id IS NULL
  AND bill.user_id=payment.user_id AND bill.custom_category_id=payment.custom_category_id AND bill.frequency<>'Once'
  AND NOT bill.archived AND NOT bill.source_paused AND bill.kind IN ('Rent expense','Living expense','Charity','Other expense')
$$;
REVOKE ALL ON FUNCTION public.category_bill_of(public.finance_records) FROM PUBLIC,anon,authenticated;

-- As in 120, with a spending payment taking its category's bill.
CREATE OR REPLACE FUNCTION public.name_scheduled_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule public.finance_records; incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income'];
BEGIN
 -- Rows written by a verified restore or an undo keep exactly what they were saved with.
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.occurrence_record_id,NEW.occurrence_due_on) IS DISTINCT FROM (OLD.occurrence_record_id,OLD.occurrence_due_on) THEN RAISE EXCEPTION 'A scheduled payment keeps its schedule.'; END IF;
  -- A payment that named no schedule and now moves into a bill's category (an edit, a bulk recategorisation) takes the bill.
  IF NEW.occurrence_record_id IS NOT NULL OR NEW.frequency<>'Once' OR NEW.date IS NULL
   OR (NEW.custom_category_id,NEW.kind,NEW.date) IS NOT DISTINCT FROM (OLD.custom_category_id,OLD.kind,OLD.date) THEN RETURN NEW; END IF;
 ELSIF NEW.frequency<>'Once' OR NEW.date IS NULL THEN
  IF NEW.occurrence_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
  RETURN NEW;
 END IF;
 -- The owner's lock, shared with link_category_bill and the category moves, so a payment and its bill saved at the same instant still meet.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 NEW.occurrence_record_id:=coalesce(NEW.occurrence_record_id,public.income_schedule_of(NEW),public.category_bill_of(NEW));
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
-- A change of category, kind or date can name a schedule now, so the trigger watches those columns too.
DROP TRIGGER IF EXISTS y_name_scheduled_payment ON public.finance_records;
CREATE TRIGGER y_name_scheduled_payment BEFORE INSERT OR UPDATE OF occurrence_record_id,occurrence_due_on,custom_category_id,kind,date ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.name_scheduled_payment();

-- As in 120, and also after an edit that named a schedule for the first time. A row that already named
-- one was settled when it did; a restore or an undo writes its own occurrences.
CREATE OR REPLACE FUNCTION public.settle_scheduled_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.occurrence_record_id IS NOT NULL THEN RETURN NULL; END IF;
 IF NOT public.finance_restore_active() AND coalesce(current_setting('finance.restore_transaction',true),'0')<>'1' THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
  VALUES(NEW.id,NEW.user_id,NEW.occurrence_record_id,NEW.occurrence_due_on,'paid',NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.settle_scheduled_payment() FROM PUBLIC,anon,authenticated;
-- The columns an edit sets; name_scheduled_payment fills the occurrence columns before this fires.
DROP TRIGGER IF EXISTS settle_scheduled_payment ON public.finance_records;
CREATE TRIGGER settle_scheduled_payment AFTER INSERT OR UPDATE OF occurrence_record_id,occurrence_due_on,custom_category_id,kind,date ON public.finance_records
 FOR EACH ROW WHEN (NEW.occurrence_record_id IS NOT NULL AND NEW.occurrence_due_on IS NOT NULL) EXECUTE FUNCTION public.settle_scheduled_payment();

-- The payments already made in a bill's category, from its start date up to today, settle it, oldest first.
CREATE OR REPLACE FUNCTION public.link_category_bill(p_bill uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bill public.finance_records; payment public.finance_records; due date; previous_restore text; linked integer:=0;
BEGIN
 SELECT * INTO bill FROM public.finance_records WHERE id=p_bill AND frequency<>'Once' AND NOT archived AND NOT source_paused
  AND custom_category_id IS NOT NULL AND kind IN ('Rent expense','Living expense','Charity','Other expense');
 IF NOT FOUND THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(bill.user_id::text,0));
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 FOR payment IN SELECT * FROM public.finance_records r
  WHERE r.user_id=bill.user_id AND r.frequency='Once' AND r.custom_category_id=bill.custom_category_id AND r.occurrence_record_id IS NULL
   AND public.category_bill_of(r)=bill.id
   AND r.date>=bill.date AND r.date<=(now() AT TIME ZONE 'Asia/Tashkent')::date
   AND NOT EXISTS(SELECT 1 FROM public.payment_occurrences o WHERE o.user_id=bill.user_id AND o.transaction_id=r.id)
  ORDER BY r.date,r.created_at,r.id LOOP
  due:=public.scheduled_payment_due(payment,bill);
  CONTINUE WHEN due IS NULL;
  -- A saved payment keeps its schedule (name_scheduled_payment); naming one for the first time here is allowed.
  PERFORM set_config('finance.restore_transaction','1',true);
  UPDATE public.finance_records SET occurrence_record_id=bill.id,occurrence_due_on=due WHERE id=payment.id AND user_id=bill.user_id;
  PERFORM set_config('finance.restore_transaction',previous_restore,true);
  -- The first payment of a due date settles it; later ones add to it (laterPayments).
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
   VALUES(payment.id,bill.user_id,bill.id,due,'paid',payment.id) ON CONFLICT (user_id,record_id,due_on) DO NOTHING;
  linked:=linked+1;
 END LOOP;
 RETURN linked;
END $$;
REVOKE ALL ON FUNCTION public.link_category_bill(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.link_saved_category_bill() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NULL; END IF;
 PERFORM public.link_category_bill(NEW.id);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.link_saved_category_bill() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS link_saved_category_bill ON public.finance_records;
CREATE TRIGGER link_saved_category_bill AFTER INSERT OR UPDATE OF date,custom_category_id,kind,frequency,archived,source_paused ON public.finance_records
 FOR EACH ROW WHEN (NEW.frequency<>'Once' AND NEW.custom_category_id IS NOT NULL) EXECUTE FUNCTION public.link_saved_category_bill();

DROP FUNCTION IF EXISTS public.link_schedule_payments(uuid);

-- Bills saved before this take their category's history once.
DO $$ DECLARE bill uuid; BEGIN
 FOR bill IN SELECT id FROM public.finance_records WHERE frequency<>'Once' AND NOT archived AND custom_category_id IS NOT NULL
  AND kind IN ('Rent expense','Living expense','Charity','Other expense') LOOP
  PERFORM public.link_category_bill(bill);
 END LOOP;
END $$;

-- The capability version moves to 137, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',137,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
