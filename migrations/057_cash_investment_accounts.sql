ALTER TABLE public.holding_accounts DROP CONSTRAINT holding_accounts_kind_check;
ALTER TABLE public.holding_accounts ADD CONSTRAINT holding_accounts_kind_check CHECK(kind IN ('Cash','Stock','Crypto'));
