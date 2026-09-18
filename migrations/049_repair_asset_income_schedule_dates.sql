-- Repair pre-existing asset/schedule date drift without rewriting payment history.
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_asset_income_schedule_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.income_sources; previous_write text;
BEGIN
 IF NEW.kind NOT IN ('Business','Property') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 FOR source IN SELECT * FROM public.income_sources WHERE user_id=NEW.user_id AND linked_record_id=NEW.id AND mode='fixed' AND NOT archived AND (start_date IS DISTINCT FROM NEW.date OR EXISTS (SELECT 1 FROM public.finance_records schedule WHERE schedule.id=income_sources.schedule_id AND schedule.user_id=NEW.user_id AND schedule.date IS DISTINCT FROM NEW.date)) FOR UPDATE LOOP
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
-- Re-save only assets whose active plan still starts before the asset itself.
-- Later, intentionally configured plan starts and ended plans remain unchanged.
-- The trigger updates the plan and schedule atomically; receipts are untouched.
UPDATE public.finance_records asset SET date=asset.date
WHERE asset.kind IN ('Business','Property') AND EXISTS (
 SELECT 1 FROM public.income_sources source
 JOIN public.finance_records schedule ON schedule.id=source.schedule_id AND schedule.user_id=source.user_id
 WHERE source.user_id=asset.user_id AND source.linked_record_id=asset.id
 AND source.mode='fixed' AND NOT source.archived
 AND (source.end_date IS NULL OR source.end_date>=asset.date)
 AND (source.start_date<asset.date OR (source.start_date=asset.date AND schedule.date IS DISTINCT FROM asset.date))
) AND NOT EXISTS (
 SELECT 1 FROM public.income_sources source
 WHERE source.user_id=asset.user_id AND source.linked_record_id=asset.id
 AND source.mode='fixed' AND NOT source.archived
 AND (source.start_date>asset.date OR source.end_date<asset.date)
);
COMMIT;
