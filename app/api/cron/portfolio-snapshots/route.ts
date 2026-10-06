import { cronAuthorized } from '@/lib/cron-auth';
import { reportError } from '@/lib/monitoring';
import { loadMarket } from '@/lib/server-market';
import { readAllPages } from '@/lib/owner-rows';
import { serviceDatabase } from '@/lib/service-role';
import { announceNetWorthHigh } from '@/lib/telegram-milestones';
import { marketSymbols,type MarketData } from '@/lib/market';
import { snapshotTotals } from '@/lib/portfolio-snapshots';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
export const maxDuration=60;
const route='/api/cron/portfolio-snapshots';
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const db=serviceDatabase();
 if(!db)return Response.json({error:'Background capture is not configured.'},{status:503});
 try{
 // Every owner's records: a failed page stops the run rather than capturing a partial portfolio.
 const records=await readAllPages<Entry&{user_id:string}>(range=>db.read(`/rest/v1/finance_records?select=*&order=id.asc&${range}`));
 const symbols=marketSymbols(records);
 // Upstream requests have bounded concurrency and named missing-price failures.
 const market:MarketData=await loadMarket(symbols.crypto,symbols.stocks,true,symbols.metals);
 const owners=new Map<string,Entry[]>();for(const r of records)owners.set(r.user_id,[...(owners.get(r.user_id)??[]),r]);
 let captured=0,skipped=0,celebrated=0;
 for(const [owner,holdings] of owners){const total=snapshotTotals(holdings,market);if(!total){skipped++;continue;}
  const saved=await db.write('/rest/v1/rpc/capture_owner_portfolio_snapshot',{method:'POST',body:JSON.stringify({p_owner:owner,p_day:depositToday(),p_totals:total})});
  if(!saved.ok)throw Error('Snapshot database request failed.');captured++;
  // A celebration that cannot be sent never fails the capture.
  if(await announceNetWorthHigh(owner).catch(()=>false))celebrated++;
 }
 if(skipped)await reportError('cron:portfolio-snapshots','Some portfolios could not be valued, so they were not captured.',{route,status:503,counts:{captured,skipped}},{alert:true});
 return Response.json({captured,skipped,celebrated},{status:skipped?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(error){await reportError('cron:portfolio-snapshots',error,{route,status:503},{alert:true});return Response.json({error:'Background capture failed. Completed captures remain safe to retry.'},{status:503});}
}
