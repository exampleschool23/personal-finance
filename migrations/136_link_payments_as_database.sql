-- Linking a new bill's earlier payments works for signed-in people. Apply after 135.
-- link_schedule_payments (135) ran with the caller's rights, so it could not call the
-- due-date rule (scheduled_payment_due), which only the database's own functions may
-- use, and every call failed. It now runs as the database, as the other scheduled
-- payment functions do: it reads and writes only the active workspace's rows, and a
-- household member who may only view is refused first.
BEGIN;

CREATE OR REPLACE FUNCTION public.link_schedule_payments(p_schedule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); schedule public.finance_records; payment public.finance_records; due date;
 incomes text[]:=ARRAY['Salary','Rent income','Business income','Other income']; previous_restore text; linked integer:=0;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 SELECT * INTO schedule FROM public.finance_records WHERE id=p_schedule AND user_id=owner AND frequency<>'Once' AND NOT archived FOR UPDATE;
 IF NOT FOUND OR schedule.kind=ANY(incomes) THEN RAISE EXCEPTION 'Choose a scheduled payment.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 FOR payment IN SELECT * FROM public.finance_records r
  WHERE r.user_id=owner AND r.frequency='Once' AND r.kind=schedule.kind AND r.custom_category_id IS NOT DISTINCT FROM schedule.custom_category_id
   AND r.occurrence_record_id IS NULL AND r.earning_source_id IS NULL
   AND r.movement_id IS NULL AND r.operation_id IS NULL AND r.mortgage_payment_id IS NULL AND r.history_event_id IS NULL
   AND r.date>=schedule.date AND r.date<=(now() AT TIME ZONE 'Asia/Tashkent')::date
   AND NOT EXISTS(SELECT 1 FROM public.payment_occurrences o WHERE o.user_id=owner AND o.transaction_id=r.id)
  ORDER BY r.date,r.created_at,r.id LOOP
  due:=public.scheduled_payment_due(payment,schedule);
  CONTINUE WHEN due IS NULL OR EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=owner AND record_id=schedule.id AND due_on=due);
  -- A saved payment keeps its schedule (name_scheduled_payment); naming one for the first time here is allowed.
  PERFORM set_config('finance.restore_transaction','1',true);
  UPDATE public.finance_records SET occurrence_record_id=schedule.id,occurrence_due_on=due WHERE id=payment.id AND user_id=owner;
  PERFORM set_config('finance.restore_transaction',previous_restore,true);
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id) VALUES(payment.id,owner,schedule.id,due,'paid',payment.id);
  linked:=linked+1;
 END LOOP;
 RETURN linked;
END $$;
REVOKE ALL ON FUNCTION public.link_schedule_payments(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_schedule_payments(uuid) TO authenticated;

-- The capability version moves to 136, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',136,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
