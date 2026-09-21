BEGIN;
ALTER TABLE public.finance_records ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE public.record_edit_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 before_record jsonb,
 after_record jsonb
);
ALTER TABLE public.record_edit_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.record_edit_history FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.record_edit_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.record_edit_history TO authenticated;
CREATE INDEX record_edit_history_owner_record ON public.record_edit_history(user_id,record_id,changed_at DESC,id);
CREATE FUNCTION public.bump_record_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.revision:=OLD.revision+1; RETURN NEW; END $$;
CREATE TRIGGER z_record_revision BEFORE UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.bump_record_revision();
CREATE FUNCTION public.audit_record_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
 INSERT INTO public.record_edit_history(user_id,record_id,before_record,after_record)
 VALUES(OLD.user_id,OLD.id,to_jsonb(OLD),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(NEW) END);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER record_edit_audit AFTER UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.audit_record_edit();
-- The lock and version comparison occur in the same transaction as the write.
-- Ordinary internal balance updates also increment revision, invalidating stale forms.
CREATE FUNCTION public.save_finance_record(p_record jsonb,p_expected_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE existing public.finance_records; saved public.finance_records; payload jsonb; cols text; vals text; updates text; key text;
 allowed text[]:=ARRAY['id','name','kind','currency','amount','quantity','cost','rate','date','lent_date','frequency','notes','business_id','ownership_percentage','estimated_monthly_income','estimated_monthly_payment','expense_plan_id','end_date','account_id','custom_category_id','holding_account_id','deposit_compounding','opened_on','account_exchange_rate','account_rate_date','account_currency','income_source_id','income_due_on','earning_source_id','earning_due_on','payment_type','is_investment'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF jsonb_typeof(p_record)<>'object' OR p_record->>'id' IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 FOR key IN SELECT jsonb_object_keys(p_record) LOOP
  IF NOT key=ANY(allowed) THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 END LOOP;
 SELECT * INTO existing FROM public.finance_records WHERE id=(p_record->>'id')::uuid AND user_id=auth.uid() FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  -- Retrying an identical confirmed write is harmless, even after a lost response.
  IF to_jsonb(existing) @> p_record THEN RETURN jsonb_build_array(to_jsonb(existing)); END IF;
  IF p_expected_revision IS NULL OR existing.revision<>p_expected_revision THEN
   RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
  END IF;
 ELSIF p_expected_revision IS NOT NULL THEN
  RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
 END IF;
 payload:=p_record||jsonb_build_object('user_id',auth.uid());
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k),string_agg(format('%I=excluded.%I',k,k),',' ORDER BY k) FILTER(WHERE k NOT IN('id','user_id'))
 INTO cols,vals,updates FROM jsonb_object_keys(payload) k;
 EXECUTE format('INSERT INTO public.finance_records(%s) SELECT %s FROM jsonb_populate_record(NULL::public.finance_records,$1) r ON CONFLICT(id) DO UPDATE SET %s RETURNING *',cols,vals,updates) INTO saved USING payload;
 RETURN jsonb_build_array(to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.save_finance_record(jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_finance_record(jsonb,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
