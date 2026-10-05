-- Delete on Recurring. Apply after 112.
-- A repeating income or bill, or a spending plan, moves to Recently deleted
-- even when payments were recorded against it. The person chooses what
-- happens to those payments:
--  keep:   they stay as ordinary transactions and keep their account balances;
--          restoring the schedule links its recorded occurrences again.
--  remove: they move to Recently deleted too, and their cash is reversed as
--          for any deleted transaction.
-- Skipped occurrences go with the schedule. No other rows are rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_schedule(p_source text,p_id uuid,p_remove_history boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=public.active_owner(); r public.finance_records; links jsonb; tx uuid;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_id IS NULL OR p_remove_history IS NULL OR p_source NOT IN ('record','plan') THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 IF p_source='plan' THEN
  -- Retries after a successful delete are harmless.
  IF NOT EXISTS(SELECT 1 FROM public.expense_plans WHERE id=p_id AND user_id=owner) THEN RETURN jsonb_build_object('ok',true); END IF;
  IF p_remove_history THEN
   FOR tx IN SELECT id FROM public.finance_records WHERE expense_plan_id=p_id AND user_id=owner ORDER BY date DESC,id LOOP
    DELETE FROM public.finance_records WHERE id=tx AND user_id=owner;
   END LOOP;
  ELSE
   UPDATE public.finance_records SET expense_plan_id=NULL WHERE expense_plan_id=p_id AND user_id=owner;
  END IF;
  DELETE FROM public.expense_plans WHERE id=p_id AND user_id=owner;
  RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=p_id AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
 IF r.frequency='Once' OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN
  RAISE EXCEPTION 'Only repeating income and expenses are deleted here.';
 END IF;
 IF p_remove_history THEN
  -- Later payments first, then each recorded occurrence's transaction; deleting a transaction reverses its cash.
  FOR tx IN SELECT id FROM public.finance_records WHERE occurrence_record_id=p_id AND user_id=owner
   UNION SELECT transaction_id FROM public.payment_occurrences WHERE record_id=p_id AND user_id=owner AND transaction_id IS NOT NULL LOOP
   DELETE FROM public.finance_records WHERE id=tx AND user_id=owner;
  END LOOP;
 END IF;
 links:=(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM public.payment_occurrences o WHERE o.record_id=p_id AND o.user_id=owner AND o.status='paid' AND o.transaction_id IS NOT NULL);
 DELETE FROM public.payment_occurrences WHERE record_id=p_id AND user_id=owner;
 DELETE FROM public.finance_records WHERE id=p_id AND user_id=owner;
 IF jsonb_array_length(links)>0 THEN
  UPDATE public.deleted_items SET occurrences=links
  WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=owner AND source='finance_records' AND data->>'id'=p_id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_schedule(text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_schedule(text,uuid,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
