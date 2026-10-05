-- Archive on Recurring. Apply after 110.
-- An archived income, bill or spending plan leaves Recurring, budgets and
-- forecasts; its recorded payments and spending stay. Restoring it brings the
-- schedule back as it was. No rows are rewritten.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.expense_plans ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

NOTIFY pgrst,'reload schema';
COMMIT;
