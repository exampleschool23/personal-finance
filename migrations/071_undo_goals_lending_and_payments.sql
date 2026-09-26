-- Let owners undo three things that were previously permanent:
--  1. Savings goals move to Recently deleted with their activity and can be restored.
--  2. The newest tracker addition/repayment on a Loan, Debt or Money lent record can
--     be deleted, reversing its linked cash. Once only the starting snapshot remains,
--     the record itself can be deleted as before.
--  3. Deleting a transaction created by "Record payment" reopens its scheduled
--     reminder; restoring the transaction marks the reminder paid again.
-- Apply after 070. No existing rows are rewritten.
BEGIN;

ALTER TABLE public.deleted_items DROP CONSTRAINT IF EXISTS deleted_items_source_check;
ALTER TABLE public.deleted_items ADD CONSTRAINT deleted_items_source_check CHECK(source IN ('finance_records','expense_plans','savings_goals'));
ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS goal_events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(goal_events)='array');
ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS occurrences jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(occurrences)='array');

-- 1. Goals ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_savings_goal(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.savings_goals;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO g FROM public.savings_goals WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 -- Retries after a successful delete are harmless.
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
 INSERT INTO public.deleted_items(user_id,source,data,goal_events)
 VALUES(auth.uid(),'savings_goals',to_jsonb(g),
  (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_on,e.created_at,e.id),'[]'::jsonb) FROM public.goal_events e WHERE e.goal_id=g.id AND e.user_id=g.user_id));
 DELETE FROM public.savings_goals WHERE id=g.id AND user_id=auth.uid();
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_savings_goal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_savings_goal(uuid) TO authenticated;

-- 3. Scheduled payments ------------------------------------------------------
-- Runs after archive_deleted_record (trigger names fire alphabetically), so the
-- archive row already exists. Removing the occurrence reopens the reminder and
-- lets the transaction itself be deleted.
CREATE OR REPLACE FUNCTION public.archive_payment_occurrences() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN OLD; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payment_occurrences WHERE transaction_id=OLD.id AND user_id=OLD.user_id) THEN RETURN OLD; END IF;
 UPDATE public.deleted_items SET occurrences=(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM public.payment_occurrences o WHERE o.transaction_id=OLD.id AND o.user_id=OLD.user_id)
 WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=OLD.user_id AND source='finance_records' AND data->>'id'=OLD.id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 DELETE FROM public.payment_occurrences WHERE transaction_id=OLD.id AND user_id=OLD.user_id;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS archive_payment_occurrences ON public.finance_records;
CREATE TRIGGER archive_payment_occurrences BEFORE DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.archive_payment_occurrences();
REVOKE ALL ON FUNCTION public.archive_payment_occurrences() FROM PUBLIC,anon,authenticated;

-- Restore wrapper: goals are restored here; records keep the existing path and
-- then relink their scheduled occurrences when the schedule still exists.
CREATE OR REPLACE FUNCTION public.restore_deleted_item(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.deleted_items; previous_restore text; g public.savings_goals;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO item FROM public.deleted_items WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF item.source='savings_goals' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  g:=jsonb_populate_record(NULL::public.savings_goals,item.data);
  IF g.user_id<>auth.uid() THEN RAISE EXCEPTION 'Goal not found.'; END IF;
  IF EXISTS(SELECT 1 FROM public.savings_goals WHERE id=g.id) THEN RAISE EXCEPTION 'This goal already exists.'; END IF;
  IF g.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=g.account_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Restore the goal''s account first.'; END IF;
  INSERT INTO public.savings_goals SELECT (g).*;
  -- The allocation audit trigger adds a fresh opening row; keep the original history instead.
  DELETE FROM public.goal_events WHERE goal_id=g.id AND user_id=auth.uid();
  INSERT INTO public.goal_events(id,user_id,goal_id,operation_id,occurred_on,delta,balance,event_type,notes,source_id,source_name,created_at)
  SELECT e.id,e.user_id,e.goal_id,CASE WHEN EXISTS(SELECT 1 FROM public.goal_operations o WHERE o.id=e.operation_id) THEN e.operation_id END,
   e.occurred_on,e.delta,e.balance,e.event_type,e.notes,
   CASE WHEN EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=e.source_id) THEN e.source_id END,e.source_name,e.created_at
  FROM jsonb_populate_recordset(NULL::public.goal_events,item.goal_events) e WHERE e.user_id=auth.uid();
  DELETE FROM public.deleted_items WHERE id=item.id AND user_id=auth.uid();
  RETURN;
 END IF;
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.restore_transaction','1',true);
 PERFORM public.restore_deleted_item_before_transaction_tools(p_id);
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 IF item.source='finance_records' AND jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;
 -- A due date recorded or skipped again meanwhile keeps its newer state.
 IF item.source='finance_records' AND jsonb_array_length(item.occurrences)>0 THEN
  INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
  SELECT o.id,o.user_id,o.record_id,o.due_on,o.status,o.transaction_id
  FROM jsonb_populate_recordset(NULL::public.payment_occurrences,item.occurrences) o
  WHERE o.user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=o.record_id AND r.user_id=auth.uid())
   AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=o.transaction_id AND r.user_id=auth.uid())
  ON CONFLICT DO NOTHING;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.restore_deleted_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid) TO authenticated;

-- 2. Lending tracker updates -------------------------------------------------
CREATE FUNCTION pg_temp.patch_undo(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn);
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
SELECT pg_temp.patch_undo('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$ IF r.kind NOT IN ('Business','Property','Valuables') OR h.event_type NOT IN ('valuation','contribution','withdrawal') THEN RAISE EXCEPTION 'This history entry cannot be deleted here.'; END IF;$old$,
 $new$ IF NOT ((r.kind IN ('Business','Property','Valuables') AND h.event_type IN ('valuation','contribution','withdrawal'))
  OR (r.kind IN ('Money lent','Loan','Debt') AND h.event_type IN ('contribution','withdrawal'))) THEN RAISE EXCEPTION 'This history entry cannot be deleted here.'; END IF;
 -- Account repayments also write activity and interest records; they are undone from Accounts.
 IF EXISTS(SELECT 1 FROM public.account_activity WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'This repayment was recorded from Accounts and cannot be deleted here.'; END IF;$new$);
SELECT pg_temp.patch_undo('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$ IF link.id IS NOT NULL THEN UPDATE public.finance_records SET amount=amount-link.amount WHERE id=a.id AND user_id=auth.uid(); END IF;$old$,
 $new$ IF link.id IS NOT NULL THEN UPDATE public.finance_records SET amount=amount-link.amount WHERE id=a.id AND user_id=auth.uid(); END IF;
 -- Lending cash updates also wrote a mirrored cash-account entry in the same transaction.
 IF link.id IS NOT NULL AND r.kind IN ('Money lent','Loan','Debt') THEN
  DELETE FROM public.investment_history WHERE id=(SELECT id FROM public.investment_history WHERE record_id=a.id AND user_id=auth.uid()
   AND event_type=CASE WHEN link.amount<0 THEN 'withdrawal' ELSE 'contribution' END AND occurred_on=h.occurred_on AND amount=abs(link.amount)
   AND notes=h.notes AND created_at>=h.created_at AND created_at<h.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1);
 END IF;$new$);

NOTIFY pgrst,'reload schema';
COMMIT;
