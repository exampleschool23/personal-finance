BEGIN;
-- Only the trusted server may re-register an externally authenticated backup.
-- The server verifies its HMAC and passes the signed-in owner's ID. Ordinary
-- authenticated RPC callers can never certify arbitrary JSON this way.
CREATE FUNCTION public.register_verified_finance_backup(p_backup text,p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE backup jsonb; tbl text; fingerprint text;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner) OR octet_length(p_backup)>20000000 THEN RAISE EXCEPTION 'Invalid backup owner or size.'; END IF;
 backup:=p_backup::jsonb;
 IF backup->>'version' IS DISTINCT FROM '2' OR backup->>'schema_version' IS DISTINCT FROM '59' OR backup->>'owner_id' IS DISTINCT FROM p_owner::text OR backup->>'id' IS NULL THEN RAISE EXCEPTION 'Use an unchanged verified backup downloaded from this account.'; END IF;
 FOREACH tbl IN ARRAY public.finance_backup_tables() LOOP
  IF jsonb_typeof(backup->'tables'->tbl) IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(backup->'tables'->tbl) r WHERE r->>'user_id' IS DISTINCT FROM p_owner::text) THEN RAISE EXCEPTION 'The backup contains invalid owner data.'; END IF;
 END LOOP;
 fingerprint:=encode(sha256(convert_to(backup::text,'UTF8')),'hex');
 INSERT INTO public.backup_manifests(id,user_id,digest) VALUES((backup->>'id')::uuid,p_owner,fingerprint)
 ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.backup_manifests WHERE id=(backup->>'id')::uuid AND user_id=p_owner AND digest=fingerprint) THEN RAISE EXCEPTION 'The backup identifier is already in use.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.register_verified_finance_backup(text,uuid) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT EXECUTE ON FUNCTION public.register_verified_finance_backup(text,uuid) TO service_role;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
