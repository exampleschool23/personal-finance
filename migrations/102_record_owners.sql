-- Owners: in a household, every account and transaction belongs to everyone
-- (shared) or to one person in it.
-- * finance_records.shared says the record belongs to the whole household;
--   otherwise it belongs to member_id (the workspace owner when that is empty).
--   member_id still names who added a shared record.
-- * holding_accounts.member_id names the one person an investment account
--   belongs to; empty means shared.
-- * Everything from before this migration is shared. A new record takes the
--   owner of its account unless one is given; without an account it is shared.
-- * set_account_owner() changes an account's owner and takes along the records
--   that followed it; set_record_owner() replaces set_transaction_member().
-- * Someone outside the household is never named: their records are shared.
-- Apply after migration 101.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN shared boolean NOT NULL DEFAULT true;
-- No default from here on: an insert that leaves it out is given its account's owner below.
ALTER TABLE public.finance_records ALTER COLUMN shared DROP DEFAULT;
ALTER TABLE public.holding_accounts ADD COLUMN member_id uuid;

-- The one person a record belongs to; NULL for the whole household.
CREATE FUNCTION public.record_owner(shared boolean,member uuid,workspace uuid) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN shared THEN NULL ELSE coalesce(member,workspace) END
$$;
REVOKE ALL ON FUNCTION public.record_owner(boolean,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_owner(boolean,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attribute_finance_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account_shared boolean; account_member uuid;
BEGIN
 -- A verified restore brings records back exactly as they were saved; copies from before owners are shared.
 IF public.finance_restore_active() THEN NEW.shared:=coalesce(NEW.shared,true); RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN NEW.shared:=coalesce(NEW.shared,OLD.shared);
 ELSIF NEW.shared IS NULL THEN
  IF NEW.member_id IS NOT NULL THEN NEW.shared:=false;
  ELSE
   -- A new record takes the owner of its account.
   IF NEW.account_id IS NOT NULL THEN
    SELECT a.shared,coalesce(a.member_id,a.user_id) INTO account_shared,account_member FROM public.finance_records a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id;
   ELSIF NEW.holding_account_id IS NOT NULL THEN
    SELECT h.member_id IS NULL,h.member_id INTO account_shared,account_member FROM public.holding_accounts h WHERE h.id=NEW.holding_account_id AND h.user_id=NEW.user_id;
   END IF;
   NEW.shared:=coalesce(account_shared,true);
   IF NOT NEW.shared THEN NEW.member_id:=account_member; END IF;
  END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.member_id IS NULL THEN NEW.member_id:=auth.uid(); END IF;
 IF NEW.member_id IS NOT NULL AND NEW.member_id<>NEW.user_id AND (TG_OP='INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id)
  AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=NEW.user_id AND member_id=NEW.member_id) THEN
  -- Someone outside the household (a former member, a restored copy) is not named.
  NEW.member_id:=NULL; NEW.shared:=true;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER attribute_finance_record ON public.finance_records;
CREATE TRIGGER attribute_finance_record BEFORE INSERT OR UPDATE OF member_id,user_id,shared ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.attribute_finance_record();

DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'member_id']$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'member_id']$q$,$q$'member_id','shared']$q$);
END $$;

-- Copies saved before owners (deleted items, import snapshots) are shared, like the records they were taken from.
CREATE OR REPLACE FUNCTION public.normalize_finance_record_snapshot(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE field record; result jsonb:=p_data; default_value jsonb;
BEGIN
 IF NOT(p_data ? 'shared') THEN result:=result||jsonb_build_object('shared',true); END IF;
 FOR field IN SELECT a.attname,pg_get_expr(d.adbin,d.adrelid) AS expression
  FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.finance_records'::regclass AND NOT a.attisdropped AND NOT(p_data ? a.attname)
 LOOP
  EXECUTE 'SELECT to_jsonb('||field.expression||')' INTO default_value;
  result:=result||jsonb_build_object(field.attname,default_value);
 END LOOP;
 RETURN to_jsonb(jsonb_populate_record(NULL::public.finance_records,result));
END $$;

-- An account changes owner (NULL shares it) and takes along the records that followed it:
-- a cash account's transactions, a property's rent, an investment account's holdings.
-- Returns how many followed.
CREATE FUNCTION public.set_account_owner(p_account uuid,p_member uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); account public.finance_records; holding public.holding_accounts; previous uuid; changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_member IS NOT NULL AND p_member<>owner AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=owner AND member_id=p_member) THEN
  RAISE EXCEPTION 'This person is no longer in your household.';
 END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=p_account AND user_id=owner
  AND kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Property','Business','Valuables','Money lent','Mortgage','Loan','Debt') FOR UPDATE;
 IF FOUND THEN
  previous:=public.record_owner(account.shared,account.member_id,owner);
  IF previous IS NOT DISTINCT FROM p_member THEN RETURN 0; END IF;
  UPDATE public.finance_records SET shared=p_member IS NULL,member_id=coalesce(p_member,member_id) WHERE id=account.id AND user_id=owner;
  WITH moved AS (
   UPDATE public.finance_records r SET shared=p_member IS NULL,member_id=coalesce(p_member,r.member_id)
   WHERE r.user_id=owner AND (r.account_id=account.id OR (account.kind='Property' AND r.kind='Rent income' AND r.income_source_id=account.id))
    AND public.record_owner(r.shared,r.member_id,owner) IS NOT DISTINCT FROM previous
   RETURNING r.id)
  SELECT count(*) INTO changed FROM moved;
  RETURN changed;
 END IF;
 SELECT * INTO holding FROM public.holding_accounts WHERE id=p_account AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your accounts.'; END IF;
 IF holding.member_id IS NOT DISTINCT FROM p_member THEN RETURN 0; END IF;
 UPDATE public.holding_accounts SET member_id=p_member WHERE id=holding.id AND user_id=owner;
 WITH moved AS (
  UPDATE public.finance_records r SET shared=p_member IS NULL,member_id=coalesce(p_member,r.member_id)
  WHERE r.user_id=owner AND r.holding_account_id=holding.id
   AND public.record_owner(r.shared,r.member_id,owner) IS NOT DISTINCT FROM holding.member_id
  RETURNING r.id)
 SELECT count(*) INTO changed FROM moved;
 RETURN changed;
END $$;

-- Who records belong to, set from the Transactions list: someone in the household, or everyone with NULL.
DROP FUNCTION public.set_transaction_member(uuid[],uuid);
CREATE FUNCTION public.set_record_owner(p_ids uuid[],p_member uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 IF p_member IS NOT NULL AND p_member<>owner AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=owner AND member_id=p_member) THEN
  RAISE EXCEPTION 'This person is no longer in your household.';
 END IF;
 UPDATE public.finance_records SET shared=p_member IS NULL,member_id=coalesce(p_member,member_id)
 WHERE id=ANY(p_ids) AND user_id=owner AND public.record_owner(shared,member_id,owner) IS DISTINCT FROM p_member;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.set_account_owner(uuid,uuid),public.set_record_owner(uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_account_owner(uuid,uuid),public.set_record_owner(uuid[],uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
