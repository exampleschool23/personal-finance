CREATE OR REPLACE FUNCTION public.lock_cash_investment_choice() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.is_investment IS DISTINCT FROM OLD.is_investment THEN
  RAISE EXCEPTION 'Investment inclusion is fixed when the account is created.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER lock_cash_investment_choice BEFORE UPDATE ON public.finance_records
FOR EACH ROW EXECUTE FUNCTION public.lock_cash_investment_choice();
