import { z } from 'zod';
import { session, supa, sameOrigin } from '@/lib/supabase';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
const schema = z.object({ id:z.string().uuid(),record_id:z.string().uuid(),type:z.enum(['valuation','contribution','withdrawal','income','expense']),date,amount:z.number().finite().min(0).max(1e15),balance:z.number().finite().min(0).max(1e15).nullable(),notes:z.string().max(2000) }).refine(p => (p.type==='valuation' ? p.amount===0 : p.amount>0) && (['valuation','contribution','withdrawal'].includes(p.type) ? p.balance!==null : p.balance===null));
const errors = ['Check the tracker fields.','Investment not found.','Use Record payment for mortgage payments.','This update was already saved with different details.','Set a quantity before recording a valuation.'];
export async function GET(req:Request) {
 try {
  const auth=await session(); if(!auth) return Response.json({error:'Please sign in again.'},{status:401});
  const id=new URL(req.url).searchParams.get('record');
  if(!z.string().uuid().safeParse(id).success)return Response.json({error:'Investment not found.'},{status:400});
  // Explicit pagination avoids PostgREST's default row cap silently truncating history.
  const collected:unknown[]=[];
  let offset=0;
  while(true){
   const r=await supa(`/rest/v1/investment_history?record_id=eq.${id}&order=occurred_on.asc,created_at.asc,id.asc&limit=500&offset=${offset}`,{},auth.token);
   if(!r.ok)return Response.json({error:'Could not load history. Apply the tracker migration and try again.'},{status:503});
   const page=await r.json() as unknown[];collected.push(...page);if(page.length<500)break;offset+=500;
  }
  return Response.json(collected);
 }catch{return Response.json({error:'Could not load history. Please try again.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the tracker fields.'},{status:400});
  const p=parsed.data;
  const r=await supa('/rest/v1/rpc/record_investment_event',{method:'POST',body:JSON.stringify({p_id:p.id,p_record_id:p.record_id,p_type:p.type,p_date:p.date,p_amount:p.amount,p_balance:p.balance,p_notes:p.notes})},auth.token);
  if(!r.ok){const e=await r.json() as {message?:string};return Response.json({error:errors.includes(e.message||'')?e.message:'Update could not be confirmed. Retry with the same details.'},{status:errors.includes(e.message||'')?400:503});}
  return Response.json(await r.json());
 }catch{return Response.json({error:'Update could not be confirmed. Retry with the same details.'},{status:503});}
}
