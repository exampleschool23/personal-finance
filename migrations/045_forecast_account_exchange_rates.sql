BEGIN;
ALTER TABLE public.forecast_assignments ADD COLUMN exchange_rate numeric CHECK(exchange_rate>0 AND exchange_rate<=1e15), ADD COLUMN from_currency text, ADD COLUMN to_currency text;
DROP FUNCTION public.save_forecast_assignment(uuid,uuid);
CREATE FUNCTION public.save_forecast_assignment(p_record uuid,p_account uuid,p_rate numeric DEFAULT NULL,p_from text DEFAULT NULL,p_to text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records; a public.finance_records;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.frequency='Once' OR r.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN RAISE EXCEPTION 'Choose a recurring schedule.'; END IF;
 IF p_account IS NULL THEN DELETE FROM public.forecast_assignments WHERE record_id=p_record AND user_id=owner;
 ELSE
  SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a cash account.'; END IF;
  IF a.currency<>r.currency AND (p_rate IS NULL OR p_rate<=0 OR p_rate>1e15 OR p_rate='NaN'::numeric OR p_from IS DISTINCT FROM r.currency OR p_to IS DISTINCT FROM a.currency) THEN RAISE EXCEPTION 'A positive exchange rate is required.'; END IF;
  INSERT INTO public.forecast_assignments(record_id,user_id,account_id,exchange_rate,from_currency,to_currency)
  VALUES(p_record,owner,p_account,CASE WHEN a.currency=r.currency THEN 1 ELSE p_rate END,r.currency,a.currency)
  ON CONFLICT(record_id) DO UPDATE SET account_id=EXCLUDED.account_id,exchange_rate=EXCLUDED.exchange_rate,from_currency=EXCLUDED.from_currency,to_currency=EXCLUDED.to_currency;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.save_forecast_assignment(uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_forecast_assignment(uuid,uuid,numeric,text,text) TO authenticated;
COMMIT;
