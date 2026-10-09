-- Every transaction on the Transactions page can be deleted. Apply after 125.
-- A one-time income or expense written by another operation could not be deleted:
-- a tracker income or expense (history_event_id), a mortgage payment
-- (mortgage_payment_id), an asset movement's fee or interest (movement_id) and an
-- account operation's fee (operation_id). delete_linked_transaction(id) now undoes
-- the whole operation the row belongs to, in one transaction, from the amounts that
-- operation recorded (never today's exchange rate):
-- * tracker event: the linked cash account gives back what the event moved, and the
--   event, its cash link and the row go. The event id is kept in
--   deleted_tracker_updates, so the same update cannot be replayed.
-- * mortgage payment: the payment, its expense row and its history entry go; the
--   outstanding balance gets the principal back and the paying cash account gets
--   back what it paid (account operation or dated cash link). Its id cannot be
--   replayed either. The instalment shows as open again, because Recurring reads
--   paid instalments from mortgage payments.
-- * asset movement (transfer, buy, sell, capitalized interest): the movement with
--   its fee or interest rows and history entries goes; source and destination get
--   back their amounts and units, and a bought holding its earlier average cost.
-- * account operation fee (transfer or repayment): the operation, its fee and, for
--   a repayment in another currency, its dated cash link and history entry go;
--   both sides get back what the operation moved. The instalment opens again.
-- Nothing is undone when a balance or quantity would go below zero (for example
-- bought units that were sold since), and a holding with later purchases keeps its
-- trade until those are deleted. A balance whose history no longer ends at the
-- restored value gets today's corrected value, as delete_tracker_update does.
-- Deletion is permanent: these rows never reach Recently deleted.
-- The four guards let exactly the row this function is deleting through, named by
-- the transaction-local setting finance.linked_delete. Re-running this is a no-op.
BEGIN;

DO $patch$
DECLARE
 fn regprocedure;
 anchor text:=$a$IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;$a$;
 bypass text:=$b$ IF TG_OP='DELETE' AND OLD.id::text=current_setting('finance.linked_delete',true) THEN RETURN OLD; END IF;$b$;
 definition text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.guard_investment_history_record()'::regprocedure,'public.guard_mortgage_payment_record()'::regprocedure,
  'public.guard_movement_record()'::regprocedure,'public.guard_operation_record()'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  CONTINUE WHEN position('finance.linked_delete' IN definition)>0;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected definition of %. Apply migrations in order.',fn; END IF;
  EXECUTE replace(definition,anchor,anchor||chr(10)||bypass);
 END LOOP;
END $patch$;

-- Removes the named rows of the open workspace for good: past the guards, and out of
-- Recently deleted, because their operation is undone with them.
CREATE OR REPLACE FUNCTION public.delete_linked_rows(p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); item uuid;
BEGIN
 FOR item IN SELECT id FROM public.finance_records WHERE user_id=owner AND id=ANY(p_ids) ORDER BY id LOOP
  PERFORM set_config('finance.linked_delete',item::text,true);
  DELETE FROM public.finance_records WHERE id=item AND user_id=owner;
  DELETE FROM public.deleted_items WHERE user_id=owner AND source='finance_records' AND data->>'id'=item::text;
 END LOOP;
 PERFORM set_config('finance.linked_delete','',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_linked_rows(uuid[]) FROM PUBLIC,anon,authenticated;

-- Sets a balance back. History gets today's corrected value only when what remains
-- of it no longer ends at the restored balance.
CREATE OR REPLACE FUNCTION public.restore_linked_balance(p_record uuid,p_amount numeric,p_quantity numeric,p_cost numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); r public.finance_records; units boolean; latest numeric;
BEGIN
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
 units:=r.kind IN ('Stock','Crypto','Precious metals','Equity compensation');
 IF units AND p_quantity<0 THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.'; END IF;
 IF p_amount<0 OR p_amount>1e15 OR p_quantity<0 OR p_quantity>1e15 OR p_cost<0 OR p_cost>1e15 THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.'; END IF;
 SELECT balance INTO latest FROM public.investment_history WHERE record_id=r.id AND user_id=owner AND balance IS NOT NULL ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 1;
 PERFORM set_config('finance.history_write',CASE WHEN latest IS NOT DISTINCT FROM p_amount*CASE WHEN units THEN p_quantity ELSE 1 END THEN '1' ELSE '0' END,true);
 UPDATE public.finance_records SET amount=p_amount,quantity=p_quantity,cost=p_cost WHERE id=r.id AND user_id=owner;
 PERFORM set_config('finance.history_write','0',true);
END $$;
REVOKE ALL ON FUNCTION public.restore_linked_balance(uuid,numeric,numeric,numeric) FROM PUBLIC,anon,authenticated;

-- Undoes a dated cash link (record_investment_with_fx and its older account form):
-- the cash account gives back the recorded delta, the link goes, and so does the
-- mirrored cash entry a debt or mortgage payment wrote beside it.
CREATE OR REPLACE FUNCTION public.reverse_cash_link(p_link public.investment_account_links,p_event public.investment_history,p_record_currency text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); a public.finance_records;
BEGIN
 SELECT * INTO a FROM public.finance_records WHERE id=p_link.account_id AND user_id=owner AND kind='Cash';
 IF a.id IS NULL OR a.currency<>coalesce(p_link.account_currency,p_record_currency) THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
 IF a.amount-p_link.amount<0 OR a.amount-p_link.amount>1e15 THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.'; END IF;
 DELETE FROM public.investment_account_links WHERE id=p_link.id AND user_id=owner;
 IF EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_event.record_id AND kind IN ('Money lent','Loan','Debt','Mortgage')) THEN
 DELETE FROM public.investment_history WHERE id=(SELECT id FROM public.investment_history WHERE record_id=a.id AND user_id=owner
  AND event_type=CASE WHEN p_link.amount<0 THEN 'withdrawal' ELSE 'contribution' END AND occurred_on=p_event.occurred_on AND amount=abs(p_link.amount)
  AND notes=p_event.notes AND created_at>=p_event.created_at AND created_at<p_event.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1);
 END IF;
 PERFORM public.restore_linked_balance(a.id,a.amount-p_link.amount,a.quantity,a.cost);
END $$;
REVOKE ALL ON FUNCTION public.reverse_cash_link(public.investment_account_links,public.investment_history,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.delete_linked_transaction(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); t public.finance_records; h public.investment_history; link public.investment_account_links;
 r public.finance_records; a public.finance_records; b public.finance_records; op public.account_activity; pay public.mortgage_payments;
 move public.asset_movements; units boolean; quantity numeric; cost numeric;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO t FROM public.finance_records WHERE id=p_id AND user_id=owner FOR UPDATE;
 IF t.id IS NULL THEN
  -- A retry after a tracker event or payment was deleted.
  IF EXISTS(SELECT 1 FROM public.deleted_tracker_updates WHERE id=p_id AND user_id=owner) THEN RETURN jsonb_build_object('ok',true); END IF;
  RAISE EXCEPTION 'Record not found.';
 END IF;
 IF t.history_event_id IS NULL AND t.mortgage_payment_id IS NULL AND t.movement_id IS NULL AND t.operation_id IS NULL THEN
  RAISE EXCEPTION 'This transaction has no linked operation. Delete it normally.';
 END IF;
 BEGIN
 IF t.history_event_id IS NOT NULL THEN
  SELECT * INTO h FROM public.investment_history WHERE id=t.history_event_id AND user_id=owner FOR UPDATE;
  SELECT * INTO link FROM public.investment_account_links WHERE id=h.id AND user_id=owner;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(h.record_id,link.account_id) ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.finance_records WHERE id=h.record_id AND user_id=owner;
  IF h.id IS NULL OR r.id IS NULL OR h.event_type NOT IN ('income','expense') THEN RAISE EXCEPTION 'Record not found.'; END IF;
  PERFORM public.delete_linked_rows(ARRAY[t.id]);
  INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link) VALUES(h.id,owner,r.id,to_jsonb(h),CASE WHEN link.id IS NOT NULL THEN to_jsonb(link) END);
  IF link.id IS NOT NULL THEN PERFORM public.reverse_cash_link(link,h,r.currency); END IF;
  DELETE FROM public.investment_history WHERE id=h.id AND user_id=owner;
 ELSIF t.mortgage_payment_id IS NOT NULL THEN
  SELECT * INTO pay FROM public.mortgage_payments WHERE id=t.mortgage_payment_id AND user_id=owner FOR UPDATE;
  SELECT * INTO op FROM public.account_activity WHERE id=pay.id AND user_id=owner AND action='mortgage';
  SELECT * INTO link FROM public.investment_account_links WHERE id=pay.id AND user_id=owner;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(pay.mortgage_id,op.account_id,link.account_id) ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.finance_records WHERE id=pay.mortgage_id AND user_id=owner AND kind='Mortgage';
  IF pay.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Mortgage not found.'; END IF;
  SELECT * INTO h FROM public.investment_history WHERE id=pay.id AND user_id=owner AND record_id=r.id AND event_type='mortgage_payment';
  PERFORM public.delete_linked_rows(ARRAY(SELECT id FROM public.finance_records WHERE user_id=owner AND mortgage_payment_id=pay.id));
  INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link)
  VALUES(pay.id,owner,r.id,coalesce(to_jsonb(h),to_jsonb(pay)),CASE WHEN link.id IS NOT NULL THEN to_jsonb(link) END) ON CONFLICT(id) DO NOTHING;
  IF link.id IS NOT NULL THEN PERFORM public.reverse_cash_link(link,h,r.currency); END IF;
  IF op.id IS NOT NULL THEN
   SELECT * INTO a FROM public.finance_records WHERE id=op.account_id AND user_id=owner AND kind='Cash';
   IF a.id IS NULL OR a.currency<>r.currency THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
   DELETE FROM public.account_activity WHERE id=op.id AND user_id=owner;
   PERFORM public.restore_linked_balance(a.id,a.amount+op.amount+op.fee,a.quantity,a.cost);
  END IF;
  DELETE FROM public.investment_history WHERE id=h.id AND user_id=owner;
  DELETE FROM public.mortgage_payments WHERE id=pay.id AND user_id=owner;
  PERFORM public.restore_linked_balance(r.id,r.amount+pay.principal,r.quantity,r.cost);
 ELSIF t.movement_id IS NOT NULL THEN
  SELECT * INTO move FROM public.asset_movements WHERE id=t.movement_id AND user_id=owner FOR UPDATE;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(move.source_id,move.target_id) ORDER BY id FOR UPDATE;
  SELECT * INTO a FROM public.finance_records WHERE id=move.source_id AND user_id=owner;
  SELECT * INTO b FROM public.finance_records WHERE id=move.target_id AND user_id=owner;
  IF move.id IS NULL OR a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Record not found.'; END IF;
  units:=b.kind IN ('Stock','Crypto','Precious metals','Equity compensation');
  quantity:=CASE WHEN units THEN b.quantity-move.received ELSE b.quantity END;
  IF (units AND quantity<0) OR (NOT units AND b.amount-move.received<0) THEN
   RAISE EXCEPTION '%',CASE WHEN units THEN 'Insufficient balance or holding quantity.' ELSE 'The cash reversal would create an invalid balance.' END;
  END IF;
  cost:=b.cost;
  -- A purchase moved the holding's average cost; take that back. Later purchases
  -- averaged on top of it, so they go first.
  IF units AND EXISTS(SELECT 1 FROM public.asset_movements WHERE user_id=owner AND target_id=b.id AND id<>move.id AND (created_at,id)>(move.created_at,move.id)) THEN
   RAISE EXCEPTION 'Delete later trades of this holding first.';
  END IF;
  IF units AND move.target_before>0 THEN cost:=greatest((b.cost*move.target_after-move.target_value)/move.target_before,0); END IF;
  PERFORM public.delete_linked_rows(ARRAY(SELECT id FROM public.finance_records WHERE user_id=owner AND movement_id=move.id));
  DELETE FROM public.investment_history WHERE id IN(
   (SELECT id FROM public.investment_history WHERE move.kind<>'interest' AND record_id=a.id AND user_id=owner AND event_type='withdrawal' AND occurred_on=move.occurred_on
     AND amount=move.source_value AND notes=move.notes AND created_at>=move.created_at AND created_at<move.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1),
   (SELECT id FROM public.investment_history WHERE record_id=b.id AND user_id=owner AND event_type=CASE WHEN move.kind='interest' THEN 'income' ELSE 'contribution' END AND occurred_on=move.occurred_on
     AND amount=move.target_value AND notes=move.notes AND created_at>=move.created_at AND created_at<move.created_at+interval '1 minute' ORDER BY created_at,id LIMIT 1));
  DELETE FROM public.asset_movements WHERE id=move.id AND user_id=owner;
  PERFORM public.restore_linked_balance(b.id,CASE WHEN units THEN b.amount ELSE b.amount-move.received END,quantity,cost);
  IF move.kind<>'interest' THEN
   SELECT * INTO a FROM public.finance_records WHERE id=a.id;
   PERFORM public.restore_linked_balance(a.id,CASE WHEN a.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN a.amount ELSE a.amount+move.sent END,
    CASE WHEN a.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN a.quantity+move.sent ELSE a.quantity END,a.cost);
  END IF;
 ELSE
  SELECT * INTO op FROM public.account_activity WHERE id=t.operation_id AND user_id=owner FOR UPDATE;
  IF op.id IS NULL OR op.action NOT IN ('transfer','repayment') THEN RAISE EXCEPTION 'This operation cannot be deleted.'; END IF;
  SELECT * INTO link FROM public.investment_account_links WHERE id=op.id AND user_id=owner;
  SELECT * INTO h FROM public.investment_history WHERE id=op.id AND user_id=owner;
  PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(op.account_id,op.target_id) ORDER BY id FOR UPDATE;
  SELECT * INTO a FROM public.finance_records WHERE id=op.account_id AND user_id=owner AND kind='Cash';
  SELECT * INTO b FROM public.finance_records WHERE id=op.target_id AND user_id=owner;
  IF a.id IS NULL OR b.id IS NULL OR (op.action='transfer' AND b.kind<>'Cash') OR (op.action='repayment' AND b.kind NOT IN ('Money lent','Loan','Debt'))
   OR (link.id IS NOT NULL AND (h.id IS NULL OR h.record_id<>b.id OR link.account_id<>a.id)) THEN RAISE EXCEPTION 'This operation cannot be deleted.'; END IF;
  -- The fee rows go first; the account trigger gives their amount back to the account.
  PERFORM set_config('finance.history_write','1',true);
  PERFORM public.delete_linked_rows(ARRAY(SELECT id FROM public.finance_records WHERE user_id=owner AND operation_id=op.id));
  PERFORM set_config('finance.history_write','0',true);
  DELETE FROM public.account_activity WHERE id=op.id AND user_id=owner;
  SELECT * INTO a FROM public.finance_records WHERE id=a.id;
  IF link.id IS NOT NULL THEN
   -- A repayment in another currency: undo its dated cash link and debt history.
   INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link) VALUES(h.id,owner,b.id,to_jsonb(h),to_jsonb(link)) ON CONFLICT(id) DO NOTHING;
   PERFORM public.reverse_cash_link(link,h,b.currency);
   DELETE FROM public.investment_history WHERE id=h.id AND user_id=owner;
   PERFORM public.restore_linked_balance(b.id,b.amount+CASE WHEN h.event_type='withdrawal' THEN h.amount ELSE -h.amount END,b.quantity,b.cost);
  ELSIF op.action='transfer' THEN
   PERFORM public.restore_linked_balance(b.id,b.amount-op.received,b.quantity,b.cost);
   PERFORM public.restore_linked_balance(a.id,a.amount+op.amount,a.quantity,a.cost);
  ELSE
   PERFORM public.restore_linked_balance(b.id,b.amount+op.amount,b.quantity,b.cost);
   PERFORM public.restore_linked_balance(a.id,a.amount-CASE WHEN b.kind='Money lent' THEN op.amount ELSE -op.amount END,a.quantity,a.cost);
  END IF;
 END IF;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.';
 END;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_linked_transaction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_linked_transaction(uuid) TO authenticated;

-- The capability version moves to 126, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',126,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
