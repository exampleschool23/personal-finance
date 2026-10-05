-- More than one payment for a scheduled income or bill. Apply after 111.
-- The first payment settles the occurrence as before. Each later payment is
-- its own transaction that names the occurrence it adds to
-- (occurrence_record_id, occurrence_due_on); together they make what was
-- received or paid that time. No rows are rewritten.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS occurrence_record_id uuid;
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS occurrence_due_on date;
CREATE INDEX IF NOT EXISTS finance_records_occurrence_idx ON public.finance_records(user_id,occurrence_record_id,occurrence_due_on) WHERE occurrence_record_id IS NOT NULL;

-- Another payment for an occurrence that is already recorded. Retrying the same payment is a no-op.
CREATE OR REPLACE FUNCTION public.record_occurrence_extra(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=public.active_owner(); r public.finance_records; prior public.finance_records;
 item uuid:=(p_data->>'id')::uuid; aid uuid:=(p_data->>'account_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 amount numeric:=(p_data->>'amount')::numeric; day date:=(p_data->>'date')::date; paid date:=coalesce((p_data->>'paid_on')::date,(p_data->>'date')::date);
 memo text:=coalesce(p_data->>'notes','');
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL THEN RAISE EXCEPTION 'An identifier is required.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.finance_records WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.occurrence_record_id IS DISTINCT FROM bid OR prior.occurrence_due_on IS DISTINCT FROM day OR prior.amount<>amount THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF day IS NULL OR paid IS NULL OR paid>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the payment date.'; END IF;
 IF amount IS NULL OR amount<=0 OR amount>1e15 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=bid AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Record not found.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=owner AND record_id=bid AND due_on=day AND status='paid') THEN RAISE EXCEPTION 'Record the scheduled payment first.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash') THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id,account_exchange_rate,account_rate_date,account_currency,occurrence_record_id,occurrence_due_on)
 VALUES(item,owner,r.name,r.kind,r.currency,amount,paid,'Once',memo,aid,r.business_id,r.custom_category_id,(p_data->>'account_exchange_rate')::numeric,(p_data->>'account_rate_date')::date,p_data->>'account_currency',bid,day);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_occurrence_extra(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_occurrence_extra(jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
