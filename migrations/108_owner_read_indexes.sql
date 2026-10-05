-- Owner read indexes for large accounts. Apply after 107.
-- The planning read (lib/server-records.ts) reads each owner table in id order,
-- 500 rows after the last id it has. These tables had no index starting with
-- user_id, so every page scanned the whole table, every owner's rows included.
-- * (user_id,id) lets each page be one index range in id order.
-- * account_activity also gets (user_id,occurred_on) for the month-limited
--   reads of the monthly review and the budget.
-- Indexes only: no rows, policies or functions change.
BEGIN;

CREATE INDEX IF NOT EXISTS account_activity_owner_id ON public.account_activity(user_id,id);
CREATE INDEX IF NOT EXISTS account_activity_owner_date ON public.account_activity(user_id,occurred_on);
CREATE INDEX IF NOT EXISTS payment_occurrences_owner_id ON public.payment_occurrences(user_id,id);
CREATE INDEX IF NOT EXISTS investment_account_links_owner_id ON public.investment_account_links(user_id,id);
CREATE INDEX IF NOT EXISTS mortgage_payments_owner_id ON public.mortgage_payments(user_id,id);
CREATE INDEX IF NOT EXISTS savings_goals_owner_id ON public.savings_goals(user_id,id);
CREATE INDEX IF NOT EXISTS transaction_categories_owner_id ON public.transaction_categories(user_id,id);

ANALYZE public.account_activity,public.payment_occurrences,public.investment_account_links,public.mortgage_payments,public.savings_goals,public.transaction_categories;

NOTIFY pgrst,'reload schema';
COMMIT;
