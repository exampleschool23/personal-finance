-- Category icons. Apply after 113.
-- The icon chosen for each category is a shared workspace preference
-- ('category_icons'), so everyone in a household sees the same icons.
-- No rows are rewritten.
BEGIN;

ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order','business_order','tag_order','tax_lines','category_icons'));

NOTIFY pgrst,'reload schema';
COMMIT;
