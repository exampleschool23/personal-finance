-- Each owner may link one Telegram chat. The app sends a morning digest of
-- upcoming payments and a message after every saved action to that chat, and
-- the bot lets the owner add records with buttons. A short-lived link code
-- created in Settings ties the chat to the owner when they press Start.
-- Chat links are personal to the device, so they are not part of backups.
-- Apply after 074. No existing rows are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_subscriptions (
 user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 chat_id bigint UNIQUE,
 digest_enabled boolean NOT NULL DEFAULT true,
 actions_enabled boolean NOT NULL DEFAULT true,
 link_code text UNIQUE CHECK (link_code IS NULL OR link_code ~ '^[A-Z0-9]{8}$'),
 link_code_expires_at timestamptz,
 linked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage telegram subscription" ON public.telegram_subscriptions;
CREATE POLICY "Owners manage telegram subscription" ON public.telegram_subscriptions FOR ALL TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.telegram_subscriptions FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_subscriptions TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
