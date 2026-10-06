import { loadMarket } from '@/lib/server-market';
import { marketSymbols } from '@/lib/market';
import { crossSite,signInAgain } from '@/lib/api-route';
import { pagePath,readAllPages } from '@/lib/owner-rows';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { snapshotTotals } from '@/lib/portfolio-snapshots';
import type { Entry } from '@/lib/finance';
import { trackedKinds } from '@/lib/investment-history';
export async function GET(){
 try{
  const auth=await session();if(!auth)return signInAgain();
  const snapshots=await readAllPages(range=>supa(pagePath('/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&order=occurred_on.asc',range),{},auth.token));
  return Response.json({snapshots},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Daily portfolio history is awaiting setup.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return crossSite();
 try{
  const auth=await session();if(!auth)return signInAgain();
  const params=new URLSearchParams({select:'*',kind:`in.(${trackedKinds.join(',')})`,order:'id.asc'});
  const records=await readAllPages<Entry>(range=>supa(pagePath('/rest/v1/finance_records?'+params,range),{},auth.token));
  const symbols=marketSymbols(records);
  const market=await loadMarket(symbols.crypto,symbols.stocks,true,symbols.metals);
  const totals=snapshotTotals(records,market);
  if(!totals)return Response.json({error:'Complete prices and exchange rates are needed to save today’s portfolio.'},{status:409});
  const response=await supa('/rest/v1/rpc/capture_portfolio_snapshot',{method:'POST',body:JSON.stringify({p_assets:totals.assets,p_debt:totals.debt,p_rates:totals.rates})},auth.token);
  if(!response.ok)throw Error();return Response.json({snapshot:await response.json()},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not save today’s portfolio. Live values are still shown.'},{status:503});}
}
