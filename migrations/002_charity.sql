-- Allow charity donations as an expense category.
BEGIN;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_kind_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_kind_check
CHECK (kind IN ('Cash','Stock','Crypto','Deposit','Property','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'));
COMMIT;
NOTIFY pgrst, 'reload schema';
