import { z } from 'zod';
import { uuid } from '@/lib/api-validation';
import { postgrestFailure, readJson, requestRejected, signInAgain } from '@/lib/api-route';
import { sameOrigin, session, supa } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
import { income, expenses } from '@/lib/finance';
import { normalizeSplits } from '@/lib/transaction-tools';
const id=uuid;
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('split'),data:z.object({record_id:id,splits:z.array(z.object({category_id:z.union([id,z.enum([...income,...expenses] as [string,...string[]])]),amount:z.number().finite().positive().max(1e15)})).max(50).refine(rows=>rows.length!==1)})}),
 z.object({action:z.literal('forecast'),data:z.object({record_id:id,account_id:id.nullable(),exchange_rate:z.number().finite().positive().max(1e15).optional(),from_currency:z.string().optional(),to_currency:z.string().optional()})})
]);
export async function GET(){
 try{const auth=await session();if(!auth)return signInAgain();
 const [splits,assignments]=await Promise.all(['transaction_splits','forecast_assignments'].map(table=>readOwnerRows(table,auth.token,{order:table==='transaction_splits'?'record_id.asc,position.asc':'record_id.asc'})));
 return Response.json({splits:normalizeSplits(splits as Parameters<typeof normalizeSplits>[0]),assignments},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load transaction tools. Check that the latest migrations are installed.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return requestRejected();
 try{const auth=await session();if(!auth)return signInAgain();
 const parsed=schema.safeParse(await readJson(req));if(!parsed.success)return Response.json({error:'Check the transaction tools fields.'},{status:400});
 const {action,data}=parsed.data;
 const response=await supa('/rest/v1/rpc/'+(action==='split'?'save_transaction_splits':'save_forecast_assignment'),{method:'POST',body:JSON.stringify(action==='split'?{p_record:data.record_id,p_splits:data.splits}:{p_record:data.record_id,p_account:data.account_id,p_rate:data.exchange_rate??null,p_from:data.from_currency??null,p_to:data.to_currency??null})},auth.token);
 if(!response.ok){
  if(action==='split')return postgrestFailure(response,'Could not save transaction tools. Check the categories and database update.');
  const missing=['Forecast assignments require database update 045. Apply the pending database migrations and try again.',503] as const;
  return postgrestFailure(response,'Could not save the forecast assignment. Please try again.',{codes:{PGRST202:missing,PGRST203:missing,'42883':missing,'42703':missing}});
 }
 return Response.json({ok:true});
 }catch{return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
