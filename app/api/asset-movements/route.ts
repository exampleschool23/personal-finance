import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
import { z } from 'zod';
import { session, sameOrigin, supa } from '@/lib/supabase';
const amount = z.number().finite().min(0).max(1e15);
const schema = z.object({
 exchange_rate:z.number().finite().positive().max(1e15).optional(),id:z.string().uuid(), kind:z.enum(['transfer','buy','sell','interest']), source_id:z.string().uuid(), target_id:z.string().uuid(),
 sent:amount, received:amount.positive(), source_value:amount, target_value:amount.positive(), fee:amount,
 date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(date=>Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date), notes:z.string().max(2000),
}).refine(data=>data.kind==='interest'?data.source_id===data.target_id&&data.sent===0:data.source_id!==data.target_id&&data.sent>0);
export async function POST(req:Request) {
 if(!sameOrigin(req))return new Response(null,{status:403});
 try {
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the movement fields.'},{status:400});
  const p=parsed.data;
  let rpc='record_asset_movement',args:Record<string,unknown>={p_data:p};
  if(p.kind==='transfer'){
   const accountsResponse=await supa(`/rest/v1/finance_records?select=id,currency&id=in.(${p.source_id},${p.target_id})`,{},auth.token);
   if(!accountsResponse.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
   const accounts=await accountsResponse.json() as {id:string;currency:string}[];
   const source=accounts.find(account=>account.id===p.source_id),target=accounts.find(account=>account.id===p.target_id);
   if(!source||!target)return Response.json({error:'Choose your own source and destination.'},{status:400});
   if(source.currency!==target.currency){
    if(!p.exchange_rate)return Response.json({error:'Check the dated exchange rate.'},{status:400});
    const priorResponse=await supa(`/rest/v1/asset_movements?select=exchange_rate,rate_date&id=eq.${p.id}`,{},auth.token);
    if(!priorResponse.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
    const [prior]=await priorResponse.json() as {exchange_rate:number|null;rate_date:string}[];
    let rate:number,rateDate:string;
    if(prior){if(!prior.exchange_rate)return Response.json({error:'This operation was already saved with different details.'},{status:409});rate=Number(prior.exchange_rate);rateDate=prior.rate_date;}
    else{try{const quote=await loadDatedExchangeRate(source.currency,target.currency,p.date);rate=quote.rate;rateDate=quote.effective_date;}catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:422});}}
    if(rate!==p.exchange_rate)return Response.json({error:'The exchange rate changed. Refresh the rate and review the amounts.'},{status:409});
    rpc='record_transfer_with_fx';args={p_data:p,p_rate:rate,p_rate_date:rateDate,p_source_currency:source.currency,p_target_currency:target.currency};
   }
  }
  const response=await supa('/rest/v1/rpc/'+rpc,{method:'POST',body:JSON.stringify(args)},auth.token);
  if(!response.ok){const error=await response.json() as {code?:string;message?:string};return Response.json({error:error.code==='P0001'?error.message:'Could not save the movement. Check that the latest migrations are installed.'},{status:409});}
  return Response.json({ok:true});
 }catch{return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
