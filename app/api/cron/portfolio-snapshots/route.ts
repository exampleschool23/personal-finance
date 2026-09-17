import { timingSafeEqual } from 'node:crypto';
import { loadMarket } from '@/lib/server-market';
import { instrumentFor,type MarketData } from '@/lib/market';
import { snapshotTotals } from '@/lib/portfolio-snapshots';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
export const maxDuration=60;
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET,authorization=req.headers.get('authorization')??'';
 const expected=secret?'Bearer '+secret:'';
 if(!secret||Buffer.byteLength(authorization)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(authorization),Buffer.from(expected)))return new Response(null,{status:401});
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.SUPABASE_URL;
 if(!key||!url)return Response.json({error:'Background capture is not configured.'},{status:503});
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 async function read(path:string,init:RequestInit={}){const r=await fetch(url+path,{...init,headers:{...headers,...init.headers},cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Snapshot database request failed.');return r;}
 try{
 const records:Array<Entry&{user_id:string}>=[];
 for(let offset=0;;offset+=500){const r=await read('/rest/v1/finance_records?select=*&order=id.asc&limit=500&offset='+offset);const batch=await r.json() as Array<Entry&{user_id:string}>;records.push(...batch);if(batch.length<500)break;}
 const instruments=records.map(instrumentFor).filter(i=>i!==null);
 const crypto=[...new Set(instruments.filter(i=>i?.kind==='Crypto').map(i=>i!.symbol))];
 const stocks=[...new Set(instruments.filter(i=>i?.kind==='Stock').map(i=>i!.symbol))];
 // Upstream requests have bounded concurrency and named missing-price failures.
 const market:MarketData=await loadMarket(crypto,stocks,true);
 const owners=new Map<string,Entry[]>();for(const r of records)owners.set(r.user_id,[...(owners.get(r.user_id)??[]),r]);
 let captured=0,skipped=0;
 for(const [owner,holdings] of owners){const total=snapshotTotals(holdings,market);if(!total){skipped++;continue;}
  await read('/rest/v1/portfolio_snapshots?on_conflict=user_id,occurred_on',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:owner,occurred_on:depositToday(),...total,updated_at:new Date().toISOString()})});captured++;
 }
 return Response.json({captured,skipped},{status:skipped?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Background capture failed. Completed captures remain safe to retry.'},{status:503});}
}
