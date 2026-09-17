-- Accounts reuse Cash holdings: no duplicate assets are created.
BEGIN;
ALTER TABLE public.finance_records ADD COLUMN account_id uuid REFERENCES public.finance_records(id) ON DELETE RESTRICT,
 ADD COLUMN custom_category_id uuid, ADD COLUMN import_key text;
CREATE UNIQUE INDEX finance_import_key ON public.finance_records(user_id,import_key) WHERE import_key IS NOT NULL;
CREATE TABLE public.custom_categories (
 id uuid PRIMARY KEY, user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80), UNIQUE(id,user_id), UNIQUE(user_id,name)
);
ALTER TABLE public.finance_records ADD CONSTRAINT finance_category_owner FOREIGN KEY(custom_category_id,user_id) REFERENCES public.custom_categories(id,user_id);
CREATE TABLE public.account_activity (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('transfer','reconcile','repayment','mortgage')),
 account_id uuid NOT NULL REFERENCES public.finance_records(id), target_id uuid REFERENCES public.finance_records(id),
 amount numeric NOT NULL CHECK(amount>=0 AND amount<=1e15), received numeric NOT NULL DEFAULT 0 CHECK(received>=0 AND received<=1e15),
 fee numeric NOT NULL DEFAULT 0 CHECK(fee>=0 AND fee<=1e15), occurred_on date NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), created_at timestamptz NOT NULL DEFAULT now(),
 before_balance numeric NOT NULL, after_balance numeric NOT NULL
);
ALTER TABLE public.account_activity ADD CONSTRAINT account_activity_owner_unique UNIQUE(id,user_id);
ALTER TABLE public.finance_records ADD COLUMN operation_id uuid UNIQUE,
 ADD CONSTRAINT finance_operation_owner FOREIGN KEY(operation_id,user_id) REFERENCES public.account_activity(id,user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION public.guard_operation_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.operation_id IS NOT NULL THEN RAISE EXCEPTION 'Account operation fees cannot be edited or deleted.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_operation_record BEFORE UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_operation_record();
CREATE FUNCTION public.validate_operation_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op public.account_activity; a public.finance_records; destination public.finance_records;
BEGIN
 IF NEW.operation_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO op FROM public.account_activity WHERE id=NEW.operation_id AND user_id=NEW.user_id;
 SELECT * INTO a FROM public.finance_records WHERE id=op.account_id;
 SELECT * INTO destination FROM public.finance_records WHERE id=op.target_id;
 IF op.id IS NULL OR op.fee<=0 OR op.action NOT IN ('transfer','repayment') OR NEW.amount<>op.fee OR NEW.account_id IS DISTINCT FROM op.account_id OR NEW.currency<>a.currency OR NEW.date<>op.occurred_on OR NEW.frequency<>'Once' OR NEW.kind<>(CASE WHEN op.action='repayment' AND destination.kind='Money lent' THEN 'Other income' ELSE 'Other expense' END) THEN RAISE EXCEPTION 'Invalid account operation fee.'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER validate_operation_record AFTER INSERT OR UPDATE ON public.finance_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_operation_record();
CREATE TABLE public.payment_occurrences (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL REFERENCES public.finance_records(id), due_on date NOT NULL,
 status text NOT NULL CHECK(status IN ('paid','dismissed')), transaction_id uuid REFERENCES public.finance_records(id),
 UNIQUE(user_id,record_id,due_on)
);
CREATE TABLE public.savings_goals (
 id uuid PRIMARY KEY, user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120), account_id uuid NOT NULL REFERENCES public.finance_records(id),
 target numeric NOT NULL CHECK(target>0 AND target<=1e15), allocated numeric NOT NULL DEFAULT 0 CHECK(allocated>=0 AND allocated<=target),
 target_date date, archived boolean NOT NULL DEFAULT false
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['custom_categories','account_activity','payment_occurrences','savings_goals'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;
-- A linked one-time cashflow changes its account atomically. Edits reverse the old
-- effect, deletes reverse it, and restoring a deleted record reapplies it.
CREATE FUNCTION public.apply_account_cashflow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_records; old_delta numeric:=0; new_delta numeric:=0; ids uuid[]; item uuid;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.account_id IS NOT NULL THEN
  old_delta:=CASE WHEN OLD.kind IN ('Salary','Rent income','Other income') THEN OLD.amount ELSE -OLD.amount END;
  ids:=array_append(ids,OLD.account_id);
 END IF;
 IF TG_OP<>'DELETE' AND NEW.account_id IS NOT NULL THEN
  IF NEW.frequency<>'Once' OR NEW.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') OR NEW.date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Only actual income and expenses can update an account.'; END IF;
  new_delta:=CASE WHEN NEW.kind IN ('Salary','Rent income','Other income') THEN NEW.amount ELSE -NEW.amount END;
  ids:=array_append(ids,NEW.account_id);
 END IF;
 FOR item IN SELECT DISTINCT unnest(ids) ORDER BY 1 LOOP
  SELECT * INTO a FROM public.finance_records WHERE id=item FOR UPDATE;
  IF NOT FOUND OR a.kind<>'Cash' OR a.user_id<>coalesce(NEW.user_id,OLD.user_id) THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
  IF TG_OP<>'DELETE' AND item=NEW.account_id AND a.currency<>NEW.currency THEN RAISE EXCEPTION 'The account and transaction currencies must match.'; END IF;
  UPDATE public.finance_records SET amount=amount
   -CASE WHEN TG_OP<>'INSERT' AND item=OLD.account_id THEN old_delta ELSE 0 END
   +CASE WHEN TG_OP<>'DELETE' AND item=NEW.account_id THEN new_delta ELSE 0 END WHERE id=item;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER apply_account_cashflow AFTER INSERT OR UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.apply_account_cashflow();
CREATE FUNCTION public.planning_action(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE owner uuid:=auth.uid(); a public.finance_records; b public.finance_records; r public.finance_records;
 item uuid:=(p_data->>'id')::uuid; aid uuid:=(p_data->>'account_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 amount numeric:=(p_data->>'amount')::numeric; received numeric:=coalesce((p_data->>'received')::numeric,0); fee numeric:=coalesce((p_data->>'fee')::numeric,0);
 day date:=(p_data->>'date')::date; memo text:=coalesce(p_data->>'notes',''); prior public.account_activity; balance_before numeric; occurrence public.payment_occurrences; new_id uuid;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL THEN RAISE EXCEPTION 'An identifier is required.'; END IF;
 -- Serialize account operations per owner, including duplicate retries.
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 IF p_action='category' THEN
  INSERT INTO public.custom_categories(id,user_id,name) VALUES(item,owner,trim(p_data->>'name'))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name WHERE custom_categories.user_id=owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action='goal' THEN
  SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
  IF coalesce((p_data->>'archived')::boolean,false)=false AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;
  INSERT INTO public.savings_goals(id,user_id,name,account_id,target,allocated,target_date,archived)
  VALUES(item,owner,trim(p_data->>'name'),aid,(p_data->>'target')::numeric,(p_data->>'allocated')::numeric,(p_data->>'target_date')::date,coalesce((p_data->>'archived')::boolean,false))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,account_id=excluded.account_id,target=excluded.target,allocated=excluded.allocated,target_date=excluded.target_date,archived=excluded.archived WHERE savings_goals.user_id=owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF day IS NULL OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the payment date.'; END IF;
 IF p_action IN ('occurrence','dismiss') THEN
  SELECT * INTO r FROM public.finance_records WHERE id=bid AND user_id=owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found.'; END IF;
  SELECT * INTO occurrence FROM public.payment_occurrences WHERE user_id=owner AND record_id=bid AND due_on=day;
  IF FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
  IF p_action='dismiss' THEN
   IF r.kind<>'Deposit' OR r.date<>day THEN RAISE EXCEPTION 'Only deposit maturity reminders can be dismissed.'; END IF;
   INSERT INTO public.payment_occurrences VALUES(item,owner,bid,day,'dismissed',NULL);
  ELSE
   IF r.frequency NOT IN ('Monthly','Yearly') OR r.kind NOT IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense') OR day<r.date OR (r.end_date IS NOT NULL AND day>r.end_date)
    OR extract(day FROM day)<>least(extract(day FROM r.date),extract(day FROM date_trunc('month',day)+interval '1 month - 1 day'))
    OR (r.frequency='Yearly' AND extract(month FROM day)<>extract(month FROM r.date)) THEN RAISE EXCEPTION 'Invalid scheduled occurrence.'; END IF;
   IF aid IS NULL THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
   new_id:=item;
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id)
   VALUES(new_id,owner,r.name,r.kind,r.currency,r.amount,day,'Once',memo,aid,r.business_id,r.custom_category_id);
   INSERT INTO public.payment_occurrences VALUES(item,owner,bid,day,'paid',new_id);
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action NOT IN ('transfer','reconcile','repayment','mortgage') OR amount IS NULL OR amount<0 OR amount>1e15 OR received<0 OR received>1e15 OR fee<0 OR fee>1e15 THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 SELECT * INTO prior FROM public.account_activity WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.action<>p_action OR prior.account_id<>aid OR prior.target_id IS DISTINCT FROM bid OR prior.amount<>amount OR prior.received<>received OR prior.fee<>fee OR prior.occurred_on<>day OR prior.notes<>memo THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 PERFORM id FROM public.finance_records WHERE id IN (aid,bid) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash';
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 balance_before:=a.amount;
 IF p_action='reconcile' THEN
  IF bid IS NOT NULL OR fee<>0 OR received<>0 OR day<>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Reconcile the current balance today.'; END IF;
  UPDATE public.finance_records SET amount=(p_data->>'amount')::numeric WHERE id=aid;
 ELSE
  SELECT * INTO b FROM public.finance_records WHERE id=bid AND user_id=owner;
  IF NOT FOUND OR aid=bid OR (p_action<>'mortgage' AND amount<=0) OR (p_action='mortgage' AND amount+fee<=0) THEN RAISE EXCEPTION 'Choose a different destination.'; END IF;
  IF p_action='transfer' THEN
   IF b.kind<>'Cash' OR received<=0 OR (a.currency=b.currency AND received<>amount) THEN RAISE EXCEPTION 'Check the transfer amounts.'; END IF;
   UPDATE public.finance_records SET amount=finance_records.amount-(p_data->>'amount')::numeric WHERE id=aid;
   UPDATE public.finance_records SET amount=finance_records.amount+received WHERE id=bid;
  ELSE
   IF a.currency<>b.currency OR b.kind NOT IN ('Money lent','Loan','Debt','Mortgage') OR amount>b.amount OR received<>0 THEN RAISE EXCEPTION 'Check the repayment and account currency.'; END IF;
   IF p_action='mortgage' AND b.kind<>'Mortgage' THEN RAISE EXCEPTION 'Mortgage not found.'; END IF;
   IF b.kind='Mortgage' THEN
    IF p_action<>'mortgage' THEN RAISE EXCEPTION 'Use Record payment for mortgage payments.'; END IF;
    IF EXISTS(SELECT 1 FROM public.mortgage_payments WHERE id=item) THEN RAISE EXCEPTION 'This payment was already saved without an account.'; END IF;
    PERFORM public.record_mortgage_payment(item,bid,amount,fee,day,memo);
    UPDATE public.finance_records SET amount=finance_records.amount-amount-fee WHERE id=aid;
   ELSE
    UPDATE public.finance_records SET amount=finance_records.amount-(p_data->>'amount')::numeric WHERE id=bid;
    UPDATE public.finance_records SET amount=finance_records.amount+CASE WHEN b.kind='Money lent' THEN amount ELSE -amount END WHERE id=aid;
   END IF;
  END IF;
  IF fee>0 AND p_action<>'mortgage' THEN
   INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,operation_id)
   VALUES(gen_random_uuid(),owner,CASE WHEN p_action='transfer' THEN 'Transfer fee' ELSE b.name END,CASE WHEN b.kind='Money lent' AND p_action='repayment' THEN 'Other income' ELSE 'Other expense' END,a.currency,fee,day,'Once',memo,aid,item);
  END IF;
 END IF;
 INSERT INTO public.account_activity(id,user_id,action,account_id,target_id,amount,received,fee,occurred_on,notes,before_balance,after_balance)
 SELECT item,owner,p_action,aid,bid,amount,received,fee,day,memo,balance_before,account_row.amount FROM public.finance_records account_row WHERE account_row.id=aid;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.planning_action(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.planning_action(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
