import { z } from 'zod';
import { isCurrency } from '@/lib/currencies';
import { expensePlanCategories, expensePlanMonth } from '@/lib/expense-plans';
import { session, supa, sameOrigin } from '@/lib/supabase';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v);
const schema = z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(120),category:z.enum(expensePlanCategories),currency:z.string().refine(isCurrency),amount:z.number().finite().positive().max(1e15),start_date:date,end_date:date.nullable()}).refine(p=>!p.end_date || p.end_date>=p.start_date);
async function handle(req:Request, method:string) {
 if(method!=='GET'&&!sameOrigin(req))return new Response(null,{status:403});
 try {
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  let path='/rest/v1/expense_plans', init:RequestInit;
  if(method==='GET') {
   const month=new URL(req.url).searchParams.get('month') || expensePlanMonth();
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({error:'Check the plan fields.'},{status:400});
   path='/rest/v1/rpc/expense_plan_month';init={method:'POST',body:JSON.stringify({p_month:month+'-01'})};
  } else if(method==='DELETE') {
   const {id}=await req.json() as {id:unknown};if(!z.string().uuid().safeParse(id).success)return new Response(null,{status:400});
   path='/rest/v1/rpc/move_item_to_deleted';init={method:'POST',body:JSON.stringify({p_id:id,p_source:'expense_plans'})};
  } else {
   const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the plan fields.'},{status:400});
   path+='?on_conflict=id';init={method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({...parsed.data,user_id:auth.user.id})};
  }
  const result=await supa(path,init,auth.token);
  if(!result.ok){
   const detail=await result.json().catch(()=>({})) as {message?:string;code?:string};
   const message=detail.code==='23503'?'This plan has spending. Set an end date instead of deleting it.':detail.message==='Keep the currency and dates compatible with recorded spending.'?detail.message:'Could not load or save expense plans. Please try again.';
   return Response.json({error:message},{status:detail.code==='23503'||detail.code==='P0001'?409:503});
  }
  return Response.json(method==='GET'?await result.json():{ok:true});
 } catch {return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
export const GET=(req:Request)=>handle(req,'GET');
export const POST=(req:Request)=>handle(req,'POST');
export const DELETE=(req:Request)=>handle(req,'DELETE');
