-- Financial invariants still apply to ordinary record deletion. During the
-- administrator's auth.users cascade the owner is already gone, so there is no
-- surviving balance to reverse and immutable child rows must be removable.
BEGIN;
DO $$
DECLARE function_name text; definition text; insertion integer;
BEGIN
 FOREACH function_name IN ARRAY ARRAY['apply_account_cashflow','guard_operation_record','guard_movement_record','guard_mortgage_payment_record','guard_investment_history_record','guard_goal_target_account'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=function_name AND p.pronargs=0 AND p.prosecdef;
  IF definition IS NULL THEN RAISE EXCEPTION 'Expected security-definer trigger missing: %',function_name; END IF;
  insertion:=strpos(definition,E'\nBEGIN\n');
  IF insertion=0 THEN RAISE EXCEPTION 'Unexpected trigger definition: %',function_name; END IF;
  definition:=overlay(definition PLACING E'\nBEGIN\n IF TG_OP=''DELETE'' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;\n' FROM insertion FOR length(E'\nBEGIN\n'));
  EXECUTE definition;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
