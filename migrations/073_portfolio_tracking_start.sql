-- The owner may choose the day portfolio tracking begins. The Overview chart,
-- its "All history" period and its summary figures start there, and benchmarks
-- start from the investment value recorded on that day. Null keeps the
-- default: tracking from the first investment activity.
-- Apply after 072. No existing rows are rewritten.
BEGIN;
ALTER TABLE public.investment_comparison_preferences
 ADD COLUMN IF NOT EXISTS tracking_start date CHECK (tracking_start IS NULL OR tracking_start >= DATE '2016-01-01');
NOTIFY pgrst,'reload schema';
COMMIT;
