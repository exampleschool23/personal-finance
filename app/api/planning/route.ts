import { z } from 'zod';
import { isCurrency } from '@/lib/currencies';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const id=z.string().uuid(), amount=z.number().finite().min(0).max(1e15);
const base=z.object({id,account_id:id,target_id:id.nullable().optional(),amount,received:amount.default(0),fee:amount.default(0),date,notes:z.string().max(2000).default('')});
const schemas={
 transfer:base.refine(v=>!!v.target_id&&v.target_id!==v.account_id&&v.amount>0&&v.received>0),
 reconcile:base.refine(v=>!v.target_id&&v.received===0&&v.fee===0),
 repayment:base.refine(v=>!!v.target_id&&v.amount>0&&v.received===0),
 mortgage:base.refine(v=>!!v.target_id&&v.amount+v.fee>0&&v.received===0),
 occurrence:z.object({id,account_id:id,target_id:id,date,notes:z.string().max(2000).default('')}),
 dismiss:z.object({id,target_id:id,date}),
 category:z.object({id,name:z.string().trim().min(1).max(80)}),
 goal:z.object({id,name:z.string().trim().min(1).max(120),account_id:id.nullable(),kind:z.enum(['savings','net_worth']).default('savings'),currency:z.string().refine(isCurrency).optional(),target:amount.positive(),allocated:amount,target_date:date.nullable(),archived:z.boolean().default(false),monthly_contribution:amount.nullable().default(null),annual_return:z.number().finite().min(0).max(100).default(0)}).refine(v=>v.allocated<=v.target&&(v.kind==='net_worth'?v.account_id===null&&v.allocated===0&&!!v.currency&&!!v.target_date:!!v.account_id)),
};
export async function GET(){
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const tables={records:'finance_records',categories:'custom_categories',goals:'savings_goals',occurrences:'payment_occurrences',activity:'account_activity',investmentLinks:'investment_account_links'};
 const results=await Promise.all(Object.entries(tables).map(async([key,table])=>[key,await readOwnerRows(table,auth.token,table==='investment_account_links'?{select:'*,investment_history(occurred_on,record_id,event_type)'}:{})]));
 return Response.json(Object.fromEntries(results),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load planning data. Check that the latest migrations are installed.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const body=await req.json() as {action:keyof typeof schemas;data:unknown};
 if(!Object.hasOwn(schemas,body.action))return Response.json({error:'Check the account fields.'},{status:400});
 const parsed=schemas[body.action].safeParse(body.data);if(!parsed.success)return Response.json({error:'Check the account fields.'},{status:400});
 const result=await supa('/rest/v1/rpc/planning_action',{method:'POST',body:JSON.stringify({p_action:body.action,p_data:parsed.data})},auth.token);
 if(!result.ok){const error=await result.json() as {code?:string;message?:string};return Response.json({error:error.code==='P0001'?error.message:error.code==='23514'?'Insufficient balance or invalid amount.':error.code==='23505'?'This name or payment already exists.':'Could not save the operation. Please try again.'},{status:409});}
 return Response.json(await result.json());
 }catch{return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
