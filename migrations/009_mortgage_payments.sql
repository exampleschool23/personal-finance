-- Atomic, idempotent mortgage payments. Run after 008_ten_records_per_page.sql.
CREATE TABLE public.mortgage_payments (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 mortgage_id uuid NOT NULL REFERENCES public.finance_records(id) ON DELETE RESTRICT,
 principal numeric NOT NULL CHECK (principal >= 0 AND principal <= 1e15),
 interest numeric NOT NULL CHECK (interest >= 0 AND interest <= 1e15),
 paid_on date NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
 CHECK (principal + interest > 0 AND principal + interest <= 1e15)
);
ALTER TABLE public.mortgage_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read mortgage payments" ON public.mortgage_payments FOR SELECT TO authenticated USING (user_id=auth.uid());
REVOKE ALL ON public.mortgage_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mortgage_payments TO authenticated;
ALTER TABLE public.finance_records ADD COLUMN mortgage_payment_id uuid UNIQUE REFERENCES public.mortgage_payments(id) ON DELETE RESTRICT;
ALTER TABLE public.finance_records ADD COLUMN payment_principal numeric, ADD COLUMN payment_interest numeric;
CREATE INDEX mortgage_payments_mortgage ON public.mortgage_payments(mortgage_id);

-- Payment records are immutable: generic record edits/deletes must not detach the
-- cash outflow from the principal reduction. Only the RPC can create their ledger row.
CREATE FUNCTION public.guard_mortgage_payment_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.mortgage_payment_id IS NOT NULL THEN
  RAISE EXCEPTION 'Payment records cannot be edited or deleted.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.kind<>OLD.kind OR NEW.currency<>OLD.currency)
    AND EXISTS(SELECT 1 FROM public.mortgage_payments WHERE mortgage_id=OLD.id) THEN
  RAISE EXCEPTION 'A mortgage with payments must keep its category and currency.';
 END IF;
 IF NEW.mortgage_payment_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.mortgage_payments p JOIN public.finance_records m ON m.id=p.mortgage_id
  WHERE p.id=NEW.mortgage_payment_id AND NEW.id=p.id AND p.user_id=NEW.user_id
  AND m.user_id=NEW.user_id AND NEW.kind='Other expense' AND NEW.currency=m.currency
  AND NEW.payment_principal=p.principal AND NEW.payment_interest=p.interest AND NEW.amount=p.principal+p.interest AND NEW.date=p.paid_on AND NEW.frequency='Once'
 ) THEN RAISE EXCEPTION 'Invalid mortgage payment record'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_mortgage_payment_record BEFORE INSERT OR UPDATE OR DELETE ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.guard_mortgage_payment_record();

CREATE FUNCTION public.record_mortgage_payment(p_id uuid,p_mortgage_id uuid,p_principal numeric,p_interest numeric,p_date date,p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mortgage public.finance_records; existing public.mortgage_payments;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_id IS NULL OR p_mortgage_id IS NULL OR p_principal IS NULL OR p_interest IS NULL OR p_date IS NULL OR p_notes IS NULL
 OR p_principal<0 OR p_interest<0 OR p_principal+p_interest<=0 OR p_principal+p_interest>1e15
 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Check the payment fields.'; END IF;
 SELECT * INTO mortgage FROM public.finance_records WHERE id=p_mortgage_id AND user_id=auth.uid() AND kind='Mortgage' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mortgage not found.'; END IF;
 SELECT * INTO existing FROM public.mortgage_payments WHERE id=p_id;
 IF FOUND THEN
  IF existing.user_id<>auth.uid() OR existing.mortgage_id<>p_mortgage_id OR existing.principal<>p_principal OR existing.interest<>p_interest OR existing.paid_on<>p_date OR existing.notes<>p_notes THEN
   RAISE EXCEPTION 'This payment was already saved with different details.';
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_principal>mortgage.amount THEN RAISE EXCEPTION 'Principal exceeds the outstanding balance.'; END IF;
 INSERT INTO public.mortgage_payments(id,user_id,mortgage_id,principal,interest,paid_on,notes)
 VALUES(p_id,auth.uid(),p_mortgage_id,p_principal,p_interest,p_date,p_notes);
 UPDATE public.finance_records SET amount=amount-p_principal WHERE id=mortgage.id;
 INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,mortgage_payment_id,payment_principal,payment_interest)
 VALUES(p_id,auth.uid(),mortgage.name,'Other expense',mortgage.currency,p_principal+p_interest,p_date,'Once',p_notes,p_id,p_principal,p_interest);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_mortgage_payment(uuid,uuid,numeric,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_mortgage_payment(uuid,uuid,numeric,numeric,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
