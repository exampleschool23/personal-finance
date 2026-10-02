-- Dashboard layout: the order of the dashboard cards and which are hidden,
-- saved as a workspace preference. Apply after 087. No rows are changed.
BEGIN;
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard'));
NOTIFY pgrst,'reload schema';
COMMIT;
