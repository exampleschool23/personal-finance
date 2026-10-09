import { forEachLimited } from '@/lib/bounded-concurrency';
import { cronAuthorized } from '@/lib/cron-auth';
import { reportError } from '@/lib/monitoring';
import { loadMarket } from '@/lib/server-market';
import { readIdPages } from '@/lib/owner-rows';
import { serviceDatabase } from '@/lib/service-role';
import { announceNetWorthHigh } from '@/lib/telegram-milestones';
import { marketSymbols,type MarketData } from '@/lib/market';
import { snapshotTotals } from '@/lib/portfolio-snapshots';
import { depositToday } from '@/lib/deposit-interest';
import { assets, liabilities, type Entry } from '@/lib/finance';
export const maxDuration=60;
const route='/api/cron/portfolio-snapshots';
// Only what snapshotTotals and the market feed read: holdings and debts, never the cash-flow history.
const columns='id,user_id,kind,name,amount,quantity,currency,ownership_percentage,metal,metal_unit,metal_purity';
const kinds=encodeURIComponent([...assets,...liabilities].join(','));
/** Owners valued at once: captures and milestone checks overlap without opening one request per owner. */
const ownerConcurrency=8;
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const db=serviceDatabase();
 if(!db)return Response.json({error:'Background capture is not configured.'},{status:503});
 try{
 // Every owner's holdings, paged by id: a failed page stops the run rather than capturing a partial portfolio.
 const records=await readIdPages<Entry&{user_id:string}>(range=>db.read(`/rest/v1/finance_records?select=${columns}&kind=in.(${kinds})&order=id.asc&${range}`));
 const symbols=marketSymbols(records);
 // Upstream requests have bounded concurrency and named missing-price failures.
 const market:MarketData=await loadMarket(symbols.crypto,symbols.stocks,true,symbols.metals);
 const owners=new Map<string,Entry[]>();
 for(const record of records){const list=owners.get(record.user_id);if(list)list.push(record);else owners.set(record.user_id,[record]);}
 let captured=0,skipped=0,celebrated=0;const day=depositToday();
 await forEachLimited([...owners],ownerConcurrency,async([owner,holdings])=>{
  const total=snapshotTotals(holdings,market);if(!total){skipped++;return;}
  const saved=await db.write('/rest/v1/rpc/capture_owner_portfolio_snapshot',{method:'POST',body:JSON.stringify({p_owner:owner,p_day:day,p_totals:total})});
  if(!saved.ok)throw Error('Snapshot database request failed.');captured++;
  // A celebration that cannot be sent never fails the capture.
  if(await announceNetWorthHigh(owner).catch(()=>false))celebrated++;
 });
 if(skipped)await reportError('cron:portfolio-snapshots','Some portfolios could not be valued, so they were not captured.',{route,status:503,counts:{captured,skipped}},{alert:true});
 return Response.json({captured,skipped,celebrated},{status:skipped?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(error){await reportError('cron:portfolio-snapshots',error,{route,status:503},{alert:true});return Response.json({error:'Background capture failed. Completed captures remain safe to retry.'},{status:503});}
}
