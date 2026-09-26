import { loadMarket } from '@/lib/server-market';
import { instrumentFor } from '@/lib/market';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { snapshotTotals } from '@/lib/portfolio-snapshots';
import type { Entry } from '@/lib/finance';
import { trackedKinds } from '@/lib/investment-history';
export async function GET(){
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const snapshots:unknown[]=[];
  for(let offset=0;;offset+=500){
   const response=await supa('/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&order=occurred_on.asc&limit=500&offset='+offset,{},auth.token);
   if(!response.ok)throw Error();const batch=await response.json() as unknown[];snapshots.push(...batch);if(batch.length<500)break;
  }
  return Response.json({snapshots},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Daily portfolio history is awaiting setup.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const records:Entry[]=[];
  for(let offset=0;;offset+=500){
   const params=new URLSearchParams({select:'*',kind:`in.(${trackedKinds.join(',')})`,order:'id.asc',limit:'500',offset:String(offset)});
   const response=await supa('/rest/v1/finance_records?'+params,{},auth.token);if(!response.ok)throw Error();
   const batch=await response.json() as Entry[];records.push(...batch);if(batch.length<500)break;
  }
  const instruments=records.map(instrumentFor).filter(instrument=>instrument!==null);
  const crypto=[...new Set(instruments.filter(i=>i.kind==='Crypto').map(i=>i.symbol))];
  const stocks=[...new Set(instruments.filter(i=>i.kind==='Stock').map(i=>i.symbol))];
  const market=await loadMarket(crypto,stocks,true);
  const totals=snapshotTotals(records,market);
  if(!totals)return Response.json({error:'Complete prices and exchange rates are needed to save today’s portfolio.'},{status:409});
  const response=await supa('/rest/v1/rpc/capture_portfolio_snapshot',{method:'POST',body:JSON.stringify({p_assets:totals.assets,p_debt:totals.debt,p_rates:totals.rates})},auth.token);
  if(!response.ok)throw Error();return Response.json({snapshot:await response.json()},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not save today’s portfolio. Live values are still shown.'},{status:503});}
}
