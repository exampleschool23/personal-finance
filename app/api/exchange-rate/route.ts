import { session } from '@/lib/supabase';
import { isCurrency } from '@/lib/currencies';
import { depositToday } from '@/lib/deposit-interest';
import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
export async function GET(req:Request){
 try{
  if(!await session())return Response.json({error:'Please sign in again.'},{status:401});
  const params=new URL(req.url).searchParams,from=params.get('from')??'',to=params.get('to')??'',date=params.get('date')??'';
  if(!isCurrency(from)||!isCurrency(to)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>depositToday())return Response.json({error:'Choose valid dates ending today or earlier.'},{status:400});
  return Response.json(await loadDatedExchangeRate(from,to,date),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:503});}
}
