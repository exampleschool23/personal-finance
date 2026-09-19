-- Undo ordinary property/business tracker balance updates, retaining an audit receipt.
BEGIN;
CREATE TABLE public.deleted_tracker_updates (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL, event jsonb NOT NULL, account_link jsonb, deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deleted_tracker_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.deleted_tracker_updates FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.deleted_tracker_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.deleted_tracker_updates TO authenticated;
CREATE FUNCTION public.prevent_deleted_tracker_replay() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.deleted_tracker_updates WHERE id=NEW.id) THEN RAISE EXCEPTION 'This update was deleted. Start a new update.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_deleted_tracker_replay() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER prevent_deleted_tracker_replay BEFORE INSERT ON public.investment_history FOR EACH ROW EXECUTE FUNCTION public.prevent_deleted_tracker_replay();
CREATE FUNCTION public.delete_tracker_update(p_id uuid,p_record_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h public.investment_history; prior public.investment_history; r public.finance_records;
 link public.investment_account_links; a public.finance_records;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF EXISTS(SELECT 1 FROM public.deleted_tracker_updates WHERE id=p_id AND record_id=p_record_id AND user_id=auth.uid()) THEN RETURN jsonb_build_object('ok',true); END IF;
 SELECT * INTO link FROM public.investment_account_links WHERE id=p_id AND user_id=auth.uid();
 PERFORM id FROM public.finance_records WHERE user_id=auth.uid() AND id IN(p_record_id,link.account_id) ORDER BY id FOR UPDATE;
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid();
 SELECT * INTO h FROM public.investment_history WHERE id=p_id AND record_id=p_record_id AND user_id=auth.uid() FOR UPDATE;
 IF r.id IS NULL OR h.id IS NULL THEN RAISE EXCEPTION 'Tracker update not found.'; END IF;
 IF r.kind NOT IN ('Business','Property') OR h.event_type NOT IN ('valuation','contribution','withdrawal') THEN RAISE EXCEPTION 'This history entry cannot be deleted here.'; END IF;
 IF EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL AND (occurred_on,created_at,id)>(h.occurred_on,h.created_at,h.id)) THEN RAISE EXCEPTION 'Delete newer balance updates first.'; END IF;
 SELECT * INTO prior FROM public.investment_history WHERE record_id=r.id AND user_id=auth.uid() AND balance IS NOT NULL AND (occurred_on,created_at,id)<(h.occurred_on,h.created_at,h.id) ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 1;
 IF prior.id IS NULL THEN RAISE EXCEPTION 'Keep the starting snapshot.'; END IF;
 IF link.id IS NOT NULL THEN
  SELECT * INTO a FROM public.finance_records WHERE id=link.account_id AND user_id=auth.uid() AND kind='Cash';
  IF a.id IS NULL OR a.currency<>coalesce(link.account_currency,r.currency) THEN RAISE EXCEPTION 'Linked cash account is unavailable or its currency changed.'; END IF;
  IF a.amount-link.amount<0 OR a.amount-link.amount>1e15 THEN RAISE EXCEPTION 'The cash reversal would create an invalid balance.'; END IF;
 END IF;
 INSERT INTO public.deleted_tracker_updates(id,user_id,record_id,event,account_link) VALUES(h.id,auth.uid(),r.id,to_jsonb(h),CASE WHEN link.id IS NOT NULL THEN to_jsonb(link) END);
 DELETE FROM public.investment_account_links WHERE id=h.id AND user_id=auth.uid();
 DELETE FROM public.investment_history WHERE id=h.id AND user_id=auth.uid();
 PERFORM set_config('finance.history_write','1',true);
 UPDATE public.finance_records SET amount=prior.balance,ownership_percentage=CASE WHEN kind='Business' THEN prior.ownership_percentage ELSE ownership_percentage END WHERE id=r.id AND user_id=auth.uid();
 PERFORM set_config('finance.history_write','0',true);
 -- Use the original cash delta, never today's exchange rate. The ordinary trigger
 -- records today's corrected cash balance; previous cash observations remain intact.
 IF link.id IS NOT NULL THEN UPDATE public.finance_records SET amount=amount-link.amount WHERE id=a.id AND user_id=auth.uid(); END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_tracker_update(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_tracker_update(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
