BEGIN;
CREATE TABLE public.corporate_events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE,
 record_id uuid NOT NULL, target_id uuid, kind text NOT NULL CHECK(kind IN ('dividend','split','security_transfer')),
 occurred_on date NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 FOREIGN KEY(user_id,record_id) REFERENCES public.finance_records(user_id,id) DEFERRABLE,
 FOREIGN KEY(user_id,target_id) REFERENCES public.finance_records(user_id,id) DEFERRABLE
);
ALTER TABLE public.corporate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.corporate_events FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.corporate_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.corporate_events TO authenticated;
CREATE TRIGGER serialize_owner_write BEFORE INSERT OR UPDATE OR DELETE ON public.corporate_events FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_finance_owner_write();
CREATE FUNCTION public.record_corporate_event(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=auth.uid(); a public.finance_records; b public.finance_records; prior public.corporate_events;
 item uuid:=(p_data->>'id')::uuid; aid uuid:=(p_data->>'record_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 action text:=p_data->>'kind'; day date:=(p_data->>'date')::date; memo text:=coalesce(p_data->>'notes','');
 gross numeric:=coalesce((p_data->>'gross')::numeric,0); tax numeric:=coalesce((p_data->>'withholding')::numeric,0);
 reinvest numeric:=coalesce((p_data->>'reinvest_amount')::numeric,0); quantity numeric:=coalesce((p_data->>'quantity')::numeric,0);
 numerator numeric:=coalesce((p_data->>'numerator')::numeric,0); denominator numeric:=coalesce((p_data->>'denominator')::numeric,0);
 next_quantity numeric; total_value numeric; history_setting text; result jsonb; tax_id uuid:=gen_random_uuid(); trade_id uuid:=gen_random_uuid(); last_day date;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL OR aid IS NULL OR action IS NULL OR action NOT IN ('dividend','split','security_transfer') OR day IS NULL OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000
 OR EXISTS(SELECT 1 FROM unnest(ARRAY[gross,tax,reinvest,quantity,numerator,denominator]) n WHERE n<0 OR n>1e15 OR n::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Check the investment event fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.corporate_events WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.payload<>p_data THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN prior.result;
 END IF;
 PERFORM id FROM public.finance_records WHERE id IN(aid,bid) AND user_id=owner ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind IN ('Stock','Crypto');
 IF a.id IS NULL OR a.revision IS DISTINCT FROM (p_data->>'revision')::bigint THEN RAISE EXCEPTION 'The holding changed. Reopen the event form.'; END IF;
 IF bid IS NOT NULL THEN
  SELECT * INTO b FROM public.finance_records WHERE id=bid AND user_id=owner;
  IF b.id IS NULL OR b.revision IS DISTINCT FROM (p_data->>'target_revision')::bigint THEN RAISE EXCEPTION 'The destination changed. Reopen the event form.'; END IF;
 END IF;
 SELECT max(occurred_on) INTO last_day FROM public.investment_history WHERE record_id IN(aid,bid) AND balance IS NOT NULL;
 IF day<last_day THEN RAISE EXCEPTION 'Choose a date on or after the latest balance update.'; END IF;
 result:=jsonb_build_object('ok',true,'id',item);
 IF action='dividend' THEN
  IF a.kind<>'Stock' OR b.kind IS DISTINCT FROM 'Cash' OR b.currency<>a.currency OR gross<=0 OR tax>gross OR reinvest>gross-tax OR (reinvest>0)<>(quantity>0) OR quantity>1e12 OR numerator<>0 OR denominator<>0 THEN RAISE EXCEPTION 'Check the dividend amounts and cash account.'; END IF;
  PERFORM public.record_investment_with_account(item,aid,'income',day,gross,NULL,memo,bid);
  IF tax>0 THEN PERFORM public.record_investment_with_account(tax_id,aid,'expense',day,tax,NULL,'Dividend withholding. '||left(memo,1950),bid); END IF;
  IF reinvest>0 THEN
   PERFORM public.record_asset_movement(jsonb_build_object('id',trade_id,'kind','buy','source_id',bid,'target_id',aid,'sent',reinvest,'received',quantity,'source_value',reinvest,'target_value',reinvest,'fee',0,'date',day,'notes','Dividend reinvestment. '||left(memo,1950)));
  END IF;
  result:=result||jsonb_build_object('gross',gross,'withholding',tax,'net',gross-tax,'residual_cash',gross-tax-reinvest,'tax_id',CASE WHEN tax>0 THEN tax_id END,'trade_id',CASE WHEN reinvest>0 THEN trade_id END);
 ELSE
  IF gross<>0 OR tax<>0 OR reinvest<>0 THEN RAISE EXCEPTION 'Check the investment event fields.'; END IF;
  history_setting:=coalesce(current_setting('finance.history_write',true),'0');PERFORM set_config('finance.history_write','1',true);
  IF action='split' THEN
   IF a.kind<>'Stock' OR bid IS NOT NULL OR numerator<=0 OR denominator<=0 OR a.quantity<=0 OR quantity<>0 THEN RAISE EXCEPTION 'Enter the new shares and old shares in the split ratio.'; END IF;
   next_quantity:=a.quantity*numerator/denominator;
   IF next_quantity<=0 OR next_quantity>1e12 OR a.amount*denominator/numerator>1e15 OR a.cost*denominator/numerator>1e15 THEN RAISE EXCEPTION 'Check the resulting share quantity.'; END IF;
   UPDATE public.finance_records SET quantity=next_quantity,amount=a.amount*denominator/numerator,cost=a.cost*denominator/numerator WHERE id=aid;
   INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,notes) VALUES(item,owner,aid,'valuation',day,0,a.quantity*a.amount,'Stock split. '||left(memo,1950));
   result:=result||jsonb_build_object('quantity',next_quantity,'total_cost',a.quantity*a.cost);
  ELSE
   IF b.id IS NULL OR aid=bid OR b.kind<>a.kind OR b.name<>a.name OR b.currency<>a.currency OR quantity<=0 OR quantity>a.quantity OR b.quantity+quantity>1e12 OR numerator<>0 OR denominator<>0 THEN RAISE EXCEPTION 'Transfer to the same security in another holding, using the same currency.'; END IF;
   total_value:=quantity*a.amount;
   UPDATE public.finance_records SET quantity=a.quantity-quantity WHERE id=aid;
   UPDATE public.finance_records SET quantity=b.quantity+quantity,cost=(b.quantity*b.cost+quantity*a.cost)/(b.quantity+quantity),amount=(b.quantity*b.amount+total_value)/(b.quantity+quantity) WHERE id=bid;
   INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,notes) VALUES(item,owner,aid,'withdrawal',day,total_value,(a.quantity-quantity)*a.amount,'Security transfer. '||left(memo,1950)),(trade_id,owner,bid,'contribution',day,total_value,b.quantity*b.amount+total_value,'Security transfer. '||left(memo,1950));
   result:=result||jsonb_build_object('quantity',quantity,'transferred_cost',quantity*a.cost);
  END IF;
  PERFORM set_config('finance.history_write',history_setting,true);
 END IF;
 INSERT INTO public.corporate_events VALUES(item,owner,aid,bid,action,day,p_data,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_corporate_event(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_corporate_event(jsonb) TO authenticated;
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders'));
-- Both new ledgers participate in the existing atomic owner-scoped recovery.
DO $$ DECLARE definition text; fn regprocedure; BEGIN
 definition:=pg_get_functiondef('public.finance_backup_tables()'::regprocedure);
 EXECUTE replace(definition,'''account_activity''','''account_reconciliations'',''corporate_events'',''account_activity''');
 -- Old verified backups legitimately predate the two new tables. Verify the
 -- unchanged signed payload first; treat only these absent tables as empty.
 FOREACH fn IN ARRAY ARRAY['public.preview_finance_restore(text)'::regprocedure,'public.register_verified_finance_backup(text,uuid)'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  definition:=replace(definition,'FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP','FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  IF tbl IN (''account_reconciliations'',''corporate_events'') AND backup->>''schema_version''=''59'' AND NOT (backup->''tables'' ? tbl) THEN CONTINUE; END IF;');
  definition:=replace(definition,'backup->>''schema_version''<>''59''','coalesce(backup->>''schema_version'','''') NOT IN (''59'',''67'')');
  definition:=replace(definition,'backup->>''schema_version'' IS DISTINCT FROM ''59''','coalesce(backup->>''schema_version'','''') NOT IN (''59'',''67'')');
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('public.export_finance_backup()'::regprocedure);
 EXECUTE replace(definition,'''schema_version'',59','''schema_version'',67');
 definition:=pg_get_functiondef('public.restore_finance_backup(text,text)'::regprocedure);
 EXECUTE replace(definition,'USING backup->''tables''->tbl','USING coalesce(backup->''tables''->tbl,''[]''::jsonb)');
END $$;
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',67,'record_revisions',true,'verified_restore',true)
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
