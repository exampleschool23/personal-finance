BEGIN;
-- Display order uses the existing owner-scoped preference storage and backup.
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check
 CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order'));
COMMIT;
