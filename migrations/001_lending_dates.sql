-- Existing date values remain due dates. Unknown historical lending dates stay null.
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS lent_date date;
ALTER TABLE public.finance_records ALTER COLUMN date DROP NOT NULL;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_required_date;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_required_date CHECK (kind = 'Money lent' OR date IS NOT NULL);
NOTIFY pgrst, 'reload schema';
