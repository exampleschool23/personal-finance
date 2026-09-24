import {z} from 'zod';
import {session,sameOrigin,supa} from '@/lib/supabase';
import {uuid,isoDate} from '@/lib/api-validation';
const query=z.object({account:uuid,from:isoDate,to:isoDate});
const amount=z.number().finite().min(-1e15).max(1e15);
const schema=z.object({id:uuid,account_id:uuid,start_date:isoDate,end_date:isoDate,opening_balance:amount,closing_balance:amount,cleared:z.array(z.string().max(100)).max(5000),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),status:z.enum(['draft','reconciled']),revision:z.number().int().positive().nullable().optional()});
export async function GET(req:Request){try{
 const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const parsed=query.safeParse(Object.fromEntries(new URL(req.url).searchParams));if(!parsed.success)return Response.json({error:'Check the statement dates.'},{status:400});
 const {account,from,to}=parsed.data;
 const [state,saved]=await Promise.all([supa('/rest/v1/rpc/account_statement',{method:'POST',body:JSON.stringify({p_account:account,p_start:from,p_end:to})},auth.token),supa(`/rest/v1/account_reconciliations?account_id=eq.${account}&select=id,account_id,start_date,end_date,opening_balance,closing_balance,cleared,fingerprint,status,revision&order=end_date.desc,id&limit=50`,{},auth.token)]);
 if(!state.ok||!saved.ok){const e=await (!state.ok?state:saved).json() as {code?:string;message?:string};return Response.json({error:e.code==='P0001'?e.message:'Could not load the statement.'},{status:409});}
 return Response.json({...await state.json() as Record<string,unknown>,saved:await saved.json()},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Could not load the statement.'},{status:503});}}
export async function POST(req:Request){if(!sameOrigin(req))return new Response(null,{status:403});try{
 const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the statement fields.'},{status:400});
 const result=await supa('/rest/v1/rpc/save_account_reconciliation',{method:'POST',body:JSON.stringify({p_data:parsed.data})},auth.token);
 if(!result.ok){const e=await result.json() as {code?:string;message?:string};return Response.json({error:e.code==='P0001'?e.message:'Could not save the statement.'},{status:409});}
 return Response.json(await result.json());
}catch{return Response.json({error:'Could not save the statement.'},{status:503});}}
