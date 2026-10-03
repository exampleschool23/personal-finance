-- Subscriptions: what the owner decided about a subscription detected from their charges.
-- * Detection itself runs on recorded transactions; only the decision is stored.
-- * One row per merchant (as normalised by the app) and currency.
-- * 'dismissed' means "Not a subscription"; 'cancelled' hides it until it is charged after decided_on.
-- * Removing the row restores the subscription. Records are never changed.
-- Apply after 093.
BEGIN;

CREATE TABLE public.subscription_decisions (
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 merchant text NOT NULL CHECK (length(btrim(merchant)) BETWEEN 1 AND 120),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 status text NOT NULL CHECK (status IN ('dismissed','cancelled')),
 decided_on date NOT NULL DEFAULT current_date,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,merchant,currency)
);
ALTER TABLE public.subscription_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage subscription decisions" ON public.subscription_decisions FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.subscription_decisions FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.subscription_decisions TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
