-- Transaction rules and category changes from the Transactions page.
-- A rule says: transactions whose name contains `pattern` belong in a
-- category. It is applied when it is saved (to matching past transactions,
-- on request) and to new bank-statement imports. Imports keep their
-- 'Other income' / 'Other expense' type, so only rules that pick a custom
-- category apply there. Manual entries keep the category the user chose.
-- set_transaction_category changes one or many transactions at once; it
-- skips generated rows, split rows and rows linked to a schedule, a business
-- or an income source, and returns how many it changed.
-- Apply after 086. No existing rows are changed.
BEGIN;

CREATE TABLE public.transaction_rules (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 pattern text NOT NULL CHECK (length(trim(pattern)) BETWEEN 1 AND 120),
 direction text NOT NULL CHECK (direction IN ('income','expense')),
 kind text NOT NULL CHECK (kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')),
 category_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,user_id),
 FOREIGN KEY (category_id,user_id) REFERENCES public.transaction_categories(id,user_id) ON DELETE CASCADE,
 CHECK (direction = CASE WHEN kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END),
 CHECK (category_id IS NULL OR kind IN ('Other income','Other expense'))
);
CREATE INDEX transaction_rules_owner ON public.transaction_rules(user_id,created_at);
ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage transaction rules" ON public.transaction_rules FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.transaction_rules FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.transaction_rules TO authenticated;

CREATE FUNCTION public.set_transaction_category(p_ids uuid[],p_kind text,p_category uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); incoming boolean; changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 incoming:=p_kind IN ('Salary','Rent income','Business income','Other income');
 IF p_category IS NOT NULL AND (p_kind NOT IN ('Other income','Other expense') OR NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=p_category AND user_id=owner AND direction=CASE WHEN incoming THEN 'income' ELSE 'expense' END)) THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category
 WHERE r.user_id=owner AND r.id=ANY(p_ids) AND r.frequency='Once'
  AND r.kind IN (SELECT unnest(CASE WHEN incoming THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END))
  AND (r.kind,r.custom_category_id) IS DISTINCT FROM (p_kind,p_category)
  AND r.movement_id IS NULL AND r.operation_id IS NULL AND r.mortgage_payment_id IS NULL AND r.history_event_id IS NULL
  AND r.business_id IS NULL AND r.income_source_id IS NULL AND r.earning_source_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.transaction_splits s WHERE s.record_id=r.id AND s.user_id=owner);
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.set_transaction_category(uuid[],text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_category(uuid[],text,uuid) TO authenticated;

-- Applies one rule to every matching past transaction of its direction.
CREATE FUNCTION public.apply_transaction_rule(p_rule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); rule public.transaction_rules; ids uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO rule FROM public.transaction_rules WHERE id=p_rule AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM (SELECT r.id FROM public.finance_records r WHERE r.user_id=owner AND r.frequency='Once'
  AND strpos(lower(r.name),lower(trim(rule.pattern)))>0
  AND r.kind IN (SELECT unnest(CASE WHEN rule.direction='income' THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END))
  LIMIT 500) matched;
 RETURN public.set_transaction_category(ids,rule.kind,rule.category_id);
END $$;
REVOKE ALL ON FUNCTION public.apply_transaction_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_transaction_rule(uuid) TO authenticated;

-- New statement rows take the newest matching custom-category rule.
CREATE FUNCTION public.classify_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT; existing rows are never reclassified.
 IF NEW.import_key IS NULL OR NEW.custom_category_id IS NOT NULL OR NEW.frequency<>'Once' OR NEW.kind NOT IN ('Other income','Other expense')
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1'
  OR EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 SELECT category_id INTO NEW.custom_category_id FROM public.transaction_rules
 WHERE user_id=NEW.user_id AND category_id IS NOT NULL AND kind=NEW.kind AND strpos(lower(NEW.name),lower(trim(pattern)))>0
 ORDER BY created_at DESC,id LIMIT 1;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.classify_imported_transaction() FROM PUBLIC, anon;
CREATE TRIGGER classify_imported_transaction BEFORE INSERT ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.classify_imported_transaction();

NOTIFY pgrst,'reload schema';
COMMIT;
