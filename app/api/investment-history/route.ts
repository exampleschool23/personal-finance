import { z } from 'zod';
import { isoDate, nonnegativeAmount, uuid } from '@/lib/api-validation';
import { crossSite, readJson, signInAgain } from '@/lib/api-route';
import { readAllPages } from '@/lib/owner-rows';
import { session, supa, sameOrigin } from '@/lib/supabase';
const schema = z.object({ account_id:uuid.optional(),id:uuid,record_id:uuid,type:z.enum(['valuation','contribution','withdrawal','income','expense']),date:isoDate,amount:nonnegativeAmount,balance:nonnegativeAmount.nullable(),notes:z.string().max(2000) }).refine(p => (p.type==='valuation' ? p.amount===0 : p.amount>0) && (p.type==='valuation' ? p.balance!==null : ['income','expense'].includes(p.type) ? p.balance===null : true));
const errors = ['Choose a cash account in the record currency.','Not enough money in the selected cash account.','Enter transactions on or after the latest cash balance date.','This update was already saved without an account.','Choose an account in the investment currency.','This update type is not available for this record.','Enter debt additions and repayments without a balance override.','Enter updates on or after the latest balance date.','Repayment cannot exceed the outstanding balance.','Check the tracker fields.','Investment not found.','Use Record payment for mortgage payments.','This update was already saved with different details.','Set a quantity before recording a valuation.'];
export async function GET(req:Request) {
 try {
  const auth=await session(); if(!auth) return signInAgain();
  const id=new URL(req.url).searchParams.get('record');
  if(!uuid.safeParse(id).success)return Response.json({error:'Investment not found.'},{status:400});
  // Explicit pagination avoids PostgREST's default row cap silently truncating history.
  const collected=await readAllPages(range=>supa(`/rest/v1/investment_history?select=*,account_link:investment_account_links(account_id,amount,account_currency,record_currency,exchange_rate,rate_date)&record_id=eq.${id}&order=occurred_on.asc,created_at.asc,id.asc&${range}`,{},auth.token),'missing');
  return Response.json(collected);
 }catch(error){return Response.json({error:(error as Error).message==='missing'?'Could not load history. Apply the tracker migration and try again.':'Could not load history. Please try again.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return crossSite();
 try{
  const auth=await session();if(!auth)return signInAgain();
  const parsed=schema.safeParse(await readJson(req));if(!parsed.success)return Response.json({error:'Check the tracker fields.'},{status:400});
  const p=parsed.data;
  if(p.type!=='valuation'&&!p.account_id)return Response.json({error:'Choose a cash account.'},{status:400});
  if(p.type==='valuation'&&p.account_id)return Response.json({error:'Check the tracker fields.'},{status:400});
  const r=await supa(p.account_id?'/rest/v1/rpc/record_investment_with_account':'/rest/v1/rpc/record_investment_event',{method:'POST',body:JSON.stringify({p_id:p.id,p_record_id:p.record_id,p_type:p.type,p_date:p.date,p_amount:p.amount,p_balance:p.balance,p_notes:p.notes,...(p.account_id?{p_account:p.account_id}:{})})},auth.token);
  if(!r.ok){const e=await r.json() as {message?:string};return Response.json({error:errors.includes(e.message||'')?e.message:'Update could not be confirmed. Retry with the same details.'},{status:errors.includes(e.message||'')?400:503});}
  return Response.json(await r.json());
 }catch{return Response.json({error:'Update could not be confirmed. Retry with the same details.'},{status:503});}
}

const deleteErrors=['Tracker update not found.','This history entry cannot be deleted here.','Delete newer balance updates first.','Keep the starting snapshot.','Linked cash account is unavailable or its currency changed.','The cash reversal would create an invalid balance.','This repayment was recorded from Accounts and cannot be deleted here.'];
export async function DELETE(req:Request){
 if(!sameOrigin(req))return crossSite();
 try{
  const auth=await session();if(!auth)return signInAgain();
  const parsed=z.object({id:uuid,record_id:uuid}).safeParse(await readJson(req));
  if(!parsed.success)return Response.json({error:'Tracker update not found.'},{status:400});
  const response=await supa('/rest/v1/rpc/delete_tracker_update',{method:'POST',body:JSON.stringify({p_id:parsed.data.id,p_record_id:parsed.data.record_id})},auth.token);
  if(!response.ok){const result=await response.json() as {message?:string};const known=deleteErrors.includes(result.message??'');return Response.json({error:known?result.message:'Could not delete the update. Please try again.'},{status:known?400:503});}
  return Response.json(await response.json());
 }catch{return Response.json({error:'Could not delete the update. Please try again.'},{status:503});}
}
