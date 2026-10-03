-- Migration 092 rebuilt save_finance_record and dropped 'recurrence_days' (added in 065) from the fields it accepts.
-- Every income recorded from a source sends recurrence_days, so those saves failed with "Check the record fields."
DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'recurrence_days'$q$ in definition)>0 THEN RETURN; END IF;
 IF position($q$'is_investment',$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'is_investment',$q$,$q$'is_investment','recurrence_days',$q$);
END $$;
