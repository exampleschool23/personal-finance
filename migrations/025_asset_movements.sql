-- Atomic trades, deposit transfers, and capitalized interest. Existing records remain intact.
BEGIN;
-- Acquire existing-table locks before changing the schema. NOWAIT prevents a
-- reader/writer holding one dependency from waiting behind this migration while
-- we wait for another dependency. Failed attempts release ALL preflight locks
-- through the inner exception block before retrying (at most five seconds).
-- Keep later implicit DDL lock waits short as well, including catalog locks.
SET LOCAL lock_timeout = '500ms';
DO $$
DECLARE attempt integer;
BEGIN
 FOR attempt IN 1..20 LOOP
  BEGIN
   LOCK TABLE public.finance_records IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK TABLE public.holding_accounts, public.investment_history IN ACCESS SHARE MODE NOWAIT;
   EXIT;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=20 THEN
    RAISE EXCEPTION USING ERRCODE='55P03',
     MESSAGE='Migration 025 could not acquire its locks. No migration changes were applied.',
     HINT='Wait for other SQL queries to finish, close active finance app tabs, then rerun the entire migration. Do not run two copies at once.';
   END IF;
  END;
  PERFORM pg_sleep(0.25);
 END LOOP;
END $$;
ALTER TABLE public.finance_records ADD COLUMN deposit_compounding text NOT NULL DEFAULT 'monthly' CHECK(deposit_compounding IN ('monthly','daily','none'));
ALTER TABLE public.finance_records ADD COLUMN opened_on date;
CREATE FUNCTION public.guard_opening_balance_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.opened_on IS NOT NULL AND (NEW.kind NOT IN ('Cash','Deposit','Stock','Crypto') OR NEW.opened_on>(now() AT TIME ZONE 'Asia/Tashkent')::date) THEN RAISE EXCEPTION 'Check the opening balance date.'; END IF;
 IF TG_OP='UPDATE' AND NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN RAISE EXCEPTION 'The opening balance date cannot change after creation.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_opening_balance_date BEFORE INSERT OR UPDATE OF opened_on ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_opening_balance_date();
CREATE OR REPLACE FUNCTION public.capture_investment_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind NOT IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt') THEN RETURN NEW; END IF;
 IF current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.amount=OLD.amount AND NEW.quantity=OLD.quantity AND NEW.ownership_percentage=OLD.ownership_percentage THEN RETURN NEW; END IF;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage,notes)
 VALUES(NEW.user_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'baseline' ELSE 'valuation' END,
 CASE WHEN TG_OP='INSERT' THEN coalesce(NEW.opened_on,(now() AT TIME ZONE 'Asia/Tashkent')::date) ELSE (now() AT TIME ZONE 'Asia/Tashkent')::date END,
 NEW.amount*CASE WHEN NEW.kind IN ('Stock','Crypto') THEN NEW.quantity ELSE 1 END,
 CASE WHEN NEW.kind='Business' THEN NEW.ownership_percentage ELSE 100 END,'');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_opening_balance_date() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_holding_account_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE linked public.holding_accounts;
BEGIN
 IF NEW.holding_account_id IS NOT NULL THEN
  SELECT * INTO linked FROM public.holding_accounts WHERE id=NEW.holding_account_id AND user_id=NEW.user_id FOR SHARE;
  IF NOT FOUND OR (NEW.kind<>'Cash' AND NEW.kind<>linked.kind) THEN RAISE EXCEPTION 'Choose one of your matching stock or crypto accounts.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TABLE public.asset_movements (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('transfer','buy','sell','interest')),
 source_id uuid NOT NULL REFERENCES public.finance_records(id), target_id uuid NOT NULL REFERENCES public.finance_records(id),
 sent numeric NOT NULL CHECK(sent>=0 AND sent<=1e15), received numeric NOT NULL CHECK(received>0 AND received<=1e15),
 source_value numeric NOT NULL CHECK(source_value>=0 AND source_value<=1e15), target_value numeric NOT NULL CHECK(target_value>0 AND target_value<=1e15),
 fee numeric NOT NULL DEFAULT 0 CHECK(fee>=0 AND fee<=1e15), occurred_on date NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 source_before numeric NOT NULL, source_after numeric NOT NULL, target_before numeric NOT NULL, target_after numeric NOT NULL,
 realized_gain numeric, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(id,user_id)
);
ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_movements_owner ON public.asset_movements FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.asset_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.asset_movements TO authenticated;
CREATE INDEX asset_movements_owner_date ON public.asset_movements(user_id,occurred_on,id);
ALTER TABLE public.finance_records ADD COLUMN movement_id uuid UNIQUE;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_movement_owner FOREIGN KEY(movement_id,user_id) REFERENCES public.asset_movements(id,user_id);
CREATE FUNCTION public.guard_movement_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE movement public.asset_movements; source public.finance_records; target public.finance_records;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.movement_id IS NOT NULL THEN RAISE EXCEPTION 'Movement income and fees cannot be edited or deleted.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.movement_id IS NOT NULL THEN
  SELECT * INTO movement FROM public.asset_movements WHERE id=NEW.movement_id AND user_id=NEW.user_id;
  SELECT * INTO source FROM public.finance_records WHERE id=movement.source_id;
  SELECT * INTO target FROM public.finance_records WHERE id=movement.target_id;
  IF movement.id IS NULL OR NEW.frequency<>'Once' OR NEW.date<>movement.occurred_on OR NEW.account_id IS NOT NULL
   OR (movement.kind='interest' AND (NEW.kind<>'Other income' OR NEW.amount<>movement.received OR NEW.currency<>target.currency))
   OR (movement.kind<>'interest' AND (NEW.kind<>'Other expense' OR NEW.amount<>movement.fee OR NEW.currency<>CASE WHEN movement.kind='buy' THEN target.currency ELSE source.currency END OR movement.fee<=0))
  THEN RAISE EXCEPTION 'Invalid movement income or fee.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_movement_record BEFORE INSERT OR UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_movement_record();
CREATE FUNCTION public.record_asset_movement(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); a public.finance_records; b public.finance_records; prior public.asset_movements;
 item uuid:=(p_data->>'id')::uuid; action text:=p_data->>'kind'; aid uuid:=(p_data->>'source_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 sent numeric:=(p_data->>'sent')::numeric; received numeric:=(p_data->>'received')::numeric;
 av numeric:=(p_data->>'source_value')::numeric; bv numeric:=(p_data->>'target_value')::numeric; fee numeric:=(p_data->>'fee')::numeric;
 day date:=(p_data->>'date')::date; memo text:=p_data->>'notes'; ab numeric; bb numeric; aa numeric; ba numeric; a_units boolean; b_units boolean; last_day date; gain numeric;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL OR action IS NULL OR action NOT IN ('transfer','buy','sell','interest') OR aid IS NULL OR bid IS NULL
  OR sent IS NULL OR received IS NULL OR av IS NULL OR bv IS NULL OR fee IS NULL OR memo IS NULL OR day IS NULL
  OR sent<0 OR sent>1e15 OR received<=0 OR received>1e15 OR av<0 OR av>1e15 OR bv<=0 OR bv>1e15 OR fee<0 OR fee>1e15
  OR sent::text IN ('NaN','Infinity','-Infinity') OR received::text IN ('NaN','Infinity','-Infinity') OR av::text IN ('NaN','Infinity','-Infinity') OR bv::text IN ('NaN','Infinity','-Infinity') OR fee::text IN ('NaN','Infinity','-Infinity')
  OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the movement fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.asset_movements WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.kind<>action OR prior.source_id<>aid OR prior.target_id<>bid OR prior.sent<>sent OR prior.received<>received OR prior.source_value<>av OR prior.target_value<>bv OR prior.fee<>fee OR prior.occurred_on<>day OR prior.notes<>memo THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 PERFORM id FROM public.finance_records WHERE id IN(aid,bid) AND user_id=owner ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner;
 SELECT * INTO b FROM public.finance_records WHERE id=bid AND user_id=owner;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Choose your own source and destination.'; END IF;
 a_units:=a.kind IN ('Stock','Crypto'); b_units:=b.kind IN ('Stock','Crypto');
 IF action='interest' THEN
  IF aid<>bid OR a.kind<>'Deposit' OR sent<>0 OR av<>0 OR bv<>received OR fee<>0 THEN RAISE EXCEPTION 'Choose a deposit for capitalized interest.'; END IF;
 ELSE
  IF aid=bid OR sent<=0 OR av<=0 THEN RAISE EXCEPTION 'Choose a different destination.'; END IF;
  IF action='transfer' AND (a.kind NOT IN ('Cash','Deposit') OR b.kind NOT IN ('Cash','Deposit')) THEN RAISE EXCEPTION 'Transfer between cash and deposit balances.'; END IF;
  IF action='buy' AND (a.kind NOT IN ('Cash','Crypto') OR NOT b_units) THEN RAISE EXCEPTION 'Choose cash or crypto to buy a holding.'; END IF;
  IF action='sell' AND (NOT a_units OR b.kind NOT IN ('Cash','Crypto')) THEN RAISE EXCEPTION 'Choose cash or crypto for the sale proceeds.'; END IF;
  IF (NOT a_units AND av<>sent) OR (NOT b_units AND bv<>received) THEN RAISE EXCEPTION 'Check the settlement amounts.'; END IF;
  IF action='transfer' AND fee>=sent THEN RAISE EXCEPTION 'The transfer fee must be less than the amount sent.'; END IF;
  IF action='buy' AND fee>bv THEN RAISE EXCEPTION 'The purchase fee cannot exceed its total cost.'; END IF;
  IF action='transfer' AND a.currency=b.currency AND sent<>received+fee THEN RAISE EXCEPTION 'The amount received plus fee must equal the amount sent.'; END IF;
  IF action IN ('buy','sell') AND a.currency=b.currency AND av<>bv THEN RAISE EXCEPTION 'Use the same net trade value in both holdings.'; END IF;
 END IF;
 -- New operations must follow recorded balance changes: never overwrite later history.
 SELECT max(occurred_on) INTO last_day FROM public.investment_history WHERE record_id IN(aid,bid) AND balance IS NOT NULL;
 IF day<last_day THEN RAISE EXCEPTION 'Choose a date on or after the latest balance update.'; END IF;
 ab:=CASE WHEN a_units THEN a.quantity ELSE a.amount END; bb:=CASE WHEN b_units THEN b.quantity ELSE b.amount END;
 IF sent>ab THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.'; END IF;
 aa:=ab-sent; ba:=bb+received;
 IF (a_units AND sent>1e12) OR (b_units AND ba>1e12) OR (NOT b_units AND ba>1e15) THEN RAISE EXCEPTION 'Check the movement fields.'; END IF;
 IF a_units THEN gain:=av-sent*a.cost; END IF;
 INSERT INTO public.asset_movements(id,user_id,kind,source_id,target_id,sent,received,source_value,target_value,fee,occurred_on,notes,source_before,source_after,target_before,target_after,realized_gain)
 VALUES(item,owner,action,aid,bid,sent,received,av,bv,fee,day,memo,ab,CASE WHEN action='interest' THEN ba ELSE aa END,bb,ba,gain);
 PERFORM set_config('finance.history_write','1',true);
 IF action<>'interest' THEN
  UPDATE public.finance_records SET quantity=CASE WHEN a_units THEN aa ELSE quantity END,amount=CASE WHEN a_units THEN amount ELSE aa END WHERE id=aid;
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
  VALUES(owner,aid,'withdrawal',day,av,CASE WHEN a_units THEN aa*a.amount ELSE aa END,memo);
 END IF;
 UPDATE public.finance_records SET quantity=CASE WHEN b_units THEN ba ELSE quantity END,
  amount=CASE WHEN b_units THEN CASE WHEN bb=0 THEN bv/received ELSE amount END ELSE ba END,
  cost=CASE WHEN b_units THEN (bb*cost+bv)/ba ELSE cost END WHERE id=bid;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
 VALUES(owner,bid,CASE WHEN action='interest' THEN 'income' ELSE 'contribution' END,day,bv,
 CASE WHEN b_units THEN ba*CASE WHEN bb=0 THEN bv/received ELSE b.amount END ELSE ba END,memo);
 PERFORM set_config('finance.history_write','0',true);
 IF fee>0 OR action='interest' THEN
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,movement_id)
  VALUES(gen_random_uuid(),owner,CASE WHEN action='interest' THEN b.name ELSE 'Transaction fee' END,CASE WHEN action='interest' THEN 'Other income' ELSE 'Other expense' END,
  CASE WHEN action='buy' THEN b.currency ELSE a.currency END,CASE WHEN action='interest' THEN received ELSE fee END,day,'Once',memo,item);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_asset_movement(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_asset_movement(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_movement_record() FROM PUBLIC,anon,authenticated;
-- Include the immutable movement ledger in consistent backups.
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_movements;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.export_finance_backup_before_movements();
 RETURN jsonb_set(result,'{tables,asset_movements}',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM public.asset_movements m WHERE m.user_id=auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
