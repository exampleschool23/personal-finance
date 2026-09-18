-- Remove only the owner's recovery snapshot; active records and balances stay unchanged.
BEGIN;
CREATE FUNCTION public.permanently_delete_item(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 DELETE FROM public.deleted_items WHERE id=p_id AND user_id=owner;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.permanently_delete_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_item(uuid) TO authenticated;
COMMIT;
