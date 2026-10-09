-- Deleting a category moves its budget too. Apply after 126.
-- A budget names its category by key (a built-in kind or a category id). Deleting a
-- category moved its transactions to the replacement but left the budget amounts,
-- rollover fund and settings under a key no category has: the budget disappeared
-- and the replacement got none. Now, in the same transaction:
-- * with a replacement, each month's budget becomes the sum of both categories'
--   budgets for that month (the replacement's own amount where the two are in
--   different currencies; no rate is inferred), and a rollover fund in the same
--   currency adds to the replacement's; the replacement keeps its own settings;
-- * without one, the deleted category's budget rows go with it.
-- Existing orphaned rows are left as they are.
BEGIN;

-- Internal: called only by the two delete functions, which check the owner first.
CREATE OR REPLACE FUNCTION public.merge_budget_category(p_owner uuid,p_from text,p_to text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE merged public.budget_amounts[]; source public.budget_categories; target public.budget_categories;
BEGIN
 IF p_owner IS NULL OR p_from IS NULL OR p_from IS NOT DISTINCT FROM p_to THEN RETURN; END IF;
 IF p_to IS NOT NULL THEN
  -- Every month where either budget changes: each saved month, and the month after a
  -- one-month amount, when the earlier forward amount (or none) applies again.
  WITH keyed AS (
   SELECT * FROM public.budget_amounts WHERE user_id=p_owner AND category_key IN (p_from,p_to)
  ), points AS (
   SELECT month FROM keyed UNION SELECT (month+interval '1 month')::date FROM keyed WHERE NOT applies_forward
  ), totals AS (
   -- The amount in effect: the one saved for that month, or else the latest forward one before it (budgetAmountFor).
   SELECT p.month, f.amount AS f_amount, f.currency AS f_currency, t.amount AS t_amount, t.currency AS t_currency
   FROM points p
   LEFT JOIN LATERAL (SELECT k.amount,k.currency FROM keyed k WHERE k.category_key=p_from AND (k.month=p.month OR (k.month<p.month AND k.applies_forward)) ORDER BY k.month=p.month DESC,k.month DESC LIMIT 1) f ON true
   LEFT JOIN LATERAL (SELECT k.amount,k.currency FROM keyed k WHERE k.category_key=p_to AND (k.month=p.month OR (k.month<p.month AND k.applies_forward)) ORDER BY k.month=p.month DESC,k.month DESC LIMIT 1) t ON true
  )
  SELECT coalesce(array_agg(ROW(p_owner,p_to,x.month,
    CASE WHEN x.t_amount IS NULL THEN x.f_amount WHEN x.f_amount IS NULL OR x.f_currency<>x.t_currency THEN x.t_amount ELSE least(x.f_amount+x.t_amount,1e15) END,
    coalesce(x.t_currency,x.f_currency),
    -- Forward until the next change; a month followed by one without any budget covers only itself.
    NOT EXISTS(SELECT 1 FROM totals n WHERE n.month=(x.month+interval '1 month')::date AND n.f_amount IS NULL AND n.t_amount IS NULL)
   )::public.budget_amounts ORDER BY x.month),'{}')
  INTO merged FROM totals x WHERE x.f_amount IS NOT NULL OR x.t_amount IS NOT NULL;
  DELETE FROM public.budget_amounts WHERE user_id=p_owner AND category_key IN (p_from,p_to);
  INSERT INTO public.budget_amounts SELECT * FROM unnest(merged);

  SELECT * INTO source FROM public.budget_categories WHERE user_id=p_owner AND category_key=p_from FOR UPDATE;
  SELECT * INTO target FROM public.budget_categories WHERE user_id=p_owner AND category_key=p_to FOR UPDATE;
  IF source.category_key IS NOT NULL AND target.category_key IS NULL THEN
   UPDATE public.budget_categories SET category_key=p_to,updated_at=now() WHERE user_id=p_owner AND category_key=p_from;
   RETURN;
  END IF;
  IF source.rollover AND target.rollover AND source.rollover_balance>0 AND (target.rollover_balance=0 OR target.rollover_currency=source.rollover_currency) THEN
   UPDATE public.budget_categories SET rollover_balance=least(target.rollover_balance+source.rollover_balance,1e15),rollover_currency=source.rollover_currency,updated_at=now()
    WHERE user_id=p_owner AND category_key=p_to;
  END IF;
 END IF;
 DELETE FROM public.budget_amounts WHERE user_id=p_owner AND category_key=p_from;
 DELETE FROM public.budget_categories WHERE user_id=p_owner AND category_key=p_from;
END $$;
REVOKE ALL ON FUNCTION public.merge_budget_category(uuid,text,text) FROM PUBLIC,anon,authenticated;

-- Both delete functions call it just before the category goes. Their bodies are
-- patched in place, so the owner checks they already have (migration 100) stay.
DO $$
DECLARE fn record; patched text;
BEGIN
 FOR fn IN SELECT p.oid, p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('delete_transaction_category','delete_built_in_category') LOOP
  CONTINUE WHEN fn.prosrc LIKE '%merge_budget_category%';
  IF fn.proname='delete_transaction_category' THEN
   patched:=replace(pg_get_functiondef(fn.oid),' DELETE FROM public.transaction_categories WHERE id=p_category AND user_id=owner;',
    ' PERFORM public.merge_budget_category(owner,p_category::text,target::text);'||chr(10)||' DELETE FROM public.transaction_categories WHERE id=p_category AND user_id=owner;');
  ELSE
   patched:=replace(pg_get_functiondef(fn.oid),' INSERT INTO public.workspace_preferences(user_id,key,data) VALUES(owner,''removed_categories''',
    ' PERFORM public.merge_budget_category(owner,p_kind,target::text);'||chr(10)||' INSERT INTO public.workspace_preferences(user_id,key,data) VALUES(owner,''removed_categories''');
  END IF;
  IF patched=pg_get_functiondef(fn.oid) THEN RAISE EXCEPTION 'Could not update %; apply the earlier migrations first.',fn.proname; END IF;
  EXECUTE patched;
 END LOOP;
END $$;

-- The capability version moves to 127, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',127,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
