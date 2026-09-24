BEGIN;
CREATE INDEX finance_records_owner_actual_date ON public.finance_records(user_id,date DESC,id) WHERE frequency='Once';
CREATE FUNCTION public.transaction_history_page(p_page integer DEFAULT 1,p_currency text DEFAULT NULL,p_query text DEFAULT '',p_category text DEFAULT 'all',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_order text DEFAULT 'newest') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_page IS NULL OR p_page<1 OR p_page>1000000 OR p_order IS NULL OR p_order NOT IN('newest','oldest','name') OR length(p_query)>200 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to) THEN RAISE EXCEPTION 'Invalid history filters.'; END IF;
 WITH matching AS MATERIALIZED (
 SELECT r.* FROM public.finance_records r WHERE r.user_id=auth.uid() AND r.frequency='Once'
 AND r.kind IN('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_category='all' OR r.kind=p_category OR r.custom_category_id::text=p_category)
 AND (p_from IS NULL OR r.date>=p_from) AND (p_to IS NULL OR r.date<=p_to)
 AND (trim(p_query)='' OR strpos(lower(r.name||' '||r.notes),lower(trim(p_query)))>0)
 ), pagination AS (
  SELECT count(*)::integer AS total,least(p_page,greatest(1,(count(*)::integer+9)/10)) AS page FROM matching
 ), items AS (
  SELECT r.*,row_number() OVER(ORDER BY CASE WHEN p_order='name' THEN lower(r.name) END ASC,CASE WHEN p_order='oldest' THEN r.date END ASC NULLS LAST,CASE WHEN p_order='newest' THEN r.date END DESC NULLS LAST,r.id ASC) AS position
  FROM matching r ORDER BY position LIMIT 10 OFFSET ((SELECT page FROM pagination)-1)*10
 )
 SELECT jsonb_build_object('records',(SELECT coalesce(jsonb_agg(to_jsonb(items)-'position' ORDER BY position),'[]') FROM items),'total',total,'page',page) INTO result FROM pagination;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.transaction_history_page(integer,text,text,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transaction_history_page(integer,text,text,text,date,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',64,'record_revisions',true,'verified_restore',true)
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
