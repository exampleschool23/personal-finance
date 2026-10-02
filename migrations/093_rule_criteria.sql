-- Rule criteria: besides words in the name, a rule may require an exact name,
-- an account, a business, a category or an amount range.
-- * A rule needs at least one criterion; the name may be left empty when another is set.
-- * transaction_rule_matches is the one test shared by applying a rule to past
--   transactions and by classifying and tagging statement imports.
-- * The category criterion follows the rule's direction; a deleted account,
--   business or category takes the rules that named it along.
-- Apply after 092. Existing rules keep matching names that contain their words.
BEGIN;

ALTER TABLE public.transaction_rules
 DROP CONSTRAINT transaction_rules_pattern_check,
 ADD COLUMN match text NOT NULL DEFAULT 'contains' CHECK (match IN ('contains','exact')),
 ADD COLUMN account_id uuid,
 ADD COLUMN match_business_id uuid,
 ADD COLUMN match_kind text CHECK (match_kind IS NULL OR match_kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')),
 ADD COLUMN match_category_id uuid,
 ADD COLUMN amount_min numeric CHECK (amount_min IS NULL OR amount_min>=0),
 ADD COLUMN amount_max numeric,
 ADD CONSTRAINT transaction_rules_pattern CHECK (length(trim(pattern))<=120),
 ADD CONSTRAINT transaction_rules_criteria CHECK (length(trim(pattern))>0 OR account_id IS NOT NULL OR match_business_id IS NOT NULL OR match_kind IS NOT NULL OR amount_min IS NOT NULL OR amount_max IS NOT NULL),
 ADD CONSTRAINT transaction_rules_match_category CHECK (match_category_id IS NULL OR match_kind IN ('Other income','Other expense')),
 ADD CONSTRAINT transaction_rules_match_direction CHECK (match_kind IS NULL OR direction='any' OR direction=CASE WHEN match_kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END),
 ADD CONSTRAINT transaction_rules_amount_range CHECK (amount_max IS NULL OR amount_max>=coalesce(amount_min,0)),
 ADD CONSTRAINT transaction_rules_account FOREIGN KEY (user_id,account_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 ADD CONSTRAINT transaction_rules_match_business FOREIGN KEY (user_id,match_business_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 ADD CONSTRAINT transaction_rules_match_category_owner FOREIGN KEY (match_category_id,user_id) REFERENCES public.transaction_categories(id,user_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.validate_transaction_rule() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.business_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.business_id AND user_id=NEW.user_id AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF NEW.match_business_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.match_business_id AND user_id=NEW.user_id AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.account_id AND user_id=NEW.user_id AND kind='Cash') THEN RAISE EXCEPTION 'Choose one of your accounts.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.tag_ids) tag WHERE NOT EXISTS(SELECT 1 FROM public.transaction_tags t WHERE t.id=tag AND t.user_id=NEW.user_id)) THEN RAISE EXCEPTION 'Choose one of your tags.'; END IF;
 NEW.tag_ids:=ARRAY(SELECT DISTINCT unnest(NEW.tag_ids));
 RETURN NEW;
END $$;

-- Whether a rule's criteria hold for a transaction. The direction is checked by the caller.
CREATE FUNCTION public.transaction_rule_matches(rule public.transaction_rules,r public.finance_records) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE rule.match WHEN 'exact' THEN lower(trim(r.name))=lower(trim(rule.pattern)) ELSE strpos(lower(r.name),lower(trim(rule.pattern)))>0 END
  AND (rule.account_id IS NULL OR r.account_id IS NOT DISTINCT FROM rule.account_id)
  AND (rule.match_business_id IS NULL OR r.business_id IS NOT DISTINCT FROM rule.match_business_id)
  AND (rule.match_kind IS NULL OR (r.kind=rule.match_kind AND r.custom_category_id IS NOT DISTINCT FROM rule.match_category_id))
  AND (rule.amount_min IS NULL OR r.amount>=rule.amount_min)
  AND (rule.amount_max IS NULL OR r.amount<=rule.amount_max)
$$;

-- Applies one rule to its matching past transactions (newest 500) and returns how many changed.
CREATE OR REPLACE FUNCTION public.apply_transaction_rule(p_rule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); rule public.transaction_rules; ids uuid[]; changed uuid[]:='{}';
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO rule FROM public.transaction_rules WHERE id=p_rule AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM (SELECT r.id FROM public.finance_records r WHERE r.user_id=owner AND r.frequency='Once'
  AND public.transaction_rule_matches(rule,r)
  AND r.kind IN (SELECT unnest(CASE rule.direction WHEN 'income' THEN ARRAY['Salary','Rent income','Business income','Other income'] WHEN 'expense' THEN ARRAY['Rent expense','Living expense','Charity','Other expense'] ELSE ARRAY['Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'] END))
  ORDER BY r.date DESC,r.id LIMIT 500) matched;
 IF rule.kind IS NOT NULL THEN changed:=changed||public.recategorize_transactions(ids,rule.kind,rule.category_id); END IF;
 IF rule.business_id IS NOT NULL THEN changed:=changed||public.assign_transaction_business(ids,rule.business_id); END IF;
 IF cardinality(rule.tag_ids)>0 THEN changed:=changed||public.tag_transactions(ids,rule.tag_ids,'{}'); END IF;
 RETURN (SELECT count(DISTINCT id) FROM unnest(changed) id);
END $$;

-- New statement rows: the account's business, then the newest matching rule for each of category and business.
CREATE OR REPLACE FUNCTION public.classify_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE dir text; rule_business uuid;
BEGIN
 -- PostgREST saves use INSERT ... ON CONFLICT; existing rows are never reclassified.
 IF NEW.import_key IS NULL OR NEW.frequency<>'Once'
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1'
  OR EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id) THEN RETURN NEW; END IF;
 dir:=CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END;
 IF dir IS NULL THEN RETURN NEW; END IF;
 IF NEW.business_id IS NULL AND NEW.account_id IS NOT NULL AND NEW.expense_plan_id IS NULL THEN
  SELECT business_id INTO NEW.business_id FROM public.finance_records WHERE id=NEW.account_id AND user_id=NEW.user_id;
 END IF;
 IF NEW.custom_category_id IS NULL AND NEW.kind IN ('Other income','Other expense') THEN
  SELECT rule.category_id INTO NEW.custom_category_id FROM public.transaction_rules rule
  WHERE rule.user_id=NEW.user_id AND rule.category_id IS NOT NULL AND rule.kind=NEW.kind AND public.transaction_rule_matches(rule,NEW)
  ORDER BY rule.created_at DESC,rule.id LIMIT 1;
 END IF;
 IF NEW.expense_plan_id IS NULL THEN
  SELECT rule.business_id INTO rule_business FROM public.transaction_rules rule
  WHERE rule.user_id=NEW.user_id AND rule.business_id IS NOT NULL AND rule.direction IN ('any',dir) AND public.transaction_rule_matches(rule,NEW)
  ORDER BY rule.created_at DESC,rule.id LIMIT 1;
  IF rule_business IS NOT NULL THEN NEW.business_id:=rule_business; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.classify_imported_transaction() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.tag_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.import_key IS NULL OR NEW.frequency<>'Once'
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id)
 SELECT DISTINCT NEW.id,tag,NEW.user_id FROM public.transaction_rules rule CROSS JOIN unnest(rule.tag_ids) tag
 WHERE rule.user_id=NEW.user_id AND public.transaction_rule_matches(rule,NEW)
  AND rule.direction IN ('any',CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tag_imported_transaction() FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.transaction_rule_matches(public.transaction_rules,public.finance_records) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transaction_rule_matches(public.transaction_rules,public.finance_records) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
