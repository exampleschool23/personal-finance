-- Owners keep one or two preferred currencies; the top bar switches between
-- them and record currency choices offer only these. Longer lists keep their
-- first two entries, primary first. Records and their currencies are unchanged.
-- Apply after 073.
BEGIN;
UPDATE public.user_preferences SET currencies = currencies[1:2] WHERE cardinality(currencies) > 2;
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_currencies_limit;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_currencies_limit CHECK (cardinality(currencies) <= 2);
NOTIFY pgrst,'reload schema';
COMMIT;
