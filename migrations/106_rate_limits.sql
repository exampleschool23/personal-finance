-- Rate limits shared by every server instance: sign-in, phone codes, account changes, the assistant and
-- the public market reads (lib/rate-limit.ts). A fixed-window counter per bucket; buckets name a limit and
-- a hashed client address, email, phone or user, never the raw value. Only the server-only key may count:
-- the table has row security and no policies, and nobody else may read it or call the function.
-- Apply after 105. Nothing existing changes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.rate_limits(
 bucket text NOT NULL CHECK(length(bucket) BETWEEN 1 AND 200),
 window_seconds integer NOT NULL CHECK(window_seconds BETWEEN 1 AND 604800),
 window_start timestamptz NOT NULL,
 hits integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(bucket,window_seconds,window_start)
);
CREATE INDEX IF NOT EXISTS rate_limits_expires_at ON public.rate_limits(expires_at);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC,anon,authenticated;

-- Counts one hit and answers whether it is within the limit: true while the window has at most max_hits.
-- Expired windows are pruned on the way.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(bucket text,max_hits integer,window_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE started timestamptz; counted integer;
BEGIN
 IF bucket IS NULL OR length(bucket) NOT BETWEEN 1 AND 200 OR max_hits IS NULL OR max_hits<1 OR window_seconds IS NULL OR window_seconds NOT BETWEEN 1 AND 604800 THEN
  RAISE EXCEPTION 'Check the rate limit.' USING ERRCODE='22023';
 END IF;
 started:=pg_catalog.to_timestamp(pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.now())/window_seconds)*window_seconds);
 DELETE FROM public.rate_limits r WHERE r.expires_at<=pg_catalog.now();
 INSERT INTO public.rate_limits AS r(bucket,window_seconds,window_start,hits,expires_at)
  VALUES(hit_rate_limit.bucket,hit_rate_limit.window_seconds,started,1,started+pg_catalog.make_interval(secs=>hit_rate_limit.window_seconds))
  ON CONFLICT ON CONSTRAINT rate_limits_pkey DO UPDATE SET hits=least(r.hits+1,2147483646)
  RETURNING r.hits INTO counted;
 RETURN counted<=max_hits;
END $$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text,integer,integer) TO service_role;
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
