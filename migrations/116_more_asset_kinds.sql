-- Five more asset kinds. Apply after 115. No existing rows are rewritten.
--  * Precious metals: gold, silver, platinum or palladium by weight. Valued like a
--    stock (units x price per unit); the price per unit follows the metal's live spot
--    price for the chosen weight unit and purity (metal, metal_unit, metal_purity).
--  * Equity compensation: vested RSUs or option shares of a listed company, valued
--    like a stock by its ticker. The date holds the next vesting date.
--  * Bond: a government or corporate bond held for its coupon. It behaves like a
--    Treasury bill: a face value, an annual coupon rate without compounding, a
--    purchase date and a maturity reminder.
--  * Retirement account and Vehicle: tracked-value assets like Valuables, with
--    valuations and cash-funded contributions or withdrawals.
-- Once records of these kinds exist, restoring the previous kind constraint would
-- fail; delete or reclassify them first.
BEGIN;

ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));

ALTER TABLE public.finance_records
 ADD COLUMN IF NOT EXISTS metal text CHECK (metal IN ('XAU','XAG','XPT','XPD')),
 ADD COLUMN IF NOT EXISTS metal_unit text CHECK (metal_unit IN ('oz','g','kg')),
 ADD COLUMN IF NOT EXISTS metal_purity numeric CHECK (metal_purity > 0 AND metal_purity <= 1);
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_metal_fields;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_metal_fields CHECK (
 (kind = 'Precious metals' AND metal IS NOT NULL AND metal_unit IS NOT NULL AND metal_purity IS NOT NULL)
 OR (kind <> 'Precious metals' AND metal IS NULL AND metal_unit IS NULL AND metal_purity IS NULL));

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_more_assets(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once every expected match was already patched.
 IF found=0 AND (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Opening balances and valuations: every new kind has a history; metals and equity count their units.
SELECT pg_temp.patch_more_assets('public.capture_investment_balance()'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);
SELECT pg_temp.patch_more_assets('public.capture_investment_balance()'::regprocedure,
 $old$NEW.kind IN ('Stock','Crypto')$old$,$new$NEW.kind IN ('Stock','Crypto','Precious metals','Equity compensation')$new$,1);

-- Tracker updates, with or without a linked cash account.
SELECT pg_temp.patch_more_assets('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);
SELECT pg_temp.patch_more_assets('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$r.kind NOT IN ('Business','Property','Valuables') THEN$old$,$new$r.kind NOT IN ('Business','Property','Valuables','Vehicle','Retirement account') THEN$new$,1);
SELECT pg_temp.patch_more_assets('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$r.kind IN ('Stock','Crypto')$old$,$new$r.kind IN ('Stock','Crypto','Precious metals','Equity compensation')$new$,2);
SELECT pg_temp.patch_more_assets('public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Debt'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Debt'$new$,1);
SELECT pg_temp.patch_more_assets('public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Debt'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Debt'$new$,1);
SELECT pg_temp.patch_more_assets('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$r.kind IN ('Business','Property','Valuables') AND$old$,$new$r.kind IN ('Business','Property','Valuables','Vehicle','Retirement account') AND$new$,1);

-- Asset lists and summaries. Each vehicle, retirement account and metal holding stays its own
-- summary row, and a metal's row carries its weight unit and purity for live pricing.
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables'))$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation'))$new$,2);
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$r.kind IN ('Stock','Crypto')$old$,$new$r.kind IN ('Stock','Crypto','Precious metals','Equity compensation')$new$,3);
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$CASE WHEN r.kind IN ('Business','Property','Valuables') THEN r.id$old$,$new$CASE WHEN r.kind IN ('Business','Property','Valuables','Vehicle','Retirement account','Precious metals') THEN r.id$new$,1);
SELECT pg_temp.patch_more_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$'' AS notes, count(*) AS record_count$old$,$new$'' AS notes, min(r.metal) AS metal, min(r.metal_unit) AS metal_unit, min(r.metal_purity) AS metal_purity, count(*) AS record_count$new$,1);

-- A bond's maturity reminder can be dismissed like a deposit's.
SELECT pg_temp.patch_more_assets('public.planning_action(text,jsonb)'::regprocedure,
 $old$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill','Bond') OR r.date<>day$new$,1);
SELECT pg_temp.patch_more_assets('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$r.kind NOT IN ('Deposit','Treasury bill') OR r.date<>day$old$,$new$r.kind NOT IN ('Deposit','Treasury bill','Bond') OR r.date<>day$new$,1);

-- The purchase date is an opening balance date.
SELECT pg_temp.patch_more_assets('public.guard_opening_balance_date()'::regprocedure,
 $old$('Cash','Deposit','Treasury bill','Stock','Crypto'$old$,$new$('Cash','Deposit','Treasury bill','Bond','Stock','Crypto','Precious metals','Equity compensation'$new$,1);

-- Metals and vested shares are bought and sold in units, like stocks.
SELECT pg_temp.patch_more_assets('public.record_asset_movement(jsonb)'::regprocedure,
 $old$a_units:=a.kind IN ('Stock','Crypto'); b_units:=b.kind IN ('Stock','Crypto');$old$,$new$a_units:=a.kind IN ('Stock','Crypto','Precious metals','Equity compensation'); b_units:=b.kind IN ('Stock','Crypto','Precious metals','Equity compensation');$new$,1);

-- Owners and businesses can be set on the new assets.
SELECT pg_temp.patch_more_assets('public.set_account_owner(uuid,uuid)'::regprocedure,
 $old$'Treasury bill','Property','Business','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);
SELECT pg_temp.patch_more_assets('public.set_account_business(uuid,uuid)'::regprocedure,
 $old$'Treasury bill','Property','Valuables','Money lent'$old$,$new$'Treasury bill','Bond','Property','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent'$new$,1);

-- Records can be saved with a metal, its weight unit and purity.
SELECT pg_temp.patch_more_assets('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$'member_id','shared'];$old$,$new$'member_id','shared','metal','metal_unit','metal_purity'];$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;
