-- Treasury bills: short-term government bills held to maturity. They behave
-- like a deposit: a balance, an annual yield that accrues without
-- compounding, a purchase date and a maturity reminder. They are not cash
-- balances, so transfers and asset movements stay limited to Cash and Deposit.
-- Apply after 084. No existing rows are rewritten. Once Treasury bill records
-- exist, restoring the previous kind constraint would fail; delete or
-- reclassify them first.
BEGIN;

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE FUNCTION pg_temp.patch_treasury_bills(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Opening balances and tracker updates, with or without a linked cash account.
SELECT pg_temp.patch_treasury_bills('public.capture_investment_balance()'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);
SELECT pg_temp.patch_treasury_bills('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);
SELECT pg_temp.patch_treasury_bills('public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid)'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);
SELECT pg_temp.patch_treasury_bills('public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric)'::regprocedure,
 $old$'Deposit','Property'$old$,$new$'Deposit','Treasury bill','Property'$new$,1);

-- The purchase date is an opening balance date.
SELECT pg_temp.patch_treasury_bills('public.guard_opening_balance_date()'::regprocedure,
 $old$('Cash','Deposit','Stock'$old$,$new$('Cash','Deposit','Treasury bill','Stock'$new$,1);

-- Asset lists and summaries.
SELECT pg_temp.patch_treasury_bills('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'Deposit','Property','Business','Valuables'))$old$,$new$'Deposit','Treasury bill','Property','Business','Valuables'))$new$,2);

-- A bill's maturity reminder can be dismissed like a deposit's.
SELECT pg_temp.patch_treasury_bills('public.planning_action(text,jsonb)'::regprocedure,
 $old$r.kind<>'Deposit' OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$new$,1);
SELECT pg_temp.patch_treasury_bills('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$r.kind<>'Deposit' OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;
