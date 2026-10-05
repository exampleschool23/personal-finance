-- Scheduled payments of 0: "the business made nothing this month".
-- Apply after 108. No rows are rewritten.
-- Recording an occurrence as 0 settles it with a 0 transaction that keeps its
-- note and moves no cash. Skipping an occurrence stays a separate action, and
-- an occurrence still cannot be recorded before its due date.
BEGIN;

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_scheduled_payments(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- A scheduled payment may be 0.
SELECT pg_temp.patch_scheduled_payments('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$IF amount IS NULL OR amount<=0 OR amount>1e15 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
   new_id:=item;$old$,
 $new$IF amount IS NULL OR amount<0 OR amount>1e15 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
   new_id:=item;$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;
