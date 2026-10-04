-- Launch hardening from the pre-launch database review. Apply after 106.
-- * A signed-in person could still write any chat_id into their own Telegram
--   row (column grants left from the link-code era), and so take over another
--   person's bot chat. Chats are now linked only by the server; the app may
--   still change notification switches and unlink (chat_id back to null).
-- * Tables written only through functions lose direct write grants, and anon
--   loses the grants Supabase's defaults gave it. RLS already refused these
--   writes; this removes the second line of reliance on policies.
-- * Attachment uploads must use the exact path the server hands out
--   (owner/record/file.ext), so storage cannot be filled with stray files.
-- * An investment account's owner (member_id) must be the workspace owner or
--   one of its household members, as finance_records already enforces.
-- * finance_restore_context gets RLS like every other table (all grants were
--   already revoked).
-- No rows are rewritten.
BEGIN;

REVOKE INSERT, UPDATE ON public.telegram_subscriptions FROM authenticated;
GRANT UPDATE (digest_enabled, actions_enabled, chat_id, linked_at, updated_at) ON public.telegram_subscriptions TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_telegram_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 -- Only the server (service role) links a chat. People may unlink their own.
 IF current_user IN ('authenticated','anon')
  AND ((NEW.chat_id IS NOT NULL AND NEW.chat_id IS DISTINCT FROM OLD.chat_id)
   OR (NEW.linked_at IS NOT NULL AND NEW.linked_at IS DISTINCT FROM OLD.linked_at)) THEN
  RAISE EXCEPTION 'Telegram chats are linked from the bot.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_telegram_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_telegram_link ON public.telegram_subscriptions;
CREATE TRIGGER guard_telegram_link BEFORE UPDATE ON public.telegram_subscriptions FOR EACH ROW EXECUTE FUNCTION public.guard_telegram_link();

REVOKE ALL ON public.forecast_assignments, public.goal_events, public.goal_operations, public.import_batches,
 public.import_batch_items, public.transaction_splits, public.workspace_preferences FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.goal_events, public.goal_operations, public.import_batches,
 public.import_batch_items, public.transaction_splits, public.forecast_assignments FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

DO $storage$
BEGIN
 IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
 DROP POLICY IF EXISTS "Owners upload attachments to their records" ON storage.objects;
 CREATE POLICY "Owners upload attachments to their records" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attachments'
   AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|pdf)$'
   AND public.attachment_record_writable((storage.foldername(name))[1],(storage.foldername(name))[2]));
END $storage$;

CREATE OR REPLACE FUNCTION public.attribute_holding_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF NEW.member_id IS NOT NULL AND NEW.member_id<>NEW.user_id AND (TG_OP='INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id)
  AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=NEW.user_id AND member_id=NEW.member_id) THEN
  -- Someone outside the household is not named.
  NEW.member_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.attribute_holding_account() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS attribute_holding_account ON public.holding_accounts;
CREATE TRIGGER attribute_holding_account BEFORE INSERT OR UPDATE OF member_id,user_id ON public.holding_accounts FOR EACH ROW EXECUTE FUNCTION public.attribute_holding_account();

ALTER TABLE public.finance_restore_context ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst,'reload schema';
COMMIT;
