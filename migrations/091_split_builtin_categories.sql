-- Split parts may use a built-in category (stored in kind) as well as an
-- added one (category_id). Existing splits are unchanged. Apply after 090.
BEGIN;
ALTER TABLE public.transaction_splits ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE public.transaction_splits ADD COLUMN kind text CHECK(kind IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'));
ALTER TABLE public.transaction_splits ADD CONSTRAINT transaction_splits_one_category CHECK((category_id IS NULL)<>(kind IS NULL));

CREATE OR REPLACE FUNCTION public.save_transaction_splits(p_record uuid,p_splits jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); r public.finance_records; part jsonb; n integer:=0; total numeric:=0; label text; incoming boolean;
 income_kinds text[]:=ARRAY['Salary','Rent income','Business income','Other income']; expense_kinds text[]:=ARRAY['Rent expense','Living expense','Charity','Other expense'];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO r FROM public.finance_records WHERE id=p_record AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR r.movement_id IS NOT NULL OR r.operation_id IS NOT NULL OR r.mortgage_payment_id IS NOT NULL OR r.history_event_id IS NOT NULL OR r.frequency<>'Once' OR NOT (r.kind=ANY(income_kinds||expense_kinds)) THEN RAISE EXCEPTION 'Choose an actual transaction.'; END IF;
 IF jsonb_typeof(p_splits) IS DISTINCT FROM 'array' OR jsonb_array_length(p_splits)>50 OR jsonb_array_length(p_splits)=1 THEN RAISE EXCEPTION 'Use at least two split categories, or clear the split.'; END IF;
 incoming:=r.kind=ANY(income_kinds);
 DELETE FROM public.transaction_splits WHERE record_id=r.id AND user_id=owner;
 FOR part IN SELECT value FROM jsonb_array_elements(p_splits) LOOP
  IF (part->>'amount') IS NULL OR (part->>'amount')::numeric<=0 OR (part->>'amount')::numeric>1e15 THEN RAISE EXCEPTION 'Check the split amounts.'; END IF;
  label:=part->>'category_id';
  IF label=ANY(income_kinds||expense_kinds) THEN
   IF (label=ANY(income_kinds))<>incoming THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
   INSERT INTO public.transaction_splits(record_id,user_id,position,kind,amount) VALUES(r.id,owner,n,label,(part->>'amount')::numeric);
  ELSE
   INSERT INTO public.transaction_splits(record_id,user_id,position,category_id,amount) VALUES(r.id,owner,n,label::uuid,(part->>'amount')::numeric);
  END IF;
  total:=total+(part->>'amount')::numeric;n:=n+1;
 END LOOP;
 IF n>0 AND total<>r.amount THEN RAISE EXCEPTION 'Split amounts must equal the transaction amount.'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

-- Recently deleted keeps either label, so restoring re-creates the same split.
CREATE OR REPLACE FUNCTION public.archive_transaction_splits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- A backup restore replaces rows wholesale; it never archives (restore guard, as on every financial trigger).
 IF public.finance_restore_active() THEN RETURN OLD; END IF;
 IF OLD.user_id=auth.uid() THEN
  UPDATE public.deleted_items SET splits=(SELECT coalesce(jsonb_agg(jsonb_build_object('category_id',coalesce(category_id::text,kind),'amount',amount) ORDER BY position),'[]'::jsonb) FROM public.transaction_splits WHERE record_id=OLD.id AND user_id=OLD.user_id)
  WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=OLD.user_id AND source='finance_records' AND data->>'id'=OLD.id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 END IF;
 RETURN OLD;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
