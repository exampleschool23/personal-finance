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
-- The operation goes to Recently deleted as one entry: data is the clicked row, so
-- the list shows it like any transaction, and the new column
-- deleted_items.linked_operation holds every row removed (transactions, history,
-- cash links, mortgage payment, movement, account activity), the history rows the
-- reversal added, the replay tombstones it wrote and each balance's amount,
-- quantity and cost before and after. restore_deleted_item puts all of it back with
-- the same ids and re-applies the recorded balance changes, or changes nothing when
-- a balance would become invalid. permanently_delete_item only drops the entry; the
-- operation stays undone and its ids stay unusable.
-- The four guards let exactly the row this function is deleting through, named by
-- the transaction-local setting finance.linked_delete. Re-running this is a no-op.
BEGIN;

ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS linked_operation jsonb;

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
 -- A linked operation restores as a whole.
 definition:=pg_get_functiondef('public.restore_deleted_item(uuid)'::regprocedure);
 IF position('restore_linked_transaction' IN definition)=0 THEN
  -- Placed before the goal branch, so the text migration 124 added stays whole.
  anchor:=$a$ IF item.source='savings_goals' THEN$a$;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected definition of restore_deleted_item. Apply migrations in order.'; END IF;
  EXECUTE replace(definition,anchor,$b$ IF item.linked_operation IS NOT NULL THEN PERFORM public.restore_linked_transaction(item.id); RETURN; END IF;$b$||chr(10)||anchor);
 END IF;
END $patch$;

-- Removes the named rows of the open workspace past the guards. Their single-row
-- Recently deleted entries go too: the operation is archived as one entry.
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

-- Everything an operation can touch: balances of its records, their history, and the
-- rows that name the operation's ids. Comparing it before and after a delete gives
-- exactly what the delete removed, added and changed.
CREATE OR REPLACE FUNCTION public.linked_state(p_records uuid[],p_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'balances',(SELECT coalesce(jsonb_object_agg(r.id,jsonb_build_object('amount',r.amount,'quantity',r.quantity,'cost',r.cost)),'{}'::jsonb) FROM public.finance_records r WHERE r.user_id=public.active_owner() AND r.id=ANY(p_records)),
  'records',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.finance_records r WHERE r.user_id=public.active_owner()
   AND (r.id=ANY(p_ids) OR r.history_event_id=ANY(p_ids) OR r.mortgage_payment_id=ANY(p_ids) OR r.movement_id=ANY(p_ids) OR r.operation_id=ANY(p_ids))),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) FROM public.investment_history h WHERE h.user_id=public.active_owner() AND (h.record_id=ANY(p_records) OR h.id=ANY(p_ids))),
  'links',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.investment_account_links l WHERE l.user_id=public.active_owner() AND l.id=ANY(p_ids)),
  'mortgage_payments',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM public.mortgage_payments m WHERE m.user_id=public.active_owner() AND m.id=ANY(p_ids)),
  'asset_movements',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM public.asset_movements m WHERE m.user_id=public.active_owner() AND m.id=ANY(p_ids)),
  'account_activity',(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM public.account_activity o WHERE o.user_id=public.active_owner() AND o.id=ANY(p_ids)),
  'tombstones',(SELECT coalesce(jsonb_agg(d.id),'[]'::jsonb) FROM public.deleted_tracker_updates d WHERE d.user_id=public.active_owner() AND d.id=ANY(p_ids)))
$$;
REVOKE ALL ON FUNCTION public.linked_state(uuid[],uuid[]) FROM PUBLIC,anon,authenticated;

-- The rows of one list in a state that another state no longer has, by id.
CREATE OR REPLACE FUNCTION public.linked_missing(p_from jsonb,p_in jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(p_from) x
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_in) y WHERE coalesce(y->>'id',y#>>'{}')=coalesce(x->>'id',x#>>'{}'))
$$;
REVOKE ALL ON FUNCTION public.linked_missing(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.delete_linked_transaction(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); t public.finance_records; h public.investment_history; link public.investment_account_links;
 r public.finance_records; a public.finance_records; b public.finance_records; op public.account_activity; pay public.mortgage_payments;
 move public.asset_movements; units boolean; quantity numeric; cost numeric;
 ids uuid[]; touched uuid[]; before jsonb; after jsonb; splits jsonb; occurrences jsonb;
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
 ids:=array_remove(ARRAY[t.id,t.history_event_id,t.mortgage_payment_id,t.movement_id,t.operation_id],NULL);
 touched:=ARRAY(SELECT DISTINCT x FROM (
   SELECT record_id AS x FROM public.investment_history WHERE user_id=owner AND id=t.history_event_id
   UNION ALL SELECT account_id FROM public.investment_account_links WHERE user_id=owner AND id=ANY(ids)
   UNION ALL SELECT mortgage_id FROM public.mortgage_payments WHERE user_id=owner AND id=t.mortgage_payment_id
   UNION ALL SELECT unnest(ARRAY[account_id,target_id]) FROM public.account_activity WHERE user_id=owner AND id=ANY(ids)
   UNION ALL SELECT unnest(ARRAY[source_id,target_id]) FROM public.asset_movements WHERE user_id=owner AND id=t.movement_id) s WHERE x IS NOT NULL);
 before:=public.linked_state(touched,ids);
 SELECT coalesce(jsonb_agg(jsonb_build_object('category_id',coalesce(category_id::text,kind),'amount',amount) ORDER BY position),'[]'::jsonb) INTO splits
  FROM public.transaction_splits WHERE record_id=t.id AND user_id=owner;
 SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) INTO occurrences FROM public.payment_occurrences o WHERE o.transaction_id=t.id AND o.user_id=owner;
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
 after:=public.linked_state(touched,ids);
 INSERT INTO public.deleted_items(user_id,source,data,splits,occurrences,linked_operation)
 VALUES(owner,'finance_records',to_jsonb(t),splits,occurrences,jsonb_build_object(
  'records',public.linked_missing(before->'records',after->'records'),
  'history',public.linked_missing(before->'history',after->'history'),
  'links',public.linked_missing(before->'links',after->'links'),
  'mortgage_payments',public.linked_missing(before->'mortgage_payments',after->'mortgage_payments'),
  'asset_movements',public.linked_missing(before->'asset_movements',after->'asset_movements'),
  'account_activity',public.linked_missing(before->'account_activity',after->'account_activity'),
  'added_history',(SELECT coalesce(jsonb_agg(x->'id'),'[]'::jsonb) FROM jsonb_array_elements(public.linked_missing(after->'history',before->'history')) x),
  'tombstones',public.linked_missing(after->'tombstones',before->'tombstones'),
  'balances',(SELECT coalesce(jsonb_object_agg(key,jsonb_build_object('before',value,'after',after->'balances'->key)),'{}'::jsonb) FROM jsonb_each(before->'balances'))));
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_linked_transaction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_linked_transaction(uuid) TO authenticated;

-- Puts a deleted operation back exactly: the same rows with the same ids, and each
-- balance changed again by what the delete gave back. Nothing changes when a
-- balance or quantity would become invalid (the money was spent meanwhile).
CREATE OR REPLACE FUNCTION public.restore_linked_transaction(p_item uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); item public.deleted_items; snap jsonb; key text; change jsonb; r public.finance_records;
 targets jsonb:='{}'::jsonb; amount numeric; quantity numeric; cost numeric; previous_write text; previous_restore text;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO item FROM public.deleted_items WHERE id=p_item AND user_id=owner FOR UPDATE;
 IF item.id IS NULL OR item.linked_operation IS NULL THEN RETURN; END IF;
 snap:=item.linked_operation;
 PERFORM id FROM public.finance_records WHERE user_id=owner AND id IN(SELECT k::uuid FROM jsonb_object_keys(snap->'balances') k) ORDER BY id FOR UPDATE;
 FOR key,change IN SELECT * FROM jsonb_each(snap->'balances') LOOP
  SELECT * INTO r FROM public.finance_records WHERE id=key::uuid AND user_id=owner;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Record not found.'; END IF;
  amount:=r.amount+(change->'before'->>'amount')::numeric-(change->'after'->>'amount')::numeric;
  quantity:=r.quantity+(change->'before'->>'quantity')::numeric-(change->'after'->>'quantity')::numeric;
  -- A cost the delete set back returns to the trade's average unless it moved since.
  cost:=CASE WHEN r.cost=(change->'after'->>'cost')::numeric THEN (change->'before'->>'cost')::numeric ELSE r.cost END;
  IF amount<0 OR amount>1e15 OR quantity<0 OR quantity>1e15 THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.'; END IF;
  targets:=targets||jsonb_build_object(key,jsonb_build_object('amount',amount,'quantity',quantity,'cost',cost));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'records') x JOIN public.finance_records f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'mortgage_payments') x JOIN public.mortgage_payments f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'asset_movements') x JOIN public.asset_movements f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'account_activity') x JOIN public.account_activity f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'links') x JOIN public.investment_account_links f ON f.id=(x->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'history') x JOIN public.investment_history f ON f.id=(x->>'id')::uuid) THEN
  RAISE EXCEPTION 'This transaction already exists.';
 END IF;
 BEGIN
 DELETE FROM public.deleted_tracker_updates WHERE user_id=owner AND id IN(SELECT (x#>>'{}')::uuid FROM jsonb_array_elements(snap->'tombstones') x);
 DELETE FROM public.investment_history WHERE user_id=owner AND id IN(SELECT (x#>>'{}')::uuid FROM jsonb_array_elements(snap->'added_history') x);
 previous_write:=coalesce(current_setting('finance.history_write',true),'0');
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.history_write','1',true);
 PERFORM set_config('finance.restore_transaction','1',true);
 INSERT INTO public.mortgage_payments SELECT * FROM jsonb_populate_recordset(NULL::public.mortgage_payments,snap->'mortgage_payments');
 -- The payment trigger writes a fresh history entry; the saved one replaces it.
 DELETE FROM public.investment_history WHERE user_id=owner AND id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(snap->'history') x);
 INSERT INTO public.investment_history SELECT * FROM jsonb_populate_recordset(NULL::public.investment_history,snap->'history');
 INSERT INTO public.investment_account_links SELECT * FROM jsonb_populate_recordset(NULL::public.investment_account_links,snap->'links');
 INSERT INTO public.asset_movements SELECT * FROM jsonb_populate_recordset(NULL::public.asset_movements,snap->'asset_movements');
 INSERT INTO public.account_activity SELECT * FROM jsonb_populate_recordset(NULL::public.account_activity,snap->'account_activity');
 INSERT INTO public.finance_records SELECT (jsonb_populate_record(NULL::public.finance_records,public.normalize_finance_record_snapshot(x)||jsonb_build_object('user_id',owner))).*
  FROM jsonb_array_elements(snap->'records') x;
 -- Fee rows on an account moved it again as they went in; the recorded totals set every balance.
 FOR key,change IN SELECT * FROM jsonb_each(targets) LOOP
  UPDATE public.finance_records SET amount=(change->>'amount')::numeric,quantity=(change->>'quantity')::numeric,cost=(change->>'cost')::numeric WHERE id=key::uuid AND user_id=owner;
 END LOOP;
 PERFORM set_config('finance.history_write',previous_write,true);
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 IF jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;
 INSERT INTO public.payment_occurrences(id,user_id,record_id,due_on,status,transaction_id)
 SELECT o.id,o.user_id,o.record_id,o.due_on,o.status,o.transaction_id FROM jsonb_populate_recordset(NULL::public.payment_occurrences,item.occurrences) o
 WHERE o.user_id=owner AND EXISTS(SELECT 1 FROM public.finance_records f WHERE f.id=o.record_id AND f.user_id=owner)
  AND EXISTS(SELECT 1 FROM public.finance_records f WHERE f.id=o.transaction_id AND f.user_id=owner)
 ON CONFLICT DO NOTHING;
 DELETE FROM public.deleted_items WHERE id=item.id AND user_id=owner;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.';
 END;
END $$;
REVOKE ALL ON FUNCTION public.restore_linked_transaction(uuid) FROM PUBLIC,anon,authenticated;

-- The capability version moves to 126, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',126,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
