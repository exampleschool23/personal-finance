-- Valuables: watches, jewellery, art, cars and similar tracked-value assets.
-- They behave like Property in the tracker (valuations and cash-only
-- contributions/withdrawals) but have no estimated income or trading.
-- Apply after 069. No existing rows are rewritten. Once Valuables records
-- exist, restoring the previous kind constraint would fail; delete or
-- reclassify them first.
BEGIN;

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE FUNCTION pg_temp.patch_valuables(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Valuations and opening balances are captured like other tracked holdings.
SELECT pg_temp.patch_valuables('public.capture_investment_balance()'::regprocedure,
 $old$'Property','Business','Money lent'$old$,$new$'Property','Business','Valuables','Money lent'$new$,1);

-- Tracker updates, with or without a linked cash account.
SELECT pg_temp.patch_valuables('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$'Property','Business','Money lent'$old$,$new$'Property','Business','Valuables','Money lent'$new$,1);
SELECT pg_temp.patch_valuables('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$r.kind NOT IN ('Business','Property') THEN$old$,$new$r.kind NOT IN ('Business','Property','Valuables') THEN$new$,1);
SELECT pg_temp.patch_valuables('public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid)'::regprocedure,
 $old$'Property','Business','Debt'$old$,$new$'Property','Business','Valuables','Debt'$new$,1);
SELECT pg_temp.patch_valuables('public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric)'::regprocedure,
 $old$'Property','Business','Debt'$old$,$new$'Property','Business','Valuables','Debt'$new$,1);
SELECT pg_temp.patch_valuables('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$r.kind NOT IN ('Business','Property') OR$old$,$new$r.kind NOT IN ('Business','Property','Valuables') OR$new$,1);

-- Asset lists and summaries; each valuable stays its own summary row.
SELECT pg_temp.patch_valuables('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'Deposit','Property','Business'))$old$,$new$'Deposit','Property','Business','Valuables'))$new$,2);
SELECT pg_temp.patch_valuables('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$CASE WHEN r.kind IN ('Business','Property') THEN r.id$old$,$new$CASE WHEN r.kind IN ('Business','Property','Valuables') THEN r.id$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;
