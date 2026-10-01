-- An optional rough monthly figure for variable income sources. It is shown for
-- reference only; forecasts still treat variable income as unknown, not zero.
BEGIN;
ALTER TABLE public.income_sources
 ADD COLUMN approx_monthly numeric CHECK(approx_monthly>0 AND approx_monthly<=1e15),
 ADD CONSTRAINT income_sources_approx_variable_only CHECK(mode='variable' OR approx_monthly IS NULL);
CREATE FUNCTION pg_temp.patch_source(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); BEGIN
 IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;
SELECT pg_temp.patch_source('public.save_income_source(jsonb)'::regprocedure,$old$schedule_id=EXCLUDED.schedule_id;$old$,$new$schedule_id=EXCLUDED.schedule_id,approx_monthly=EXCLUDED.approx_monthly;$new$);
NOTIFY pgrst,'reload schema';
COMMIT;
