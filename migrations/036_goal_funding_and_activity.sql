-- Shared goal funding settings and an allocation audit trail. No cash moves.
BEGIN;
ALTER TABLE public.savings_goals ADD COLUMN funding_priority integer NOT NULL DEFAULT 100 CHECK(funding_priority BETWEEN 0 AND 10000),
 ADD COLUMN funding_monthly numeric CHECK(funding_monthly BETWEEN 0 AND 1e15),
 ADD COLUMN funding_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN paused_until date,
 ADD COLUMN completed_on date,
 ADD COLUMN funding_mode text NOT NULL DEFAULT 'one_time' CHECK(funding_mode IN ('one_time','refill'));
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_id_owner_unique UNIQUE(id,user_id);
CREATE TABLE public.goal_operations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.goal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL, operation_id uuid REFERENCES public.goal_operations(id),
 occurred_on date NOT NULL, delta numeric NOT NULL, balance numeric NOT NULL CHECK(balance>=0),
 event_type text NOT NULL CHECK(event_type IN ('opening','adjustment','contribution','withdrawal','transfer')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 source_id uuid REFERENCES public.finance_records(id) ON DELETE SET NULL,
 source_name text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(goal_id,user_id) REFERENCES public.savings_goals(id,user_id) ON DELETE CASCADE
);
CREATE INDEX goal_events_owner_date ON public.goal_events(user_id,occurred_on DESC,created_at DESC,id);
CREATE INDEX goal_operations_owner ON public.goal_operations(user_id);
ALTER TABLE public.goal_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.goal_operations FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY owner_read ON public.goal_events FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.goal_operations,public.goal_events TO authenticated;
INSERT INTO public.goal_events(user_id,goal_id,occurred_on,delta,balance,event_type,notes)
 SELECT user_id,id,(now() AT TIME ZONE 'Asia/Tashkent')::date,allocated,allocated,'opening','Opening allocation; earlier contribution dates are unknown.' FROM public.savings_goals WHERE kind='savings';
CREATE FUNCTION public.mark_goal_complete() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.kind='savings' AND NEW.allocated>=NEW.target THEN NEW.completed_on:=coalesce(NEW.completed_on,(now() AT TIME ZONE 'Asia/Tashkent')::date);
 ELSIF TG_OP='UPDATE' AND NEW.target>OLD.target THEN NEW.completed_on:=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mark_goal_complete BEFORE INSERT OR UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION public.mark_goal_complete();
UPDATE public.savings_goals SET completed_on=(now() AT TIME ZONE 'Asia/Tashkent')::date WHERE kind='savings' AND allocated>=target;
REVOKE ALL ON FUNCTION public.mark_goal_complete() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.audit_goal_allocation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE context jsonb:=coalesce(nullif(current_setting('finance.goal_event',true),''),'{}')::jsonb; difference numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.kind,NEW.account_id,NEW.currency) IS DISTINCT FROM (OLD.kind,OLD.account_id,OLD.currency)
  AND EXISTS(SELECT 1 FROM public.goal_events WHERE goal_id=OLD.id) THEN RAISE EXCEPTION 'Archive this goal and create another to change its account, currency or type.'; END IF;
 IF NEW.kind<>'savings' THEN RETURN NEW; END IF;
 difference:=NEW.allocated-CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.allocated END;
 IF TG_OP='INSERT' OR difference<>0 THEN
 INSERT INTO public.goal_events(user_id,goal_id,operation_id,occurred_on,delta,balance,event_type,notes,source_id,source_name)
 VALUES(NEW.user_id,NEW.id,(context->>'operation_id')::uuid,coalesce((context->>'date')::date,(now() AT TIME ZONE 'Asia/Tashkent')::date),difference,NEW.allocated,
 coalesce(context->>'type',CASE WHEN TG_OP='INSERT' THEN 'opening' ELSE 'adjustment' END),coalesce(context->>'notes',''),(context->>'source_id')::uuid,context->>'source_name');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_goal_allocation AFTER INSERT OR UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION public.audit_goal_allocation();
CREATE FUNCTION public.configure_goal_funding(p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 UPDATE public.savings_goals SET funding_priority=(p_data->>'priority')::integer,funding_monthly=(p_data->>'monthly')::numeric,
 funding_enabled=(p_data->>'enabled')::boolean,paused_until=(p_data->>'paused_until')::date,funding_mode=p_data->>'mode'
 WHERE id=(p_data->>'goal_id')::uuid AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found.'; END IF;
END $$;
CREATE FUNCTION public.record_goal_activity(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); g public.savings_goals; destination public.savings_goals; account public.finance_records; source public.finance_records;
 item uuid:=(p_data->>'id')::uuid; qty numeric:=(p_data->>'amount')::numeric; day date:=(p_data->>'date')::date; action text:=p_data->>'type';
 prior public.goal_operations; next_balance numeric; previous_context text;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL OR qty IS NULL OR qty<=0 OR qty>1e15 OR qty::text IN ('NaN','Infinity','-Infinity') OR action NOT IN ('contribution','withdrawal','transfer') OR action IS NULL OR day IS NULL OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(coalesce(p_data->>'notes',''))>2000 THEN RAISE EXCEPTION 'Check the goal activity.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.goal_operations WHERE id=item;
 IF FOUND THEN
 IF prior.user_id<>owner OR prior.payload<>p_data THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
 RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT * INTO g FROM public.savings_goals WHERE id=(p_data->>'goal_id')::uuid AND user_id=owner AND kind='savings' AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active savings goal.'; END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=g.account_id AND user_id=owner AND kind='Cash' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 IF p_data->>'source_id' IS NOT NULL THEN
 SELECT * INTO source FROM public.finance_records WHERE id=(p_data->>'source_id')::uuid AND user_id=owner AND account_id=g.account_id AND frequency='Once' AND currency=g.currency AND date<=day;
 IF NOT FOUND OR action<>'contribution' OR source.kind NOT IN ('Salary','Rent income','Other income') THEN RAISE EXCEPTION 'Choose an income transaction from the goal account.'; END IF;
 IF qty+(SELECT coalesce(sum(delta),0) FROM public.goal_events WHERE source_id=source.id AND user_id=owner)>source.amount THEN RAISE EXCEPTION 'This transaction is already allocated.'; END IF;
 END IF;
 IF action='transfer' THEN
 SELECT * INTO destination FROM public.savings_goals WHERE id=(p_data->>'target_id')::uuid AND user_id=owner AND kind='savings' AND NOT archived AND account_id=g.account_id AND id<>g.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose another savings goal in the same account.'; END IF;
 ELSIF p_data->>'target_id' IS NOT NULL THEN RAISE EXCEPTION 'Check the goal activity.'; END IF;
 next_balance:=g.allocated+CASE WHEN action='contribution' THEN qty ELSE -qty END;
 IF next_balance<0 OR next_balance>g.target OR (action='transfer' AND destination.allocated+qty>destination.target) THEN RAISE EXCEPTION 'The activity exceeds the goal balance or target.'; END IF;
 IF action='contribution' AND qty+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE account_id=g.account_id AND user_id=owner AND NOT archived)>account.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;
 INSERT INTO public.goal_operations(id,user_id,payload) VALUES(item,owner,p_data);
 previous_context:=coalesce(current_setting('finance.goal_event',true),'');
 PERFORM set_config('finance.goal_event',(p_data||jsonb_build_object('operation_id',item,'source_name',source.name))::text,true);
 UPDATE public.savings_goals SET allocated=next_balance WHERE id=g.id;
 IF action='transfer' THEN UPDATE public.savings_goals SET allocated=allocated+qty WHERE id=destination.id; END IF;
 PERFORM set_config('finance.goal_event',previous_context,true);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.audit_goal_allocation(),public.configure_goal_funding(jsonb),public.record_goal_activity(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_goal_funding(jsonb),public.record_goal_activity(jsonb) TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_goal_activity;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb:=public.export_finance_backup_before_goal_activity();
BEGIN
 result:=jsonb_set(result,'{tables,goal_events}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.goal_events r));
 result:=jsonb_set(result,'{tables,goal_operations}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.goal_operations r));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
