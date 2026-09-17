import { z } from 'zod';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
import { depositToday } from '@/lib/deposit-interest';
const money=z.number().finite().min(0).max(1e15);
const schema=z.object({id:z.string().uuid(),record_id:z.string().uuid(),account_id:z.string().uuid(),type:z.enum(['contribution','withdrawal','income','expense','mortgage_payment']),amount:money.positive(),balance:money.nullable(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(date=>Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&date<=depositToday()),notes:z.string().max(2000),exchange_rate:z.number().finite().positive().max(1e15),principal:money.default(0),interest:money.default(0)}).refine(data=>data.type!=='mortgage_payment'||data.balance===null&&data.amount===data.principal+data.interest);
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the tracker fields.'},{status:400});
  const p=parsed.data;
  const [recordsResponse,priorResponse]=await Promise.all([
   supa(`/rest/v1/finance_records?select=id,kind,currency&id=in.(${p.record_id},${p.account_id})`,{},auth.token),
   supa(`/rest/v1/investment_account_links?select=account_id,exchange_rate,rate_date,account_currency,record_currency&id=eq.${p.id}`,{},auth.token),
  ]);
  if(!recordsResponse.ok||!priorResponse.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
  const records=await recordsResponse.json() as {id:string;kind:string;currency:string}[];
  const account=records.find(record=>record.id===p.account_id&&record.kind==='Cash'),record=records.find(record=>record.id===p.record_id);
  if(!account||!record||account.id===record.id)return Response.json({error:'Choose one of your cash accounts.'},{status:400});
  const [prior]=await priorResponse.json() as {account_id:string;exchange_rate:number|null;rate_date:string;account_currency:string;record_currency:string}[];
  let rate:number,rateDate:string;
  if(prior){
   if(prior.account_id!==account.id||!prior.exchange_rate||prior.account_currency!==account.currency||prior.record_currency!==record.currency)return Response.json({error:'This update was already saved with different details.'},{status:409});
   // A committed retry uses the stored rate even if the provider is now unavailable.
   rate=Number(prior.exchange_rate);rateDate=prior.rate_date;
  }else if(account.currency===record.currency){rate=1;rateDate=p.date;}
  else{
   try{const quote=await loadDatedExchangeRate(account.currency,record.currency,p.date);rate=quote.rate;rateDate=quote.effective_date;}
   catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:422});}
  }
  if(rate!==p.exchange_rate)return Response.json({error:'The exchange rate changed. Refresh the rate and review the amounts.'},{status:409});
  // Never accept a client-supplied debit or conversion rate as authoritative.
  const response=await supa('/rest/v1/rpc/record_investment_with_fx',{method:'POST',body:JSON.stringify({p_id:p.id,p_record_id:p.record_id,p_type:p.type,p_date:p.date,p_amount:p.amount,p_balance:p.balance,p_notes:p.notes,p_account:p.account_id,p_rate:rate,p_rate_date:rateDate,p_account_currency:account.currency,p_record_currency:record.currency,p_principal:p.principal,p_interest:p.interest})},auth.token);
  if(!response.ok){const error=await response.json() as {code?:string;message?:string};return Response.json({error:error.code==='P0001'?error.message:'Update could not be confirmed. Retry with the same details.'},{status:error.code==='P0001'?409:503});}
  return Response.json({ok:true});
 }catch{return Response.json({error:'Update could not be confirmed. Retry with the same details.'},{status:503});}
}
