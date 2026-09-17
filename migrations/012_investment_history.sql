-- Run after migrations 009, 010 and 011, in that order.
BEGIN;
DO $$
BEGIN
 IF to_regclass('public.mortgage_payments') IS NULL THEN
  RAISE EXCEPTION 'Migration 009 is missing. Run 009_mortgage_payments.sql, 010_estimated_mortgage_payments.sql and 011_money_lent_in_loans_and_debts.sql before retrying 012.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_records' AND column_name='estimated_monthly_payment') THEN
  RAISE EXCEPTION 'Migration 010 is missing. Run 010_estimated_mortgage_payments.sql and 011_money_lent_in_loans_and_debts.sql before retrying 012.';
 END IF;
END $$;

-- Dated valuations and actual cash movements, kept independently of forecasts.
CREATE TABLE public.investment_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL REFERENCES public.finance_records(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN ('baseline','valuation','contribution','withdrawal','income','expense','mortgage_payment')),
 occurred_on date NOT NULL,
 amount numeric NOT NULL DEFAULT 0 CHECK(amount>=0 AND amount<=1e15),
 balance numeric CHECK(balance>=0 AND balance<=1e27),
 ownership_percentage numeric NOT NULL DEFAULT 100 CHECK(ownership_percentage>=0 AND ownership_percentage<=100),
 principal numeric NOT NULL DEFAULT 0 CHECK(principal>=0),
 interest numeric NOT NULL DEFAULT 0 CHECK(interest>=0),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.investment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read investment history" ON public.investment_history FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.investment_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.investment_history TO authenticated;
CREATE INDEX investment_history_record_date ON public.investment_history(record_id,occurred_on,created_at);
ALTER TABLE public.finance_records ADD COLUMN history_event_id uuid UNIQUE REFERENCES public.investment_history(id) ON DELETE RESTRICT;

CREATE FUNCTION public.capture_investment_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind NOT IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt') THEN RETURN NEW; END IF;
 IF current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.amount=OLD.amount AND NEW.quantity=OLD.quantity AND NEW.ownership_percentage=OLD.ownership_percentage THEN RETURN NEW; END IF;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage,notes)
 VALUES(NEW.user_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'baseline' ELSE 'valuation' END,
 (now() AT TIME ZONE 'Asia/Tashkent')::date,
 NEW.amount*CASE WHEN NEW.kind IN ('Stock','Crypto') THEN NEW.quantity ELSE 1 END,
 CASE WHEN NEW.kind='Business' THEN NEW.ownership_percentage ELSE 100 END,'');
 RETURN NEW;
END $$;
CREATE TRIGGER capture_investment_balance AFTER INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.capture_investment_balance();

CREATE FUNCTION public.guard_investment_history_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.history_event_id IS NOT NULL THEN RAISE EXCEPTION 'Tracked cash movements cannot be edited or deleted.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.kind<>OLD.kind OR NEW.currency<>OLD.currency) AND EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=OLD.id) THEN
  IF OLD.kind='Mortgage' THEN RAISE EXCEPTION 'A mortgage with payments must keep its category and currency.'; END IF;
  RAISE EXCEPTION 'Tracked records must keep their category and currency.';
 END IF;
 IF NEW.history_event_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.investment_history h JOIN public.finance_records r ON r.id=h.record_id
  WHERE h.id=NEW.history_event_id AND NEW.id=h.id AND h.user_id=NEW.user_id AND r.user_id=NEW.user_id
  AND NEW.amount=h.amount AND NEW.currency=r.currency AND NEW.date=h.occurred_on AND NEW.frequency='Once'
  AND ((h.event_type='income' AND NEW.kind=CASE WHEN r.kind='Property' THEN 'Rent income' ELSE 'Other income' END) OR (h.event_type='expense' AND NEW.kind='Other expense'))
 ) THEN RAISE EXCEPTION 'Invalid tracked cash movement.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_investment_history_record BEFORE INSERT OR UPDATE OR DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_investment_history_record();

-- Existing balances are observed today, not invented historical purchase values.
INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage)
 SELECT user_id,id,'baseline',(now() AT TIME ZONE 'Asia/Tashkent')::date,
 amount*CASE WHEN kind IN ('Stock','Crypto') THEN quantity ELSE 1 END,
 CASE WHEN kind='Business' THEN ownership_percentage ELSE 100 END
 FROM public.finance_records WHERE kind IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt');

CREATE FUNCTION public.record_investment_event(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.investment_history; last_date date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_id IS NULL OR p_record_id IS NULL OR p_type IS NULL OR p_date IS NULL OR p_amount IS NULL OR p_notes IS NULL
 OR p_type NOT IN ('valuation','contribution','withdrawal','income','expense') OR p_amount<0 OR p_amount>1e15
 OR p_date>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(p_notes)>2000
 OR (p_type IN ('valuation','contribution','withdrawal') AND (p_balance IS NULL OR p_balance<0 OR p_balance>1e15))
 OR (p_type IN ('income','expense') AND p_balance IS NOT NULL) OR (p_type<>'valuation' AND p_amount<=0)
 OR (p_type='valuation' AND p_amount<>0) THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.kind NOT IN ('Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan','Debt') THEN RAISE EXCEPTION 'Investment not found.'; END IF;
 IF r.kind='Mortgage' AND p_type<>'valuation' THEN RAISE EXCEPTION 'Use Record payment for mortgage payments.'; END IF;
 SELECT * INTO existing FROM public.investment_history WHERE id=p_id;
 IF FOUND THEN
  IF existing.user_id<>auth.uid() OR existing.record_id<>p_record_id OR existing.event_type<>p_type OR existing.occurred_on<>p_date OR existing.amount<>p_amount OR existing.balance IS DISTINCT FROM p_balance OR existing.notes<>p_notes THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT max(occurred_on) INTO last_date FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL;
 INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,ownership_percentage,notes)
 VALUES(p_id,auth.uid(),r.id,p_type,p_date,p_amount,p_balance,CASE WHEN r.kind='Business' THEN r.ownership_percentage ELSE 100 END,p_notes);
 IF p_balance IS NOT NULL AND (last_date IS NULL OR p_date>=last_date) THEN
  IF r.kind IN ('Stock','Crypto') AND r.quantity=0 THEN RAISE EXCEPTION 'Set a quantity before recording a valuation.'; END IF;
  PERFORM set_config('finance.history_write','1',true);
  UPDATE public.finance_records SET amount=p_balance/CASE WHEN r.kind IN ('Stock','Crypto') THEN r.quantity ELSE 1 END WHERE id=r.id;
  PERFORM set_config('finance.history_write','0',true);
 END IF;
 IF p_type IN ('income','expense') THEN
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,business_id,history_event_id)
  VALUES(p_id,auth.uid(),r.name,CASE WHEN p_type='expense' THEN 'Other expense' WHEN r.kind='Property' THEN 'Rent income' ELSE 'Other income' END,r.currency,p_amount,p_date,'Once',p_notes,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END,p_id);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text) TO authenticated;

-- Capture the exact payment date and breakdown using the existing atomic payment flow.
CREATE FUNCTION public.capture_mortgage_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records;
BEGIN
 SELECT * INTO r FROM public.finance_records WHERE id=NEW.mortgage_id;
 INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,principal,interest,notes)
 VALUES(NEW.id,NEW.user_id,NEW.mortgage_id,'mortgage_payment',NEW.paid_on,NEW.principal+NEW.interest,CASE WHEN NEW.paid_on>=(SELECT max(occurred_on) FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL) THEN r.amount-NEW.principal ELSE NULL END,NEW.principal,NEW.interest,NEW.notes);
 -- The following balance update also records today's confirmed outstanding balance.
 RETURN NEW;
END $$;
CREATE TRIGGER capture_mortgage_history AFTER INSERT ON public.mortgage_payments FOR EACH ROW EXECUTE FUNCTION public.capture_mortgage_history();
INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,principal,interest,notes)
 SELECT id,user_id,mortgage_id,'mortgage_payment',paid_on,principal+interest,principal,interest,notes FROM public.mortgage_payments;
NOTIFY pgrst, 'reload schema';

COMMIT;
