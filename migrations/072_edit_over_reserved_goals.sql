-- A savings goal could not be renamed, re-dated or have its plan saved once spending had
-- taken its cash account below the amount reserved: every save re-checked the whole
-- reservation. Only a reservation that grows or is reactivated is checked now,
-- so an over-reserved goal can still be corrected, reduced or archived.
-- Apply after 071. No existing rows are rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.patch_goal_edit(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn);
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
DO $$ DECLARE fn regprocedure; BEGIN
 FOREACH fn IN ARRAY ARRAY['public.planning_action(text,jsonb)'::regprocedure,'public.planning_action_with_actual_amount(text,jsonb)'::regprocedure] LOOP
  PERFORM pg_temp.patch_goal_edit(fn,
   $old$IF coalesce((p_data->>'archived')::boolean,false)=false AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;$old$,
   $new$IF coalesce((p_data->>'archived')::boolean,false)=false
    AND coalesce((p_data->>'allocated')::numeric,0)>coalesce((SELECT allocated FROM public.savings_goals WHERE id=item AND user_id=owner AND account_id=aid AND NOT archived),0)
    AND coalesce((p_data->>'allocated')::numeric,0)+(SELECT coalesce(sum(allocated),0) FROM public.savings_goals WHERE user_id=owner AND account_id=aid AND NOT archived AND id<>item)>a.amount THEN RAISE EXCEPTION 'Allocations exceed the account balance.'; END IF;$new$);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
