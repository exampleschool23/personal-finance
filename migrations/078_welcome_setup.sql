-- Owners who finished or skipped the welcome setup that runs after the first
-- sign-in. Accounts that already saved preferences count as set up, so only
-- new sign-ups see it; Settings can run it again by clearing the timestamp.
-- Apply after 077.
BEGIN;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
UPDATE public.user_preferences SET onboarded_at=now() WHERE onboarded_at IS NULL;
NOTIFY pgrst,'reload schema';
COMMIT;
