-- Scheduled payments keep the day the money actually moved. Apply after 109.
-- Recording an occurrence may name `paid_on`, the day it was received or paid.
-- The transaction takes that date (never a future one); the occurrence it
-- settles keeps its due date. Without `paid_on` the transaction is dated on
-- the due date, as before. No rows are rewritten.
BEGIN;

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_payment_date(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 -- Re-running is a no-op once every expected match was already patched. The new
 -- text may contain the old, so it is counted first.
 IF (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- The payment day may not lie ahead.
SELECT pg_temp.patch_payment_date('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$   new_id:=item;
   INSERT INTO public.finance_records($old$,
 $new$   IF (p_data->>'paid_on')::date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Check the payment date.'; END IF;
   new_id:=item;
   INSERT INTO public.finance_records($new$,1);

-- The transaction is dated when the money moved.
SELECT pg_temp.patch_payment_date('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$r.currency,amount,day,'Once',memo$old$,
 $new$r.currency,amount,coalesce((p_data->>'paid_on')::date,day),'Once',memo$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;
