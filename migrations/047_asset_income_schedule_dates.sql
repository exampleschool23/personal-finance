-- Keep linked fixed-income schedules aligned when the asset record date is saved.
BEGIN;
CREATE FUNCTION public.sync_asset_income_schedule_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.income_sources; previous_write text;
BEGIN
 IF NEW.kind NOT IN ('Business','Property') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 FOR source IN SELECT * FROM public.income_sources WHERE user_id=NEW.user_id AND linked_record_id=NEW.id AND mode='fixed' AND NOT archived AND start_date IS DISTINCT FROM NEW.date FOR UPDATE LOOP
  IF source.end_date IS NOT NULL AND source.end_date<NEW.date THEN
   RAISE EXCEPTION 'The income plan ends before this record date. Update its end date in Income sources first.';
  END IF;
  PERFORM set_config('finance.income_source_write','1',true);
  UPDATE public.finance_records SET date=NEW.date WHERE id=source.schedule_id AND user_id=NEW.user_id;
  UPDATE public.income_sources SET start_date=NEW.date WHERE id=source.id AND user_id=NEW.user_id;
 END LOOP;
 PERFORM set_config('finance.income_source_write',previous_write,true);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_asset_income_schedule_date() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_asset_income_schedule_date AFTER UPDATE OF date ON public.finance_records
FOR EACH ROW EXECUTE FUNCTION public.sync_asset_income_schedule_date();
COMMIT;
