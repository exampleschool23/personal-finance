-- The app now offers thirty interface languages. Existing rows keep the
-- language they saved; only the list of allowed values grows.
-- Apply after 079.
BEGIN;
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_language_check;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_language_check
 CHECK (language IN ('en','es','es-MX','pt','fr','ru','ar','ur','hi','bn','zh','ja','ko','th','vi','uz','de','it','tr','id','ms','pl','uk','nl','cs','ro','fa','he','fil','sw'));
NOTIFY pgrst,'reload schema';
COMMIT;
