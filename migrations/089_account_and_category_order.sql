-- Accounts and categories keep the order the person drags them into, saved as
-- workspace preferences. New or renamed categories may not repeat another
-- category of the same type, or a built-in one, ignoring letter case; existing
-- duplicates are left as they are. Apply after 088. No rows are changed.
BEGIN;
ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order'));

CREATE OR REPLACE FUNCTION public.reject_duplicate_category_name() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE builtin text[]:=CASE NEW.direction WHEN 'income' THEN ARRAY['salary','rent income','business income','other income'] ELSE ARRAY['rent expense','living expense','charity','other expense'] END;
BEGIN
 -- A backup restore brings back the rows exactly as they were saved.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND lower(trim(NEW.name))=lower(trim(OLD.name)) AND NEW.direction=OLD.direction THEN RETURN NEW; END IF;
 IF lower(trim(NEW.name))=ANY(builtin) OR EXISTS(SELECT 1 FROM public.transaction_categories c WHERE c.user_id=NEW.user_id AND c.direction=NEW.direction AND c.id<>NEW.id AND lower(trim(c.name))=lower(trim(NEW.name))) THEN
  RAISE EXCEPTION 'A category with this name already exists.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reject_duplicate_category_name ON public.transaction_categories;
CREATE TRIGGER reject_duplicate_category_name BEFORE INSERT OR UPDATE OF name,direction ON public.transaction_categories FOR EACH ROW EXECUTE FUNCTION public.reject_duplicate_category_name();
NOTIFY pgrst,'reload schema';
COMMIT;
