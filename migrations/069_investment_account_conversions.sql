-- Permit direct deposit/security conversions using the existing atomic movement ledger.
CREATE OR REPLACE FUNCTION public.record_asset_movement(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=auth.uid(); a public.finance_records; b public.finance_records; prior public.asset_movements;
 item uuid:=(p_data->>'id')::uuid; action text:=p_data->>'kind'; aid uuid:=(p_data->>'source_id')::uuid; bid uuid:=(p_data->>'target_id')::uuid;
 sent numeric:=(p_data->>'sent')::numeric; received numeric:=(p_data->>'received')::numeric;
 av numeric:=(p_data->>'source_value')::numeric; bv numeric:=(p_data->>'target_value')::numeric; fee numeric:=(p_data->>'fee')::numeric;
 day date:=(p_data->>'date')::date; memo text:=p_data->>'notes'; ab numeric; bb numeric; aa numeric; ba numeric; a_units boolean; b_units boolean; last_day date; gain numeric;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF item IS NULL OR action IS NULL OR action NOT IN ('transfer','buy','sell','interest') OR aid IS NULL OR bid IS NULL
  OR sent IS NULL OR received IS NULL OR av IS NULL OR bv IS NULL OR fee IS NULL OR memo IS NULL OR day IS NULL
  OR sent<0 OR sent>1e15 OR received<=0 OR received>1e15 OR av<0 OR av>1e15 OR bv<=0 OR bv>1e15 OR fee<0 OR fee>1e15
  OR sent::text IN ('NaN','Infinity','-Infinity') OR received::text IN ('NaN','Infinity','-Infinity') OR av::text IN ('NaN','Infinity','-Infinity') OR bv::text IN ('NaN','Infinity','-Infinity') OR fee::text IN ('NaN','Infinity','-Infinity')
  OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the movement fields.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO prior FROM public.asset_movements WHERE id=item;
 IF FOUND THEN
  IF prior.user_id<>owner OR prior.kind<>action OR prior.source_id<>aid OR prior.target_id<>bid OR prior.sent<>sent OR prior.received<>received OR prior.source_value<>av OR prior.target_value<>bv OR prior.fee<>fee OR prior.occurred_on<>day OR prior.notes<>memo THEN RAISE EXCEPTION 'This operation was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 PERFORM id FROM public.finance_records WHERE id IN(aid,bid) AND user_id=owner ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner;
 SELECT * INTO b FROM public.finance_records WHERE id=bid AND user_id=owner;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Choose your own source and destination.'; END IF;
 a_units:=a.kind IN ('Stock','Crypto'); b_units:=b.kind IN ('Stock','Crypto');
 IF action='interest' THEN
  IF aid<>bid OR a.kind<>'Deposit' OR sent<>0 OR av<>0 OR bv<>received OR fee<>0 THEN RAISE EXCEPTION 'Choose a deposit for capitalized interest.'; END IF;
 ELSE
  IF aid=bid OR sent<=0 OR av<=0 THEN RAISE EXCEPTION 'Choose a different destination.'; END IF;
  IF action='transfer' AND (a.kind NOT IN ('Cash','Deposit') OR b.kind NOT IN ('Cash','Deposit')) THEN RAISE EXCEPTION 'Transfer between cash and deposit balances.'; END IF;
  IF action='buy' AND (a.kind NOT IN ('Cash','Deposit','Stock','Crypto') OR NOT b_units) THEN RAISE EXCEPTION 'Choose cash or crypto to buy a holding.'; END IF;
  IF action='sell' AND (NOT a_units OR b.kind NOT IN ('Cash','Deposit','Stock','Crypto')) THEN RAISE EXCEPTION 'Choose cash or crypto for the sale proceeds.'; END IF;
  IF (NOT a_units AND av<>sent) OR (NOT b_units AND bv<>received) THEN RAISE EXCEPTION 'Check the settlement amounts.'; END IF;
  IF action='transfer' AND fee>=sent THEN RAISE EXCEPTION 'The transfer fee must be less than the amount sent.'; END IF;
  IF action='buy' AND fee>bv THEN RAISE EXCEPTION 'The purchase fee cannot exceed its total cost.'; END IF;
  IF action='transfer' AND a.currency=b.currency AND sent<>received+fee THEN RAISE EXCEPTION 'The amount received plus fee must equal the amount sent.'; END IF;
  IF action IN ('buy','sell') AND a.currency=b.currency AND av<>bv THEN RAISE EXCEPTION 'Use the same net trade value in both holdings.'; END IF;
 END IF;
 -- New operations must follow recorded balance changes: never overwrite later history.
 SELECT max(occurred_on) INTO last_day FROM public.investment_history WHERE record_id IN(aid,bid) AND balance IS NOT NULL;
 IF day<last_day THEN RAISE EXCEPTION 'Choose a date on or after the latest balance update.'; END IF;
 ab:=CASE WHEN a_units THEN a.quantity ELSE a.amount END; bb:=CASE WHEN b_units THEN b.quantity ELSE b.amount END;
 IF sent>ab THEN RAISE EXCEPTION 'Insufficient balance or holding quantity.'; END IF;
 aa:=ab-sent; ba:=bb+received;
 IF (a_units AND sent>1e12) OR (b_units AND ba>1e12) OR (NOT b_units AND ba>1e15) THEN RAISE EXCEPTION 'Check the movement fields.'; END IF;
 IF a_units THEN gain:=av-sent*a.cost; END IF;
 INSERT INTO public.asset_movements(id,user_id,kind,source_id,target_id,sent,received,source_value,target_value,fee,occurred_on,notes,source_before,source_after,target_before,target_after,realized_gain)
 VALUES(item,owner,action,aid,bid,sent,received,av,bv,fee,day,memo,ab,CASE WHEN action='interest' THEN ba ELSE aa END,bb,ba,gain);
 PERFORM set_config('finance.history_write','1',true);
 IF action<>'interest' THEN
  UPDATE public.finance_records SET quantity=CASE WHEN a_units THEN aa ELSE quantity END,amount=CASE WHEN a_units THEN amount ELSE aa END WHERE id=aid;
  INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
  VALUES(owner,aid,'withdrawal',day,av,CASE WHEN a_units THEN aa*a.amount ELSE aa END,memo);
 END IF;
 UPDATE public.finance_records SET quantity=CASE WHEN b_units THEN ba ELSE quantity END,
  amount=CASE WHEN b_units THEN CASE WHEN bb=0 THEN bv/received ELSE amount END ELSE ba END,
  cost=CASE WHEN b_units THEN (bb*cost+bv)/ba ELSE cost END WHERE id=bid;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,amount,balance,notes)
 VALUES(owner,bid,CASE WHEN action='interest' THEN 'income' ELSE 'contribution' END,day,bv,
 CASE WHEN b_units THEN ba*CASE WHEN bb=0 THEN bv/received ELSE b.amount END ELSE ba END,memo);
 PERFORM set_config('finance.history_write','0',true);
 IF fee>0 OR action='interest' THEN
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,movement_id)
  VALUES(gen_random_uuid(),owner,CASE WHEN action='interest' THEN b.name ELSE 'Transaction fee' END,CASE WHEN action='interest' THEN 'Other income' ELSE 'Other expense' END,
  CASE WHEN action='buy' THEN b.currency ELSE a.currency END,CASE WHEN action='interest' THEN received ELSE fee END,day,'Once',memo,item);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
NOTIFY pgrst, 'reload schema';
