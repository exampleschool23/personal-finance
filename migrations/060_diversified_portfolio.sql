-- Saved alongside comparison choices under the existing owner-only RLS policies.
ALTER TABLE public.investment_comparison_preferences
 ADD COLUMN portfolio jsonb CHECK (portfolio IS NULL OR jsonb_typeof(portfolio) = 'object');
