import { isoDate } from '@/lib/api-validation';
import { signInAgain, tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';
import { session } from '@/lib/supabase';
import { isCurrency } from '@/lib/currencies';
import { depositToday } from '@/lib/deposit-interest';
import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return signInAgain();
  // Each uncached day is a request to the rate feeds, so readers share the signed-in market limit.
  if(await rateLimited(req,'market-user',limits.market,auth.user.id,{perIp:false}))return tooManyAttempts();
  const params=new URL(req.url).searchParams,from=params.get('from')??'',to=params.get('to')??'',date=params.get('date')??'';
  if(!isCurrency(from)||!isCurrency(to)||!isoDate.safeParse(date).success||date>depositToday())return Response.json({error:'Choose valid dates ending today or earlier.'},{status:400});
  return Response.json(await loadDatedExchangeRate(from,to,date),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:503});}
}
