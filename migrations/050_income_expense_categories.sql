BEGIN;
-- Replace name-matching rules with explicitly selected income/expense categories.
DROP TRIGGER classify_transaction ON public.finance_records;
DROP FUNCTION public.classify_new_transaction();
DROP TABLE public.category_rules;
ALTER TABLE public.custom_categories RENAME TO transaction_categories;
ALTER TABLE public.transaction_categories ADD COLUMN direction text NOT NULL DEFAULT 'expense' CHECK(direction IN ('income','expense'));
ALTER TABLE public.transaction_categories DROP CONSTRAINT custom_categories_user_id_name_key;
CREATE UNIQUE INDEX transaction_categories_owner_direction_name ON public.transaction_categories(user_id,direction,name);

-- Retain IDs and assignments. Categories used in both directions get an income
-- copy; deleted transactions and their splits must remain restorable as well.
CREATE TEMP TABLE category_usage ON COMMIT DROP AS
 SELECT custom_category_id AS id,kind FROM public.finance_records WHERE custom_category_id IS NOT NULL
 UNION SELECT s.category_id,r.kind FROM public.transaction_splits s JOIN public.finance_records r ON r.id=s.record_id
 UNION SELECT (data->>'custom_category_id')::uuid,data->>'kind' FROM public.deleted_items WHERE source='finance_records' AND data->>'custom_category_id' IS NOT NULL
 UNION SELECT (part->>'category_id')::uuid,d.data->>'kind' FROM public.deleted_items d CROSS JOIN LATERAL jsonb_array_elements(d.splits) part WHERE d.source='finance_records';
UPDATE public.transaction_categories c SET direction='income'
 WHERE EXISTS(SELECT 1 FROM category_usage u WHERE u.id=c.id AND u.kind IN ('Salary','Rent income','Business income','Other income'))
 AND NOT EXISTS(SELECT 1 FROM category_usage u WHERE u.id=c.id AND u.kind NOT IN ('Salary','Rent income','Business income','Other income'));
CREATE TEMP TABLE income_category_copies ON COMMIT DROP AS
 SELECT id AS old_id,gen_random_uuid() AS new_id FROM public.transaction_categories c WHERE direction='expense'
 AND EXISTS(SELECT 1 FROM category_usage u WHERE u.id=c.id AND u.kind IN ('Salary','Rent income','Business income','Other income'));
INSERT INTO public.transaction_categories(id,user_id,name,direction)
 SELECT m.new_id,c.user_id,c.name,'income' FROM public.transaction_categories c JOIN income_category_copies m ON m.old_id=c.id;
UPDATE public.finance_records r SET custom_category_id=m.new_id FROM income_category_copies m
 WHERE r.custom_category_id=m.old_id AND r.kind IN ('Salary','Rent income','Business income','Other income');
UPDATE public.transaction_splits s SET category_id=m.new_id FROM income_category_copies m,public.finance_records r
 WHERE s.category_id=m.old_id AND s.record_id=r.id AND r.kind IN ('Salary','Rent income','Business income','Other income');
UPDATE public.deleted_items d SET data=jsonb_set(d.data,'{custom_category_id}',to_jsonb(m.new_id)) FROM income_category_copies m
 WHERE d.source='finance_records' AND d.data->>'custom_category_id'=m.old_id::text AND d.data->>'kind' IN ('Salary','Rent income','Business income','Other income');
UPDATE public.deleted_items d SET splits=(SELECT coalesce(jsonb_agg(CASE WHEN m.new_id IS NULL THEN part ELSE jsonb_set(part,'{category_id}',to_jsonb(m.new_id)) END ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(d.splits) WITH ORDINALITY p(part,ord) LEFT JOIN income_category_copies m ON m.old_id::text=part->>'category_id')
 WHERE d.source='finance_records' AND d.data->>'kind' IN ('Salary','Rent income','Business income','Other income');
ALTER TABLE public.transaction_categories ALTER COLUMN direction DROP DEFAULT;

-- Update all historical RPC wrappers still in service, including backup exports
-- and scheduled payments. Keep the record reference column for compatibility.
DO $$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f' AND (p.prosrc LIKE '%custom_categories%' OR p.prosrc LIKE '%tables,category_rules%') LOOP
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'custom_categories','transaction_categories');
  definition:=replace(definition,'transaction_categories(id,user_id,name) VALUES(item,owner,trim(p_data->>''name''))','transaction_categories(id,user_id,name,direction) VALUES(item,owner,trim(p_data->>''name''),p_data->>''direction'')');
  definition:=replace(definition,'ON CONFLICT(id) DO UPDATE SET name=excluded.name WHERE transaction_categories.user_id=owner','ON CONFLICT(id) DO UPDATE SET name=excluded.name,direction=excluded.direction WHERE transaction_categories.user_id=owner');
  definition:=replace(definition,'result:=jsonb_set(result,''{tables,category_rules}'',(SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]'') FROM public.category_rules r));','');
  EXECUTE definition;
 END LOOP;
END $$;

CREATE FUNCTION public.validate_transaction_category() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected text; category uuid; owner uuid;
BEGIN
 IF TG_TABLE_NAME='finance_records' THEN
  category:=NEW.custom_category_id;owner:=NEW.user_id;
  expected:=CASE WHEN NEW.kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END;
 ELSE
  category:=NEW.category_id;owner:=NEW.user_id;
  SELECT CASE WHEN kind IN ('Salary','Rent income','Business income','Other income') THEN 'income' WHEN kind IN ('Rent expense','Living expense','Charity','Other expense') THEN 'expense' END INTO expected FROM public.finance_records WHERE id=NEW.record_id AND user_id=owner;
 END IF;
 IF category IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=category AND user_id=owner AND direction=expected) THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_transaction_category BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_category();
CREATE TRIGGER validate_split_category BEFORE INSERT OR UPDATE ON public.transaction_splits FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_category();
CREATE FUNCTION public.protect_category_direction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.direction IS DISTINCT FROM OLD.direction THEN RAISE EXCEPTION 'Category type cannot be changed.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_category_direction BEFORE UPDATE ON public.transaction_categories FOR EACH ROW EXECUTE FUNCTION public.protect_category_direction();
REVOKE ALL ON FUNCTION public.validate_transaction_category(),public.protect_category_direction() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
