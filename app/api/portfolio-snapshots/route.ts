import { z } from 'zod';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { snapshotTotals } from '@/lib/portfolio-snapshots';
import type { Entry } from '@/lib/finance';
const positive=z.number().finite().positive().max(1e27);
const marketSchema=z.object({rates:z.record(z.string().regex(/^[A-Z]{3}$/),positive).optional(),fx:z.object({rate:positive,date:z.string(),source:z.string()}).nullable(),quotes:z.record(z.object({usd:positive,source:z.string(),fetchedAt:z.string().datetime(),marketTime:z.string().optional()}))});
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
  const parsed=marketSchema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Complete prices and exchange rates are needed to save today’s portfolio.'},{status:400});
  const records:Entry[]=[];
  for(let offset=0;;offset+=500){
   const params=new URLSearchParams({select:'*',kind:'in.(Cash,Stock,Crypto,Deposit,Property,Business,Money lent,Mortgage,Loan,Debt)',order:'id.asc',limit:'500',offset:String(offset)});
   const response=await supa('/rest/v1/finance_records?'+params,{},auth.token);if(!response.ok)throw Error();
   const batch=await response.json() as Entry[];records.push(...batch);if(batch.length<500)break;
  }
  const totals=snapshotTotals(records,parsed.data);
  if(!totals)return Response.json({error:'Complete prices and exchange rates are needed to save today’s portfolio.'},{status:409});
  const response=await supa('/rest/v1/rpc/capture_portfolio_snapshot',{method:'POST',body:JSON.stringify({p_assets:totals.assets,p_debt:totals.debt,p_rates:totals.rates})},auth.token);
  if(!response.ok)throw Error();return Response.json({snapshot:await response.json()},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not save today’s portfolio. Live values are still shown.'},{status:503});}
}
