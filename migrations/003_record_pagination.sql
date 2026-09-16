-- Run after the lending-date and charity migrations.
-- SECURITY INVOKER preserves owner RLS; auth.uid() also scopes all operations.
CREATE OR REPLACE FUNCTION public.finance_records_page(
 p_page integer DEFAULT 1,
 p_section text DEFAULT 'all',
 p_currency text DEFAULT NULL,
 p_summary boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb; total bigint; page_number integer; page_rows jsonb; summaries jsonb;
BEGIN
 IF p_page < 1 OR p_page > 1000000 OR p_section NOT IN ('all','assets','cashflow','debts') OR (p_currency IS NOT NULL AND p_currency NOT IN ('USD','UZS')) THEN
  RAISE EXCEPTION 'Invalid pagination parameters';
 END IF;
 SELECT count(*) INTO total FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')));
 page_number := least(p_page, greatest(1, ceil(total / 20.0)::integer));
 SELECT coalesce(jsonb_agg(to_jsonb(p) - 'user_id' - 'created_at' ORDER BY p.sort_date DESC NULLS LAST, p.id DESC),'[]'::jsonb) INTO page_rows FROM (
 SELECT r.*, CASE WHEN r.kind='Money lent' THEN coalesce(r.lent_date,r.date) ELSE r.date END AS sort_date FROM public.finance_records r WHERE r.user_id=auth.uid()
 AND (p_currency IS NULL OR r.currency=p_currency)
 AND (p_section='all' OR (p_section='assets' AND r.kind IN ('Cash','Stock','Crypto','Deposit','Property','Money lent')) OR (p_section='debts' AND r.kind IN ('Mortgage','Loan','Debt')) OR (p_section='cashflow' AND r.kind IN ('Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')))
 ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT 20 OFFSET (page_number-1)*20
 ) p;
 result := jsonb_build_object('records',page_rows,'total',total,'page',page_number,'pageSize',20);
 IF p_summary THEN
  -- Compact grouped valuation data; notes, dates, and individual transactions stay paginated.
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO summaries FROM (
   SELECT min(r.id::text) AS id, min(trim(r.name)) AS name, r.kind,r.currency,r.frequency,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.amount*r.quantity)/nullif(sum(r.quantity),0),0) ELSE sum(r.amount) END AS amount,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN sum(r.quantity) ELSE 1 END AS quantity,
   CASE WHEN r.kind IN ('Stock','Crypto') THEN coalesce(sum(r.cost*r.quantity)/nullif(sum(r.quantity),0),0) ELSE 0 END AS cost,
   0 AS rate, '' AS date, '' AS notes, count(*) AS record_count
   FROM public.finance_records r WHERE r.user_id=auth.uid()
   GROUP BY lower(regexp_replace(trim(r.name),'\s+',' ','g')),r.kind,r.currency,r.frequency
  ) g;
  result := result || jsonb_build_object('summary',summaries);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_records_page(integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_records_page(integer,text,text,boolean) TO authenticated;
CREATE INDEX IF NOT EXISTS finance_records_user_sort_date ON public.finance_records (user_id,(CASE WHEN kind='Money lent' THEN coalesce(lent_date,date) ELSE date END) DESC,id DESC);
NOTIFY pgrst, 'reload schema';
