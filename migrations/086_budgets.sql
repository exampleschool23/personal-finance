-- Budgets: a monthly amount per category, Monarch-style category settings
-- (Fixed / Flexible / Non-monthly, group, rollover, excluded), the budget
-- style (category or flex) and whether an edited amount also covers later months. `category_key` is a built-in kind such as
-- 'Rent expense', a custom category id, or 'flex:flexible' for the single
-- Flexible amount in flex mode. Amounts keep their own currency. A forward
-- amount covers every later month until the next saved amount.
-- Apply after 085. No existing rows are changed.
BEGIN;

CREATE TABLE public.budget_settings (
 user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'category' CHECK (mode IN ('category','flex')),
 apply_forward boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.budget_categories (
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 category_key text NOT NULL CHECK (length(category_key) BETWEEN 1 AND 80),
 budget_type text NOT NULL DEFAULT 'flexible' CHECK (budget_type IN ('fixed','flexible','non_monthly')),
 group_name text CHECK (group_name IS NULL OR length(trim(group_name)) BETWEEN 1 AND 60),
 rollover boolean NOT NULL DEFAULT false,
 rollover_start date CHECK (rollover_start IS NULL OR extract(day FROM rollover_start)=1),
 excluded boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,category_key)
);
CREATE TABLE public.budget_amounts (
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 category_key text NOT NULL CHECK (length(category_key) BETWEEN 1 AND 80),
 month date NOT NULL CHECK (extract(day FROM month)=1),
 amount numeric NOT NULL CHECK (amount>=0 AND amount<=1e15),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 applies_forward boolean NOT NULL DEFAULT false,
 PRIMARY KEY (user_id,category_key,month)
);
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_amounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage budget settings" ON public.budget_settings FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "Owners manage budget categories" ON public.budget_categories FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "Owners manage budget amounts" ON public.budget_amounts FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.budget_settings, public.budget_categories, public.budget_amounts FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.budget_settings, public.budget_categories, public.budget_amounts TO authenticated;

-- "This month only" keeps later months; "All future months" replaces them.
-- Replacing a forward amount for one month moves it on to the next month, so
-- the months after keep their budget. Mirrors setBudgetAmount in lib/budget.ts.
CREATE FUNCTION public.set_budget_amount(p_key text,p_month date,p_amount numeric,p_currency text,p_forward boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); existing public.budget_amounts;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'Budgets are set for whole months.'; END IF;
 SELECT * INTO existing FROM public.budget_amounts WHERE user_id=owner AND category_key=p_key AND month=p_month FOR UPDATE;
 IF p_forward THEN
  DELETE FROM public.budget_amounts WHERE user_id=owner AND category_key=p_key AND month>p_month;
 ELSIF existing.applies_forward THEN
  INSERT INTO public.budget_amounts(user_id,category_key,month,amount,currency,applies_forward)
  VALUES(owner,p_key,(p_month+interval '1 month')::date,existing.amount,existing.currency,true) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.budget_amounts(user_id,category_key,month,amount,currency,applies_forward)
 VALUES(owner,p_key,p_month,p_amount,p_currency,p_forward)
 ON CONFLICT (user_id,category_key,month) DO UPDATE SET amount=excluded.amount,currency=excluded.currency,applies_forward=excluded.applies_forward;
END $$;
REVOKE ALL ON FUNCTION public.set_budget_amount(text,date,numeric,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_budget_amount(text,date,numeric,text,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
