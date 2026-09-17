-- One-time correction requested for the four named UZS plans.
-- Keeps the normal save_budget_plan start-date restriction unchanged.
BEGIN;

DO $$
DECLARE
  targets uuid[];
  owner_count integer;
  name_count integer;
BEGIN
  -- Lock the relevant tables so the checks and correction stay atomic.
  LOCK TABLE public.expense_plans, public.expense_plan_versions
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT array_agg(id), count(DISTINCT user_id), count(DISTINCT name)
  INTO targets, owner_count, name_count
  FROM public.expense_plans
  WHERE name IN ('Mum', 'Groceries', 'Dildora Wife', 'Monthly living cost');

  IF coalesce(cardinality(targets), 0) <> 4
     OR owner_count <> 1 OR name_count <> 4 THEN
    RAISE EXCEPTION 'Expected exactly four named plans belonging to one owner. Nothing changed.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_plans
    WHERE id = ANY(targets)
      AND (currency <> 'UZS' OR start_date NOT IN (DATE '2026-10-01', DATE '2026-09-01'))
  ) THEN
    RAISE EXCEPTION 'Unexpected currency or start date. Nothing changed.';
  END IF;

  -- Extend the original allowance to September; preserve later budget edits.
  INSERT INTO public.expense_plan_versions
    (plan_id, user_id, effective_month, amount, rollover)
  SELECT p.id, p.user_id, DATE '2026-09-01',
         coalesce(v.amount, p.amount), coalesce(v.rollover, false)
  FROM public.expense_plans p
  LEFT JOIN LATERAL (
    SELECT amount, rollover FROM public.expense_plan_versions
    WHERE plan_id = p.id AND user_id = p.user_id
      AND effective_month <= DATE '2026-10-01'
    ORDER BY effective_month DESC LIMIT 1
  ) v ON true
  WHERE p.id = ANY(targets)
  ON CONFLICT (plan_id, effective_month) DO NOTHING;

  UPDATE public.expense_plans SET start_date = DATE '2026-09-01'
  WHERE id = ANY(targets);
END $$;

COMMIT;

SELECT name, currency, start_date
FROM public.expense_plans
WHERE name IN ('Mum', 'Groceries', 'Dildora Wife', 'Monthly living cost')
ORDER BY name;
