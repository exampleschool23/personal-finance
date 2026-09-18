BEGIN;
CREATE TABLE public.workspace_preferences (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 key text NOT NULL CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=65536),
 PRIMARY KEY(user_id,key)
);
ALTER TABLE public.workspace_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_preferences ON public.workspace_preferences FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_preferences TO authenticated;
ALTER FUNCTION public.export_finance_backup() RENAME TO export_finance_backup_before_workspace_preferences;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb:=public.export_finance_backup_before_workspace_preferences();
BEGIN
 RETURN jsonb_set(result,'{tables,workspace_preferences}',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.workspace_preferences r));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
