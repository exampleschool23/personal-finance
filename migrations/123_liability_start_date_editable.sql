-- Loan, debt and mortgage start dates can be set or corrected. Apply after 122.
-- A loan's monthly payment falls on its start date's day of the month. The
-- start date was fixed once saved, so a mortgage saved without one (or with the
-- wrong one) kept its payments on the day it was added, and nothing could move
-- them. It can now change, as long as no recorded payment, repayment or tracker
-- update comes before the new date; it cannot be cleared. The record's first
-- tracked value (its baseline) moves with it, as money lent's does (117).
-- Opening dates of cash and holdings stay fixed; a restore still passes through.
-- No balances change.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_opening_balance_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NEW.opened_on IS NOT NULL AND (NEW.kind NOT IN ('Cash','Deposit','Treasury bill','Bond','Stock','Crypto','Precious metals','Equity compensation','Debt','Loan','Mortgage') OR NEW.opened_on>(now() AT TIME ZONE 'Asia/Tashkent')::date) THEN
  RAISE EXCEPTION 'Check the opening balance date.';
 END IF;
 IF NEW.kind IN ('Debt','Loan','Mortgage') AND NEW.opened_on IS NOT NULL AND NEW.date<NEW.opened_on THEN
  RAISE EXCEPTION 'Check the start and due dates.';
 END IF;
 IF TG_OP='UPDATE' AND NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN
  IF OLD.kind NOT IN ('Debt','Loan','Mortgage') THEN RAISE EXCEPTION 'The opening balance date cannot change after creation.'; END IF;
  IF NEW.opened_on IS NULL OR NEW.kind<>OLD.kind THEN RAISE EXCEPTION 'The start date cannot change after creation.'; END IF;
  IF EXISTS(SELECT 1 FROM public.mortgage_payments WHERE mortgage_id=NEW.id AND paid_on<NEW.opened_on)
   OR EXISTS(SELECT 1 FROM public.account_activity WHERE target_id=NEW.id AND occurred_on<NEW.opened_on)
   OR EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=NEW.id AND event_type<>'baseline' AND occurred_on<NEW.opened_on) THEN
   RAISE EXCEPTION 'The start date cannot be after a recorded payment.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_opening_balance_date() FROM PUBLIC,anon,authenticated;

-- The baseline follows a changed start date while it stays the record's first event.
CREATE OR REPLACE FUNCTION public.date_liability_baseline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind NOT IN ('Debt','Loan','Mortgage') OR NEW.opened_on IS NULL OR NEW.opened_on IS NOT DISTINCT FROM OLD.opened_on THEN RETURN NEW; END IF;
 IF public.finance_restore_active() OR current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 UPDATE public.investment_history h SET occurred_on=NEW.opened_on
 WHERE h.record_id=NEW.id AND h.event_type='baseline' AND h.occurred_on<>NEW.opened_on
  AND NOT EXISTS(SELECT 1 FROM public.investment_history o WHERE o.record_id=NEW.id AND o.id<>h.id AND o.occurred_on<NEW.opened_on);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.date_liability_baseline() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS date_liability_baseline ON public.finance_records;
CREATE TRIGGER date_liability_baseline AFTER UPDATE OF opened_on ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.date_liability_baseline();

NOTIFY pgrst,'reload schema';
COMMIT;
