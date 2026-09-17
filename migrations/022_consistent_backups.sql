-- Read the whole owner backup from one PostgreSQL snapshot, without row limits.
BEGIN;
CREATE FUNCTION public.export_finance_backup() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 RETURN jsonb_build_object('version',1,'exported_at',now(),'tables',jsonb_build_object(
  'finance_records',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.finance_records r WHERE r.user_id=auth.uid()),
  'investment_history',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_history r WHERE r.user_id=auth.uid()),
  'investment_account_links',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_account_links r WHERE r.user_id=auth.uid()),
  'mortgage_payments',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.mortgage_payments r WHERE r.user_id=auth.uid()),
  'expense_plans',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.expense_plans r WHERE r.user_id=auth.uid()),
  'expense_plan_versions',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.expense_plan_versions r WHERE r.user_id=auth.uid()),
  'custom_categories',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.custom_categories r WHERE r.user_id=auth.uid()),
  'savings_goals',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.savings_goals r WHERE r.user_id=auth.uid()),
  'account_activity',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.account_activity r WHERE r.user_id=auth.uid()),
  'payment_occurrences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.payment_occurrences r WHERE r.user_id=auth.uid()),
  'deleted_items',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.deleted_items r WHERE r.user_id=auth.uid()),
  'user_preferences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.user_preferences r WHERE r.user_id=auth.uid()),
  'user_app_activity',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.user_app_activity r WHERE r.user_id=auth.uid()),
  'investment_comparison_preferences',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_comparison_preferences r WHERE r.user_id=auth.uid()),
  'investment_comparison_baselines',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.investment_comparison_baselines r WHERE r.user_id=auth.uid()),
  'portfolio_snapshots',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.portfolio_snapshots r WHERE r.user_id=auth.uid())
 ));
END $$;
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
