-- Money lent starts on the day it was lent. Needs only 115; independent of 116.
-- A record's first tracked value (its baseline) is dated with opened_on, and
-- falls back to the day it was saved. Money lent keeps its start in lent_date
-- instead, so a loan entered in October for money lent in August showed up as
-- new investment funding in October. The baseline now follows lent_date when
-- the record is saved or its lent date changes, as long as it stays the
-- record's first event and the date is not in the future. Existing baselines
-- are moved the same way. No balances change.
BEGIN;

CREATE OR REPLACE FUNCTION public.date_money_lent_baseline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.kind<>'Money lent' OR NEW.lent_date IS NULL OR NEW.lent_date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RETURN NEW; END IF;
 IF public.finance_restore_active() OR current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 UPDATE public.investment_history h SET occurred_on=NEW.lent_date
 WHERE h.record_id=NEW.id AND h.event_type='baseline' AND h.occurred_on<>NEW.lent_date
  AND NOT EXISTS(SELECT 1 FROM public.investment_history o WHERE o.record_id=NEW.id AND o.id<>h.id AND o.occurred_on<NEW.lent_date);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.date_money_lent_baseline() FROM PUBLIC,anon,authenticated;
-- Runs after capture_investment_balance (triggers fire by name), so a new record's baseline exists.
DROP TRIGGER IF EXISTS date_money_lent_baseline ON public.finance_records;
CREATE TRIGGER date_money_lent_baseline AFTER INSERT OR UPDATE OF lent_date,kind ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.date_money_lent_baseline();

UPDATE public.investment_history h SET occurred_on=r.lent_date
FROM public.finance_records r
WHERE r.id=h.record_id AND r.kind='Money lent' AND h.event_type='baseline'
 AND r.lent_date IS NOT NULL AND r.lent_date<=(now() AT TIME ZONE 'Asia/Tashkent')::date AND h.occurred_on<>r.lent_date
 AND NOT EXISTS(SELECT 1 FROM public.investment_history o WHERE o.record_id=r.id AND o.id<>h.id AND o.occurred_on<r.lent_date);

NOTIFY pgrst,'reload schema';
COMMIT;
