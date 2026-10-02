-- Receipt and document attachments on transaction records.
-- * Files live in the private Storage bucket `attachments` at
--   `<owner>/<record>/<attachment>.<ext>`; record_attachments keeps one row per file.
-- * Up to 20 files of 10 MB each per record: JPEG, PNG, WebP, HEIC/HEIF or PDF.
-- * The rows have no foreign key to finance_records, so a transaction moved to
--   Recently deleted keeps its attachments and gets them back when restored.
--   Deleting it permanently removes the rows, and permanently_delete_item
--   returns their paths so the app removes the files.
-- * The storage policies are created only where Supabase Storage is installed.
-- Apply after 093.
BEGIN;

CREATE TABLE public.record_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 record_id uuid NOT NULL,
 path text NOT NULL UNIQUE,
 file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
 mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf')),
 size integer NOT NULL CHECK (size>0 AND size<=10485760),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT record_attachments_path CHECK (path=user_id::text||'/'||record_id::text||'/'||id::text||'.'||CASE mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'application/pdf' THEN 'pdf' ELSE 'heic' END)
);
CREATE INDEX record_attachments_owner_record ON public.record_attachments(user_id,record_id,created_at);
ALTER TABLE public.record_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read attachments" ON public.record_attachments FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Owners attach to their records" ON public.record_attachments FOR INSERT TO authenticated
 WITH CHECK (user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=record_id AND r.user_id=auth.uid()));
CREATE POLICY "Owners remove attachments" ON public.record_attachments FOR DELETE TO authenticated USING (user_id=auth.uid());
REVOKE ALL ON public.record_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.record_attachments TO authenticated;

CREATE FUNCTION public.limit_record_attachments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.record_id::text,94));
 IF (SELECT count(*) FROM public.record_attachments WHERE user_id=NEW.user_id AND record_id=NEW.record_id)>=20 THEN
  RAISE EXCEPTION 'A transaction can have up to 20 attachments.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_record_attachments() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER limit_record_attachments BEFORE INSERT ON public.record_attachments FOR EACH ROW EXECUTE FUNCTION public.limit_record_attachments();

-- Attachments whose record is neither active nor in Recently deleted are forgotten; their paths are returned for file removal.
CREATE FUNCTION public.forget_orphan_attachments(owner uuid) RETURNS text[] LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH gone AS (
  DELETE FROM public.record_attachments a WHERE a.user_id=owner
   AND NOT EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id=a.record_id AND r.user_id=owner)
   AND NOT EXISTS(SELECT 1 FROM public.deleted_items d WHERE d.user_id=owner AND d.source='finance_records' AND d.data->>'id'=a.record_id::text)
  RETURNING a.path)
 SELECT coalesce(array_agg(path ORDER BY path),'{}') FROM gone
$$;
REVOKE ALL ON FUNCTION public.forget_orphan_attachments(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.permanently_delete_item(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 DELETE FROM public.deleted_items WHERE id=p_id AND user_id=owner;
 RETURN jsonb_build_object('ok',true,'paths',to_jsonb(public.forget_orphan_attachments(owner)));
END $$;
REVOKE ALL ON FUNCTION public.permanently_delete_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_item(uuid) TO authenticated;

-- The private bucket and its policies: each owner reads, adds and removes files in their own folder only.
DO $storage$
BEGIN
 IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('attachments','attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
 ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
 DROP POLICY IF EXISTS "Owners read their attachments" ON storage.objects;
 DROP POLICY IF EXISTS "Owners upload attachments to their records" ON storage.objects;
 DROP POLICY IF EXISTS "Owners remove their attachments" ON storage.objects;
 CREATE POLICY "Owners read their attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
 CREATE POLICY "Owners upload attachments to their records" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attachments' AND (storage.foldername(name))[1]=auth.uid()::text
   AND EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id::text=(storage.foldername(objects.name))[2] AND r.user_id=auth.uid()));
 CREATE POLICY "Owners remove their attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
END $storage$;

NOTIFY pgrst,'reload schema';
COMMIT;
