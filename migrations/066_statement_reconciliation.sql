BEGIN;
CREATE TABLE public.account_reconciliations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE,
 account_id uuid NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
 opening_balance numeric NOT NULL, closing_balance numeric NOT NULL,
 cleared text[] NOT NULL, fingerprint text NOT NULL, ledger jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','reconciled')), revision integer NOT NULL DEFAULT 1,
 FOREIGN KEY(user_id,account_id) REFERENCES public.finance_records(user_id,id) DEFERRABLE,
 CHECK(start_date<=end_date), CHECK(abs(opening_balance)<=1e15 AND abs(closing_balance)<=1e15),
 CHECK(opening_balance::text NOT IN ('NaN','Infinity','-Infinity') AND closing_balance::text NOT IN ('NaN','Infinity','-Infinity'))
);
ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.account_reconciliations FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.account_reconciliations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.account_reconciliations TO authenticated;
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.account_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
-- A single projection of account legs. Fee/receipt records representing an
-- operation are excluded when the operation already includes their cash effect.
CREATE FUNCTION public.account_statement_legs(p_account uuid,p_start date,p_end date)
RETURNS TABLE(key text,date date,name text,amount numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT 'record:'||r.id,r.date,r.name,CASE WHEN r.kind IN ('Salary','Rent income','Business income','Other income') THEN r.amount ELSE -r.amount END/coalesce(r.account_exchange_rate,1)
 FROM public.finance_records r WHERE r.user_id=auth.uid() AND r.account_id=p_account AND r.frequency='Once' AND r.date BETWEEN p_start AND p_end
 AND NOT EXISTS(SELECT 1 FROM public.account_activity a WHERE a.user_id=auth.uid() AND a.id IN(r.operation_id,r.mortgage_payment_id))
 AND NOT EXISTS(SELECT 1 FROM public.investment_account_links l WHERE l.user_id=auth.uid() AND l.id=r.history_event_id)
 UNION ALL
 SELECT 'activity:'||a.id||':out',a.occurred_on,a.action,a.after_balance-a.before_balance FROM public.account_activity a WHERE a.user_id=auth.uid() AND a.account_id=p_account AND a.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'activity:'||a.id||':in',a.occurred_on,a.action,a.received FROM public.account_activity a WHERE a.user_id=auth.uid() AND a.target_id=p_account AND a.action='transfer' AND a.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'movement:'||m.id||':out',m.occurred_on,m.kind,-m.sent FROM public.asset_movements m WHERE m.user_id=auth.uid() AND m.source_id=p_account AND m.kind<>'interest' AND m.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'movement:'||m.id||':in',m.occurred_on,m.kind,m.received FROM public.asset_movements m WHERE m.user_id=auth.uid() AND m.target_id=p_account AND m.occurred_on BETWEEN p_start AND p_end
 UNION ALL
 SELECT 'tracker:'||l.id,h.occurred_on,r.name,l.amount FROM public.investment_account_links l JOIN public.investment_history h ON h.id=l.id AND h.user_id=l.user_id JOIN public.finance_records r ON r.id=h.record_id AND r.user_id=h.user_id
 WHERE l.user_id=auth.uid() AND l.account_id=p_account AND h.occurred_on BETWEEN p_start AND p_end
$$;
-- Carry forward explicitly unchecked entries from earlier statement reviews.
-- An entry cleared in an earlier period is not offered again in later periods.
CREATE FUNCTION public.statement_review_legs(p_account uuid,p_start date,p_end date)
RETURNS TABLE(key text,date date,name text,amount numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT l.* FROM public.account_statement_legs(p_account,least(p_start,coalesce((SELECT min(start_date) FROM public.account_reconciliations WHERE user_id=auth.uid() AND account_id=p_account AND end_date<p_start),p_start)),p_end) l
 WHERE l.date>=p_start OR (
 EXISTS(SELECT 1 FROM public.account_reconciliations r CROSS JOIN LATERAL jsonb_array_elements(r.ledger) e WHERE r.user_id=auth.uid() AND r.account_id=p_account AND r.end_date<p_start AND e->>'key'=l.key AND NOT (l.key=ANY(r.cleared)))
 AND NOT EXISTS(SELECT 1 FROM public.account_reconciliations r WHERE r.user_id=auth.uid() AND r.account_id=p_account AND r.end_date<p_start AND l.key=ANY(r.cleared)));
$$;
REVOKE ALL ON FUNCTION public.statement_review_legs(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.statement_review_legs(uuid,date,date) TO authenticated;
CREATE FUNCTION public.account_statement(p_account uuid,p_start date,p_end date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE account public.finance_records; rows jsonb; hash text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end OR p_end>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Check the statement dates.'; END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=p_account AND user_id=auth.uid() AND kind='Cash';
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 IF (SELECT count(*) FROM public.statement_review_legs(p_account,p_start,p_end))>5000 THEN RAISE EXCEPTION 'Choose a shorter statement period.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.date,l.key),'[]') INTO rows FROM public.statement_review_legs(p_account,p_start,p_end) l;
 -- Conservative invalidation also catches manual account corrections that have
 -- no dated transaction leg. A new balance update requires review again.
 hash:=encode(sha256(convert_to(jsonb_build_array(account.id,account.currency,account.amount,account.revision,p_start,p_end,rows)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('entries',rows,'fingerprint',hash,'account',to_jsonb(account)-'user_id');
END $$;
CREATE FUNCTION public.save_account_reconciliation(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.account_reconciliations; prior public.account_reconciliations; state jsonb; total numeric; row_count integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 item:=jsonb_populate_record(NULL::public.account_reconciliations,p_data||jsonb_build_object('user_id',auth.uid()));
 SELECT * INTO prior FROM public.account_reconciliations WHERE id=item.id;
 IF FOUND AND prior.user_id<>auth.uid() THEN RAISE EXCEPTION 'Statement not found.'; END IF;
 IF prior.id IS NOT NULL AND prior.account_id<>item.account_id THEN RAISE EXCEPTION 'Statement account cannot change.'; END IF;
 IF prior.id IS NOT NULL AND to_jsonb(prior) @> (p_data-'revision') THEN RETURN to_jsonb(prior); END IF;
 IF prior.id IS NOT NULL AND prior.revision IS DISTINCT FROM item.revision THEN RAISE EXCEPTION 'This statement changed. Reload it before saving.'; END IF;
 state:=public.account_statement(item.account_id,item.start_date,item.end_date);
 IF item.fingerprint IS DISTINCT FROM state->>'fingerprint' THEN RAISE EXCEPTION 'Account activity changed. Reload the statement before saving.'; END IF;
 IF item.cleared IS NULL OR cardinality(item.cleared)>5000 OR cardinality(item.cleared)<>(SELECT count(DISTINCT k) FROM unnest(item.cleared) k) THEN RAISE EXCEPTION 'Check the cleared entries.'; END IF;
 SELECT count(*),coalesce(sum((e->>'amount')::numeric),0) INTO row_count,total FROM jsonb_array_elements(state->'entries') e WHERE e->>'key'=ANY(item.cleared);
 IF row_count<>cardinality(item.cleared) THEN RAISE EXCEPTION 'Check the cleared entries.'; END IF;
 IF item.status='reconciled' AND item.opening_balance+total<>item.closing_balance THEN RAISE EXCEPTION 'The cleared balance must match the statement.'; END IF;
 item.ledger:=state->'entries';item.revision:=coalesce(prior.revision,0)+1;
 INSERT INTO public.account_reconciliations SELECT item.* ON CONFLICT(id) DO UPDATE SET start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,opening_balance=EXCLUDED.opening_balance,closing_balance=EXCLUDED.closing_balance,cleared=EXCLUDED.cleared,fingerprint=EXCLUDED.fingerprint,ledger=EXCLUDED.ledger,status=EXCLUDED.status,revision=EXCLUDED.revision;
 RETURN to_jsonb(item)-'user_id';
END $$;
REVOKE ALL ON FUNCTION public.account_statement_legs(uuid,date,date),public.account_statement(uuid,date,date),public.save_account_reconciliation(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_statement_legs(uuid,date,date),public.account_statement(uuid,date,date),public.save_account_reconciliation(jsonb) TO authenticated;
CREATE FUNCTION public.reconciliation_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',a.id,'name',a.name,'end_date',r.end_date,'valid',CASE WHEN r.status='reconciled' THEN r.fingerprint=(public.account_statement(a.id,r.start_date,r.end_date)->>'fingerprint') ELSE false END) ORDER BY a.id),'[]')
 FROM public.finance_records a LEFT JOIN LATERAL(SELECT * FROM public.account_reconciliations r WHERE r.user_id=auth.uid() AND r.account_id=a.id ORDER BY r.end_date DESC,r.id LIMIT 1) r ON true
 WHERE a.user_id=auth.uid() AND a.kind='Cash';
$$;
REVOKE ALL ON FUNCTION public.reconciliation_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconciliation_status() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
