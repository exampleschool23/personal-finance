import { z } from 'zod';
import { sameOrigin, session, supa } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('split'),data:z.object({record_id:id,splits:z.array(z.object({category_id:id,amount:z.number().finite().positive().max(1e15)})).max(50).refine(rows=>rows.length!==1)})}),
 z.object({action:z.literal('forecast'),data:z.object({record_id:id,account_id:id.nullable(),exchange_rate:z.number().finite().positive().max(1e15).optional(),from_currency:z.string().optional(),to_currency:z.string().optional()})})
]);
export async function GET(){
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const [splits,assignments]=await Promise.all(['transaction_splits','forecast_assignments'].map(table=>readOwnerRows(table,auth.token,{order:table==='transaction_splits'?'record_id.asc,position.asc':'record_id.asc'})));
 return Response.json({splits,assignments},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load transaction tools. Check that the latest migrations are installed.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Request rejected.'},{status:403});
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the transaction tools fields.'},{status:400});
 const {action,data}=parsed.data;
 const response=await supa('/rest/v1/rpc/'+(action==='split'?'save_transaction_splits':'save_forecast_assignment'),{method:'POST',body:JSON.stringify(action==='split'?{p_record:data.record_id,p_splits:data.splits}:{p_record:data.record_id,p_account:data.account_id,p_rate:data.exchange_rate??null,p_from:data.from_currency??null,p_to:data.to_currency??null})},auth.token);
 if(!response.ok){
  const failure=await response.json() as {code?:string;message?:string};
  if(action==='forecast'){
   const missingMigration=['PGRST202','PGRST203','42883','42703'].includes(failure.code??'');
   return Response.json({error:missingMigration
    ?'Forecast assignments require database update 045. Apply the pending database migrations and try again.'
    :failure.code==='P0001'&&failure.message?failure.message:'Could not save the forecast assignment. Please try again.'},{status:missingMigration?503:409});
  }
  return Response.json({error:failure.code==='P0001'?failure.message:'Could not save transaction tools. Check the categories and database update.'},{status:409});
 }
 return Response.json({ok:true});
 }catch{return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
