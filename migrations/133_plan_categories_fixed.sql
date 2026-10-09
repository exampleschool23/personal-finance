-- Categories made from spending plans are Fixed. Apply after 132.
-- Migration 131 turned each spending plan into a Budget category of type Flexible.
-- With the Flex budget style, flexible categories share the single Flexible amount,
-- so once that amount is saved a plan's own monthly amount stopped counting. A plan
-- was a set monthly allowance, which is what Fixed means: planned on its own in
-- either budget style. The type only picks a default group, and these categories
-- keep the group their plan gave them.
-- * convert_expense_plan makes the category Fixed, for a plan restored later from
--   an old backup or Recently deleted;
-- * the categories migration 131 made become Fixed. They are recognised by what only
--   that conversion wrote: an added spending category, Flexible, with negative carry
--   switched off (the app keeps it on unless a rollover fund turns it off) and its
--   plan's label, or none, as the group.
BEGIN;

DO $$
DECLARE patched text;
BEGIN
 patched:=pg_get_functiondef('public.convert_expense_plan(uuid)'::regprocedure);
 IF position($q$VALUES(owner,key,'fixed',$q$ in patched)=0 THEN
  IF position($q$VALUES(owner,key,'flexible',$q$ in patched)=0 THEN RAISE EXCEPTION 'Could not update convert_expense_plan; apply migration 131 first.'; END IF;
  EXECUTE replace(patched,$q$VALUES(owner,key,'flexible',$q$,$q$VALUES(owner,key,'fixed',$q$);
 END IF;
END $$;

UPDATE public.budget_categories b SET budget_type='fixed',updated_at=now()
 FROM public.transaction_categories c
 WHERE c.user_id=b.user_id AND c.id::text=b.category_key AND c.direction='expense'
  AND b.budget_type='flexible' AND NOT b.rollover_negative
  AND (b.group_name IS NULL OR b.group_name IN ('Groceries','Family support','Household'));

-- The capability version moves to 133, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',133,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
