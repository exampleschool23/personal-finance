-- Apply after 129.
-- Emptying a transaction from Recently deleted removes its receipt files before their rows. Until now the rows were
-- deleted with the item and only the paths came back, so a storage failure left files nothing pointed to.
-- permanently_delete_item now returns the paths of attachments whose record is gone for good and keeps their rows;
-- the app removes the files and then calls forget_attachments for those paths. When the removal fails the rows stay,
-- and the next purge returns them again. Re-runnable; no existing rows change.
BEGIN;

CREATE OR REPLACE FUNCTION public.orphan_attachment_paths(owner uuid) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(array_agg(a.path ORDER BY a.path),'{}') FROM public.record_attachments a WHERE a.user_id=owner
  AND NOT EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=a.record_id AND r.user_id=owner)
  AND NOT EXISTS(SELECT 1 FROM public.deleted_items d WHERE d.user_id=owner AND d.source='finance_records' AND d.data->>'id'=a.record_id::text)
$$;
REVOKE ALL ON FUNCTION public.orphan_attachment_paths(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.permanently_delete_item(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 DELETE FROM public.deleted_items WHERE id=p_id AND user_id=owner;
 RETURN jsonb_build_object('ok',true,'paths',to_jsonb(public.orphan_attachment_paths(owner)));
END $$;
REVOKE ALL ON FUNCTION public.permanently_delete_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_item(uuid) TO authenticated;

-- Forgets attachments whose files were removed. Only rows of the open workspace whose record is gone for good.
CREATE OR REPLACE FUNCTION public.forget_attachments(p_paths text[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); forgotten integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_paths IS NULL OR cardinality(p_paths)>5000 THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 DELETE FROM public.record_attachments a WHERE a.user_id=owner AND a.path=ANY(p_paths)
  AND a.path=ANY(public.orphan_attachment_paths(owner));
 GET DIAGNOSTICS forgotten=ROW_COUNT;
 RETURN forgotten;
END $$;
REVOKE ALL ON FUNCTION public.forget_attachments(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forget_attachments(text[]) TO authenticated;

DROP FUNCTION IF EXISTS public.forget_orphan_attachments(uuid);

CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',130,'record_revisions',true,'verified_restore',true)
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
