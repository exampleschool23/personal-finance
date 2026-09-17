-- Keep the borrowing/start date separate from the existing due date.
-- Existing unknown dates and recorded history are intentionally not backfilled.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_opening_balance_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.opened_on IS NOT NULL AND (NEW.kind NOT IN ('Cash','Deposit','Stock','Crypto','Debt','Loan','Mortgage') OR NEW.opened_on>(now() AT TIME ZONE 'Asia/Tashkent')::date) THEN
  RAISE EXCEPTION 'Check the opening balance date.';
 END IF;
 IF NEW.kind IN ('Debt','Loan','Mortgage') AND NEW.opened_on IS NOT NULL AND NEW.date<NEW.opened_on THEN
  RAISE EXCEPTION 'Check the start and due dates.';
 END IF;
 IF TG_OP='UPDATE' AND NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN
  IF OLD.kind IN ('Debt','Loan','Mortgage') THEN RAISE EXCEPTION 'The start date cannot change after creation.'; END IF;
  RAISE EXCEPTION 'The opening balance date cannot change after creation.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER guard_opening_balance_date ON public.finance_records;
CREATE TRIGGER guard_opening_balance_date BEFORE INSERT OR UPDATE OF opened_on,date,kind ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.guard_opening_balance_date();
-- capture_investment_balance (025) already dates the opening snapshot with
-- opened_on, falling back to today only for records without a known start date.
CREATE FUNCTION public.guard_mortgage_start_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.paid_on<(SELECT opened_on FROM public.finance_records WHERE id=NEW.mortgage_id) THEN
  RAISE EXCEPTION 'Payment date cannot precede the start date.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_mortgage_start_date BEFORE INSERT ON public.mortgage_payments
 FOR EACH ROW EXECUTE FUNCTION public.guard_mortgage_start_date();
REVOKE ALL ON FUNCTION public.guard_mortgage_start_date() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
