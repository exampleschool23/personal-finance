-- Turn income-producing property/business estimates into usable payment plans.
BEGIN;
CREATE FUNCTION public.ensure_asset_income_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source_id uuid:=gen_random_uuid(); schedule uuid:=gen_random_uuid(); previous_write text;
BEGIN
 IF NEW.kind NOT IN ('Property','Business') OR coalesce(NEW.estimated_monthly_income,0)<=0 THEN RETURN NEW; END IF;
 -- Serialize with save_income_source, including concurrent asset edits.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 IF EXISTS(SELECT 1 FROM public.income_sources WHERE user_id=NEW.user_id AND linked_record_id=NEW.id) THEN RETURN NEW; END IF;
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 PERFORM set_config('finance.income_source_write','1',true);
 INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,business_id,income_source_id)
 VALUES(schedule,NEW.user_id,NEW.name,CASE WHEN NEW.kind='Property' THEN 'Rent income' ELSE 'Business income' END,NEW.currency,NEW.estimated_monthly_income,NEW.date,'Monthly',CASE WHEN NEW.kind='Business' THEN NEW.id END,CASE WHEN NEW.kind='Property' THEN NEW.id END);
 INSERT INTO public.income_sources(id,user_id,name,kind,currency,mode,amount,frequency,start_date,linked_record_id,schedule_id)
 VALUES(source_id,NEW.user_id,NEW.name,CASE WHEN NEW.kind='Property' THEN 'Rent income' ELSE 'Business income' END,NEW.currency,'fixed',NEW.estimated_monthly_income,'Monthly',NEW.date,NEW.id,schedule);
 PERFORM set_config('finance.income_source_write',previous_write,true);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ensure_asset_income_plan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ensure_asset_income_plan AFTER INSERT OR UPDATE OF estimated_monthly_income ON public.finance_records
FOR EACH ROW EXECUTE FUNCTION public.ensure_asset_income_plan();
-- Backfill using inserts directly: historical assets must not be updated or revalued.
DO $$
DECLARE asset public.finance_records; schedule uuid;
BEGIN
 FOR asset IN SELECT r.* FROM public.finance_records r WHERE r.kind IN ('Property','Business') AND r.estimated_monthly_income>0
 AND NOT EXISTS(SELECT 1 FROM public.income_sources s WHERE s.user_id=r.user_id AND s.linked_record_id=r.id)
 LOOP
  schedule:=gen_random_uuid();
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,business_id,income_source_id)
  VALUES(schedule,asset.user_id,asset.name,CASE WHEN asset.kind='Property' THEN 'Rent income' ELSE 'Business income' END,asset.currency,asset.estimated_monthly_income,asset.date,'Monthly',CASE WHEN asset.kind='Business' THEN asset.id END,CASE WHEN asset.kind='Property' THEN asset.id END);
  INSERT INTO public.income_sources(id,user_id,name,kind,currency,mode,amount,frequency,start_date,linked_record_id,schedule_id)
  VALUES(gen_random_uuid(),asset.user_id,asset.name,CASE WHEN asset.kind='Property' THEN 'Rent income' ELSE 'Business income' END,asset.currency,'fixed',asset.estimated_monthly_income,'Monthly',asset.date,asset.id,schedule);
 END LOOP;
END $$;
COMMIT;
