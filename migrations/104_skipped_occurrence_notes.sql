-- A scheduled payment that never came (or was never paid) is skipped with a
-- note saying why, typed in the Record scheduled payment dialog at amount 0.
-- The column stays nullable so backups taken before it restore unchanged.
BEGIN;
ALTER TABLE public.payment_occurrences ADD COLUMN IF NOT EXISTS notes text CHECK (notes IS NULL OR length(notes)<=2000);
DROP FUNCTION IF EXISTS public.set_schedule_exception(uuid,date,boolean);
DROP FUNCTION IF EXISTS public.set_schedule_exception(uuid,date,boolean,text);
CREATE FUNCTION public.set_schedule_exception(p_record uuid,p_day date,p_skip boolean,p_notes text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.payment_occurrences; memo text:=nullif(btrim(coalesce(p_notes,'')),'');
BEGIN
 IF public.active_owner() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_skip IS NULL THEN RAISE EXCEPTION 'Choose a schedule action.'; END IF;
 IF length(memo)>2000 THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(public.active_owner()::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=public.active_owner();
 IF NOT FOUND OR NOT public.is_schedule_date(r.frequency,r.date,r.end_date,p_day,r.recurrence_days) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
 SELECT * INTO existing FROM public.payment_occurrences WHERE user_id=public.active_owner() AND record_id=p_record AND due_on=p_day;
 IF existing.status='paid' THEN RAISE EXCEPTION 'A recorded payment cannot be skipped.'; END IF;
 IF p_skip THEN
  -- Skipping again keeps the first note unless a new one is given.
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,notes) VALUES(gen_random_uuid(),public.active_owner(),p_record,p_day,'dismissed',memo)
   ON CONFLICT(user_id,record_id,due_on) DO UPDATE SET notes=coalesce(EXCLUDED.notes,payment_occurrences.notes) WHERE payment_occurrences.status='dismissed';
 ELSE DELETE FROM public.payment_occurrences WHERE user_id=public.active_owner() AND record_id=p_record AND due_on=p_day AND status='dismissed';
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.set_schedule_exception(uuid,date,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_schedule_exception(uuid,date,boolean,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
