-- Business tracking and tags for people who run a business.
-- * A Business record is also a business profile: legal structure, colour,
--   logo and notes. Any other record may belong to a business: accounts,
--   holdings, property and debts (its net assets) and transactions (its profit
--   and loss). Transactions keep any category; the business is a separate field.
-- * Rent from a property keeps its business (or takes the property's).
-- * set_transaction_business, set_account_business and set_transaction_tags
--   change many rows at once and return how many changed. Moving an account to
--   a business moves its transactions that followed the account's business.
-- * Rules may set a category, a business, tags, or any of them. A rule that
--   sets no category may match income and expenses alike ('any').
-- * Statement imports take their account's business, then the newest matching
--   rule's category, business and tags.
-- * Tags label transactions across categories and businesses.
-- Apply after 091. Existing rows keep their values.
BEGIN;

ALTER TABLE public.finance_records
 ADD COLUMN business_structure text CHECK (business_structure IN ('sole_proprietorship','llc','partnership','rental_property','other')),
 ADD COLUMN business_color text CHECK (business_color IN ('teal','blue','indigo','violet','pink','red','orange','amber','green','slate')),
 ADD COLUMN business_logo text CHECK (length(business_logo)<=60000 AND business_logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'),
 ADD CONSTRAINT finance_records_business_profile CHECK (kind='Business' OR (business_structure IS NULL AND business_color IS NULL AND business_logo IS NULL));

ALTER TABLE public.finance_records DROP CONSTRAINT finance_records_business_cashflow;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_business_cashflow CHECK (business_id IS NULL OR kind<>'Business');

CREATE OR REPLACE FUNCTION public.validate_income_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.finance_records; due date; month_start date;
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.frequency IS DISTINCT FROM OLD.frequency) AND EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=OLD.user_id AND income_source_id=OLD.id) THEN
  RAISE EXCEPTION 'This income source has linked records.';
 END IF;
 IF NEW.income_source_id IS NOT NULL THEN
  SELECT * INTO source FROM public.finance_records WHERE user_id=NEW.user_id AND id=NEW.income_source_id FOR SHARE;
  IF NOT FOUND OR source.id=NEW.id OR NOT ((NEW.kind='Rent income' AND source.kind='Property') OR (NEW.kind='Salary' AND NEW.frequency='Once' AND source.kind='Salary' AND source.frequency IN ('Monthly','Yearly') AND source.income_source_id IS NULL)) THEN
   RAISE EXCEPTION 'Choose a matching income source.';
  END IF;
  NEW.name:=source.name;
  NEW.business_id:=CASE WHEN NEW.kind='Salary' THEN source.business_id ELSE coalesce(NEW.business_id,source.business_id) END;
  IF NEW.kind='Salary' THEN
   due:=coalesce(NEW.income_due_on,NEW.date);
   month_start:=date_trunc('month',due)::date;
   IF due<source.date OR (source.end_date IS NOT NULL AND due>source.end_date) OR
    extract(day FROM due)<>least(extract(day FROM source.date),extract(day FROM (month_start+interval '1 month - 1 day'))) OR
    (source.frequency='Yearly' AND extract(month FROM due)<>extract(month FROM source.date)) THEN
    RAISE EXCEPTION 'Choose a scheduled salary date.';
   END IF;
   NEW.income_due_on:=due;
   IF EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=NEW.user_id AND record_id=source.id AND due_on=due AND transaction_id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'This salary payment is already recorded.';
   END IF;
  END IF;
 ELSIF NEW.kind='Business income' AND NEW.business_id IS NOT NULL THEN
  SELECT * INTO source FROM public.finance_records WHERE user_id=NEW.user_id AND id=NEW.business_id AND kind='Business';
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
  NEW.name:=source.name;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_income_source() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_finance_record(p_record jsonb,p_expected_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE existing public.finance_records; saved public.finance_records; payload jsonb; cols text; vals text; updates text; key text;
 allowed text[]:=ARRAY['id','name','kind','currency','amount','quantity','cost','rate','date','lent_date','frequency','notes','business_id','ownership_percentage','estimated_monthly_income','estimated_monthly_payment','expense_plan_id','end_date','account_id','custom_category_id','holding_account_id','deposit_compounding','opened_on','account_exchange_rate','account_rate_date','account_currency','income_source_id','income_due_on','earning_source_id','earning_due_on','payment_type','is_investment','business_structure','business_color','business_logo'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF jsonb_typeof(p_record)<>'object' OR p_record->>'id' IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 FOR key IN SELECT jsonb_object_keys(p_record) LOOP
  IF NOT key=ANY(allowed) THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 END LOOP;
 SELECT * INTO existing FROM public.finance_records WHERE id=(p_record->>'id')::uuid AND user_id=auth.uid() FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  -- Retrying an identical confirmed write is harmless, even after a lost response.
  IF to_jsonb(existing) @> p_record THEN RETURN jsonb_build_array(to_jsonb(existing)); END IF;
  IF p_expected_revision IS NULL OR existing.revision<>p_expected_revision THEN
   RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
  END IF;
 ELSIF p_expected_revision IS NOT NULL THEN
  RAISE EXCEPTION 'This record changed since you opened it. Reload it before saving.';
 END IF;
 payload:=p_record||jsonb_build_object('user_id',auth.uid());
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k),string_agg(format('%I=excluded.%I',k,k),',' ORDER BY k) FILTER(WHERE k NOT IN('id','user_id'))
 INTO cols,vals,updates FROM jsonb_object_keys(payload) k;
 EXECUTE format('INSERT INTO public.finance_records(%s) SELECT %s FROM jsonb_populate_record(NULL::public.finance_records,$1) r ON CONFLICT(id) DO UPDATE SET %s RETURNING *',cols,vals,updates) INTO saved USING payload;
 RETURN jsonb_build_array(to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.save_finance_record(jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_finance_record(jsonb,bigint) TO authenticated;

-- Tags
CREATE TABLE public.transaction_tags (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
 color text NOT NULL DEFAULT 'slate' CHECK (color IN ('teal','blue','indigo','violet','pink','red','orange','amber','green','slate')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,user_id)
);
CREATE UNIQUE INDEX transaction_tags_name ON public.transaction_tags(user_id,lower(trim(name)));
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage tags" ON public.transaction_tags FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.transaction_tags FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.transaction_tags TO authenticated;

CREATE TABLE public.transaction_tag_links (
 record_id uuid NOT NULL,
 tag_id uuid NOT NULL,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 PRIMARY KEY (record_id,tag_id),
 FOREIGN KEY (user_id,record_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY (tag_id,user_id) REFERENCES public.transaction_tags(id,user_id) ON DELETE CASCADE
);
CREATE INDEX transaction_tag_links_tag ON public.transaction_tag_links(user_id,tag_id);
ALTER TABLE public.transaction_tag_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read tag links" ON public.transaction_tag_links FOR SELECT TO authenticated USING (user_id=auth.uid());
REVOKE ALL ON public.transaction_tag_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transaction_tag_links TO authenticated;

-- Rows a bulk change may touch: recorded income and spending that is not generated from a tracker event.
CREATE FUNCTION public.is_editable_transaction(r public.finance_records) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT r.frequency='Once' AND r.kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') AND r.history_event_id IS NULL
$$;

-- Categories and businesses are independent: a business transaction may move to any category.
-- Business income keeps its business, so only rows with one may move into it.
CREATE OR REPLACE FUNCTION public.recategorize_transactions(p_ids uuid[],p_kind text,p_category uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); incoming boolean; changed uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 incoming:=p_kind IN ('Salary','Rent income','Business income','Other income');
 IF p_category IS NOT NULL AND (p_kind NOT IN ('Other income','Other expense') OR NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=p_category AND user_id=owner AND direction=CASE WHEN incoming THEN 'income' ELSE 'expense' END)) THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 WITH moved AS (
  UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category
  WHERE r.user_id=owner AND r.id=ANY(p_ids) AND r.frequency='Once'
   AND r.kind IN (SELECT unnest(CASE WHEN incoming THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END))
   AND (r.kind,r.custom_category_id) IS DISTINCT FROM (p_kind,p_category)
   AND r.movement_id IS NULL AND r.operation_id IS NULL AND r.mortgage_payment_id IS NULL AND r.history_event_id IS NULL
   AND r.income_source_id IS NULL AND r.earning_source_id IS NULL
   AND (p_kind<>'Business income' OR r.business_id IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM public.transaction_splits s WHERE s.record_id=r.id AND s.user_id=owner)
  RETURNING r.id)
 SELECT coalesce(array_agg(id),'{}') INTO changed FROM moved;
 RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION public.set_transaction_category(p_ids uuid[],p_kind text,p_category uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT cardinality(public.recategorize_transactions(p_ids,p_kind,p_category)) $$;

-- A business, or none (household), for many transactions. Salary paid from an
-- income source follows its source; business income always names a business;
-- spending inside a monthly plan stays household spending.
CREATE FUNCTION public.assign_transaction_business(p_ids uuid[],p_business uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); changed uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Choose up to 500 transactions.'; END IF;
 IF p_business IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_business AND user_id=owner AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 WITH moved AS (
  UPDATE public.finance_records r SET business_id=p_business
  WHERE r.user_id=owner AND r.id=ANY(p_ids) AND public.is_editable_transaction(r)
   AND r.business_id IS DISTINCT FROM p_business AND r.earning_source_id IS NULL
   AND NOT (r.kind='Salary' AND r.income_source_id IS NOT NULL)
   AND (p_business IS NOT NULL OR r.kind<>'Business income')
   AND (p_business IS NULL OR r.expense_plan_id IS NULL)
  RETURNING r.id)
 SELECT coalesce(array_agg(id),'{}') INTO changed FROM moved;
 RETURN changed;
END $$;
CREATE FUNCTION public.set_transaction_business(p_ids uuid[],p_business uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT cardinality(public.assign_transaction_business(p_ids,p_business)) $$;

-- Puts an account, holding, property or debt in a business (or back in the
-- household). Its transactions that followed its old business follow it too.
CREATE FUNCTION public.set_account_business(p_account uuid,p_business uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); account public.finance_records; changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Property','Valuables','Money lent','Mortgage','Loan','Debt') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your accounts.'; END IF;
 IF p_business IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=p_business AND user_id=owner AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF account.business_id IS NOT DISTINCT FROM p_business THEN RETURN 0; END IF;
 UPDATE public.finance_records SET business_id=p_business WHERE id=account.id AND user_id=owner;
 WITH moved AS (
  UPDATE public.finance_records r SET business_id=p_business
  WHERE r.user_id=owner AND (r.account_id=account.id OR (account.kind='Property' AND r.kind='Rent income' AND r.income_source_id=account.id))
   AND public.is_editable_transaction(r) AND r.business_id IS NOT DISTINCT FROM account.business_id AND r.earning_source_id IS NULL
   AND NOT (r.kind='Salary' AND r.income_source_id IS NOT NULL)
   AND (p_business IS NOT NULL OR r.kind<>'Business income')
   AND (p_business IS NULL OR r.expense_plan_id IS NULL)
  RETURNING r.id)
 SELECT count(*) INTO changed FROM moved;
 RETURN changed;
END $$;

-- Adds and removes tags on many transactions; returns the transactions that changed.
CREATE FUNCTION public.tag_transactions(p_ids uuid[],p_add uuid[],p_remove uuid[]) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); added uuid[]; removed uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 OR coalesce(array_length(p_add,1),0)>20 OR coalesce(array_length(p_remove,1),0)>20 THEN RAISE EXCEPTION 'Choose up to 500 transactions and 20 tags.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_add,'{}')||coalesce(p_remove,'{}')) tag WHERE NOT EXISTS(SELECT 1 FROM public.transaction_tags t WHERE t.id=tag AND t.user_id=owner)) THEN RAISE EXCEPTION 'Choose one of your tags.'; END IF;
 WITH inserted AS (
  INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id)
  SELECT r.id,tag,owner FROM public.finance_records r CROSS JOIN unnest(coalesce(p_add,'{}')) tag
  WHERE r.user_id=owner AND r.id=ANY(p_ids) AND public.is_editable_transaction(r)
  ON CONFLICT DO NOTHING RETURNING record_id)
 SELECT coalesce(array_agg(DISTINCT record_id),'{}') INTO added FROM inserted;
 WITH deleted AS (
  DELETE FROM public.transaction_tag_links WHERE user_id=owner AND record_id=ANY(p_ids) AND tag_id=ANY(coalesce(p_remove,'{}')) RETURNING record_id)
 SELECT coalesce(array_agg(DISTINCT record_id),'{}') INTO removed FROM deleted;
 RETURN ARRAY(SELECT DISTINCT unnest(added||removed));
END $$;
CREATE FUNCTION public.set_transaction_tags(p_ids uuid[],p_add uuid[],p_remove uuid[]) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT cardinality(public.tag_transactions(p_ids,p_add,p_remove)) $$;

-- Rules: a category, a business, tags, or any of them.
ALTER TABLE public.transaction_rules
 DROP CONSTRAINT transaction_rules_direction_check,
 DROP CONSTRAINT transaction_rules_kind_check,
 DROP CONSTRAINT transaction_rules_check,
 DROP CONSTRAINT transaction_rules_check1,
 ALTER COLUMN kind DROP NOT NULL,
 ADD COLUMN business_id uuid,
 ADD COLUMN tag_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(tag_ids)<=10),
 ADD CONSTRAINT transaction_rules_direction CHECK (direction IN ('income','expense','any')),
 ADD CONSTRAINT transaction_rules_kind CHECK (kind IS NULL OR (kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') AND direction=CASE WHEN kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' ELSE 'expense' END)),
 ADD CONSTRAINT transaction_rules_custom_category CHECK (category_id IS NULL OR kind IN ('Other income','Other expense')),
 ADD CONSTRAINT transaction_rules_action CHECK (kind IS NOT NULL OR business_id IS NOT NULL OR cardinality(tag_ids)>0),
 ADD CONSTRAINT transaction_rules_business FOREIGN KEY (user_id,business_id) REFERENCES public.finance_records(user_id,id) ON DELETE CASCADE;

CREATE FUNCTION public.validate_transaction_rule() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.business_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.business_id AND user_id=NEW.user_id AND kind='Business') THEN RAISE EXCEPTION 'Choose one of your businesses.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.tag_ids) tag WHERE NOT EXISTS(SELECT 1 FROM public.transaction_tags t WHERE t.id=tag AND t.user_id=NEW.user_id)) THEN RAISE EXCEPTION 'Choose one of your tags.'; END IF;
 NEW.tag_ids:=ARRAY(SELECT DISTINCT unnest(NEW.tag_ids));
 RETURN NEW;
END $$;
CREATE TRIGGER validate_transaction_rule BEFORE INSERT OR UPDATE ON public.transaction_rules FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_rule();

-- A deleted tag leaves the rules that added it.
CREATE FUNCTION public.forget_deleted_tag() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 DELETE FROM public.transaction_rules WHERE user_id=OLD.user_id AND kind IS NULL AND business_id IS NULL AND tag_ids=ARRAY[OLD.id];
 UPDATE public.transaction_rules SET tag_ids=array_remove(tag_ids,OLD.id) WHERE user_id=OLD.user_id AND OLD.id=ANY(tag_ids);
 RETURN OLD;
END $$;
CREATE TRIGGER forget_deleted_tag BEFORE DELETE ON public.transaction_tags FOR EACH ROW EXECUTE FUNCTION public.forget_deleted_tag();

-- Applies one rule to its matching past transactions (newest 500) and returns how many changed.
CREATE OR REPLACE FUNCTION public.apply_transaction_rule(p_rule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); rule public.transaction_rules; ids uuid[]; changed uuid[]:='{}';
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO rule FROM public.transaction_rules WHERE id=p_rule AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found.'; END IF;
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM (SELECT r.id FROM public.finance_records r WHERE r.user_id=owner AND r.frequency='Once'
  AND strpos(lower(r.name),lower(trim(rule.pattern)))>0
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
  SELECT category_id INTO NEW.custom_category_id FROM public.transaction_rules
  WHERE user_id=NEW.user_id AND category_id IS NOT NULL AND kind=NEW.kind AND strpos(lower(NEW.name),lower(trim(pattern)))>0
  ORDER BY created_at DESC,id LIMIT 1;
 END IF;
 IF NEW.expense_plan_id IS NULL THEN
  SELECT business_id INTO rule_business FROM public.transaction_rules
  WHERE user_id=NEW.user_id AND business_id IS NOT NULL AND direction IN ('any',dir) AND strpos(lower(NEW.name),lower(trim(pattern)))>0
  ORDER BY created_at DESC,id LIMIT 1;
  IF rule_business IS NOT NULL THEN NEW.business_id:=rule_business; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.classify_imported_transaction() FROM PUBLIC, anon;

CREATE FUNCTION public.tag_imported_transaction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.import_key IS NULL OR NEW.frequency<>'Once'
  OR public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NEW; END IF;
 INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id)
 SELECT DISTINCT NEW.id,tag,NEW.user_id FROM public.transaction_rules rule CROSS JOIN unnest(rule.tag_ids) tag
 WHERE rule.user_id=NEW.user_id AND strpos(lower(NEW.name),lower(trim(rule.pattern)))>0
  AND rule.direction IN ('any',CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tag_imported_transaction() FROM PUBLIC, anon;
CREATE TRIGGER tag_imported_transaction AFTER INSERT ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.tag_imported_transaction();

REVOKE ALL ON FUNCTION public.is_editable_transaction(public.finance_records),public.recategorize_transactions(uuid[],text,uuid),public.assign_transaction_business(uuid[],uuid),public.tag_transactions(uuid[],uuid[],uuid[]),public.set_transaction_business(uuid[],uuid),public.set_account_business(uuid,uuid),public.set_transaction_tags(uuid[],uuid[],uuid[]),public.validate_transaction_rule(),public.forget_deleted_tag() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_editable_transaction(public.finance_records),public.recategorize_transactions(uuid[],text,uuid),public.assign_transaction_business(uuid[],uuid),public.tag_transactions(uuid[],uuid[],uuid[]),public.set_transaction_business(uuid[],uuid),public.set_account_business(uuid,uuid),public.set_transaction_tags(uuid[],uuid[],uuid[]) TO authenticated;

ALTER TABLE public.workspace_preferences DROP CONSTRAINT workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order','business_order','tag_order','tax_lines'));

NOTIFY pgrst,'reload schema';
COMMIT;
