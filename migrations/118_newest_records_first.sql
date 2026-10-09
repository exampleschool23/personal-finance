-- Newest records first within a day, and names that follow their category. Needs 117.
-- Record pages were ordered by date and then by id, a random value, so rows saved
-- on the same day came back in no particular order and the Cash flow preview of
-- recent transactions could leave out the one just saved. Record pages and the
-- transaction history (Cash flow) now order same-day rows by the moment they were
-- saved: newest first, or oldest first when sorted oldest first.
-- A transaction saved without a name is named after its category. Changing its
-- category (inline, Edit multiple or a rule) now renames it too, so a row no
-- longer reads "Other expense" under a Transport pill. Typed names stay. No
-- existing rows change until their category does.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.patch_newest_first(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 -- Re-running is a no-op once every expected match was already patched. The new
 -- text may contain the old, so it is counted first.
 IF (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

SELECT pg_temp.patch_newest_first('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$ORDER BY p.sort_date DESC NULLS LAST, p.id DESC)$old$,$new$ORDER BY p.sort_date DESC NULLS LAST, p.created_at DESC, p.id DESC)$new$,1);
SELECT pg_temp.patch_newest_first('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$ORDER BY sort_date DESC NULLS LAST, r.id DESC LIMIT$old$,$new$ORDER BY sort_date DESC NULLS LAST, r.created_at DESC, r.id DESC LIMIT$new$,1);
SELECT pg_temp.patch_newest_first('public.transaction_history_page(integer,text,text,text,date,date,text)'::regprocedure,
 $old$CASE WHEN p_order='newest' THEN r.date END DESC NULLS LAST,r.id ASC$old$,
 $new$CASE WHEN p_order='newest' THEN r.date END DESC NULLS LAST,CASE WHEN p_order='newest' THEN r.created_at END DESC,CASE WHEN p_order='oldest' THEN r.created_at END ASC,r.id ASC$new$,1);

SELECT pg_temp.patch_newest_first('public.recategorize_transactions(uuid[],text,uuid)'::regprocedure,
 $old$UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category$old$,
 $new$UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category,name=CASE WHEN lower(trim(r.name)) IN (lower(r.kind),lower(coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=r.custom_category_id),''))) THEN coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=p_category),p_kind) ELSE r.name END$new$,1);

NOTIFY pgrst,'reload schema';
COMMIT;
