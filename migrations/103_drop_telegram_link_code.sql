-- Telegram chats link only by sharing a phone number in the bot or by signing
-- in on the web from the bot. The Settings code that travelled in "/start CODE"
-- is gone, so its columns (and their column grants) go too.
BEGIN;
ALTER TABLE public.telegram_subscriptions DROP COLUMN IF EXISTS link_code, DROP COLUMN IF EXISTS link_code_expires_at;
NOTIFY pgrst,'reload schema';
COMMIT;
