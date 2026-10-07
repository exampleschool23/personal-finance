-- Money lent can leave a cash account. Needs 117 (the loan's history starts on its lent date).
-- A new Money lent record names the cash account the money came from. The loan
-- is saved at zero and the lent amount is then added from that account, in one
-- transaction: the account loses what the borrower now owes, net worth stays
-- the same, and the tracker shows the cash link like any later addition. A
-- retry after a lost response returns the saved loan without moving cash twice.
BEGIN;

CREATE OR REPLACE FUNCTION public.lend_from_account(p_record jsonb,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE loan uuid; lent numeric; lent_on date;
BEGIN
 IF jsonb_typeof(p_record)<>'object' OR p_record->>'kind' IS DISTINCT FROM 'Money lent' OR p_account IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 loan:=(p_record->>'id')::uuid; lent:=(p_record->>'amount')::numeric; lent_on:=(p_record->>'lent_date')::date;
 IF loan IS NULL OR lent IS NULL OR lent<=0 OR lent_on IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 -- The cash movement takes the loan's id, so a retry finds it and changes nothing.
 IF EXISTS(SELECT 1 FROM public.investment_account_links WHERE id=loan) THEN
  IF NOT EXISTS(SELECT 1 FROM public.investment_account_links WHERE id=loan AND account_id=p_account AND amount=-lent) THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN (SELECT jsonb_build_array(to_jsonb(r)) FROM public.finance_records r WHERE r.id=loan);
 END IF;
 PERFORM public.save_finance_record(p_record||jsonb_build_object('amount',0),NULL);
 PERFORM public.record_investment_with_account(loan,loan,'contribution',lent_on,lent,NULL,'',p_account);
 RETURN (SELECT jsonb_build_array(to_jsonb(r)) FROM public.finance_records r WHERE r.id=loan);
END $$;
REVOKE ALL ON FUNCTION public.lend_from_account(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lend_from_account(jsonb,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
