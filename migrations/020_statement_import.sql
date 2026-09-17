BEGIN;
CREATE FUNCTION public.import_account_transactions(p_account uuid,p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; r jsonb; added integer:=0; skipped integer:=0; signed numeric; owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Check the import fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO a FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 -- Process chronologically, with receipts first on equal dates.
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'date',(value->>'amount')::numeric DESC LOOP
  signed:=(r->>'amount')::numeric;
  IF signed IS NULL OR signed=0 OR abs(signed)>1e15 OR r->>'key' IS NULL OR r->>'key' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Check the import fields.'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=owner AND import_key=r->>'key') THEN skipped:=skipped+1;CONTINUE; END IF;
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,import_key)
  VALUES(gen_random_uuid(),owner,r->>'name',CASE WHEN signed>0 THEN 'Other income' ELSE 'Other expense' END,a.currency,abs(signed),(r->>'date')::date,'Once',coalesce(r->>'notes',''),p_account,r->>'key');
  added:=added+1;
 END LOOP;
 RETURN jsonb_build_object('added',added,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION public.import_account_transactions(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_account_transactions(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
