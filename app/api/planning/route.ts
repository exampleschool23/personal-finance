import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
import { depositForecasts } from '@/lib/deposit-forecasts';
import type { Entry } from '@/lib/finance';
import { z } from 'zod';
import { instrumentFor } from '@/lib/market';
import { isCurrency } from '@/lib/currencies';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const id=z.string().uuid(), amount=z.number().finite().min(0).max(1e15);
const base=z.object({exchange_rate:z.number().finite().positive().max(1e15).optional(),id,account_id:id,target_id:id.nullable().optional(),amount,received:amount.default(0),fee:amount.default(0),date,notes:z.string().max(2000).default('')});
const investmentTarget=z.object({holding_account_id:id,asset_kind:z.enum(['Stock','Crypto']),asset_symbol:z.string().trim().max(15),target:amount.positive().max(1e12),monthly_contribution:amount.max(1e12).nullable().default(null)}).refine(v=>instrumentFor({kind:v.asset_kind,name:v.asset_symbol})?.symbol===v.asset_symbol);
const schemas={
 transfer:base.refine(v=>!!v.target_id&&v.target_id!==v.account_id&&v.amount>0&&v.received>0),
 reconcile:base.refine(v=>!v.target_id&&v.received===0&&v.fee===0),
 repayment:base.refine(v=>!!v.target_id&&v.amount>0&&v.received===0),
 mortgage:base.refine(v=>!!v.target_id&&v.amount+v.fee>0&&v.received===0),
 occurrence:z.object({amount:z.number().finite().positive().max(1e15),exchange_rate:z.number().finite().positive().max(1e15).optional(),id,account_id:id,target_id:id,date,notes:z.string().max(2000).default('')}),
 dismiss:z.object({id,target_id:id,date}),
 category:z.object({id,name:z.string().trim().min(1).max(80)}),
 goal:z.object({investment_targets:z.array(investmentTarget).max(50).optional(),id,name:z.string().trim().min(1).max(120),account_id:id.nullable(),kind:z.enum(['savings','net_worth','investment']).default('savings'),currency:z.string().refine(isCurrency).optional(),target:amount.positive(),allocated:amount,target_date:date.nullable(),archived:z.boolean().default(false),monthly_contribution:amount.nullable().default(null),annual_return:z.number().finite().min(0).max(100).default(0),holding_account_id:id.nullable().default(null),asset_kind:z.enum(['Stock','Crypto']).nullable().default(null),asset_symbol:z.string().trim().max(15).nullable().default(null)}).transform(v=>v.kind==='investment'&&v.investment_targets?.length?{...v,...v.investment_targets[0]}:v).refine(v=>{
  if(v.investment_targets!==undefined){
   if(v.kind==='investment'&&!v.investment_targets.length)return false;
   if(v.kind!=='investment'&&v.investment_targets.length)return false;
   if(new Set(v.investment_targets.map(item=>item.holding_account_id.toLowerCase()+':'+item.asset_symbol)).size!==v.investment_targets.length)return false;
  }
  if(v.allocated>v.target)return false;
  if(v.kind==='investment')return v.account_id===null&&v.allocated===0&&!!v.holding_account_id&&!!v.asset_kind&&!!v.asset_symbol&&instrumentFor({kind:v.asset_kind,name:v.asset_symbol})?.symbol===v.asset_symbol&&v.annual_return===0&&v.target<=1e12&&(v.monthly_contribution===null||v.monthly_contribution<=1e12);
  if(v.holding_account_id!==null||v.asset_kind!==null||v.asset_symbol!==null)return false;
  return v.kind==='net_worth'?v.account_id===null&&v.allocated===0&&!!v.currency&&!!v.target_date:!!v.account_id;
 }),
};
export async function GET(){
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const tables={movements:'asset_movements',holdingAccounts:'holding_accounts',records:'finance_records',categories:'custom_categories',goals:'savings_goals',occurrences:'payment_occurrences',activity:'account_activity',investmentLinks:'investment_account_links'};
 const results=await Promise.all(Object.entries(tables).map(async([key,table])=>[key,await readOwnerRows(table,auth.token,table==='investment_account_links'?{select:'*,investment_history(occurred_on,record_id,event_type)'}:{})]));
 const data=Object.fromEntries(results);
 const estimates=new Map((await depositForecasts(auth.token)).map(record=>[record.id,record.estimated_monthly_income]));
 data.records=(data.records as Entry[]).map(record=>record.kind==='Deposit'?{...record,estimated_monthly_income:estimates.get(record.id)??0}:record);
 return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load planning data. Check that the latest migrations are installed.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const body=await req.json() as {action:keyof typeof schemas;data:unknown};
 if(!Object.hasOwn(schemas,body.action))return Response.json({error:'Check the account fields.'},{status:400});
 const parsed=schemas[body.action].safeParse(body.data);if(!parsed.success)return Response.json({error:'Check the account fields.'},{status:400});
 let paymentData=parsed.data;
 if(['occurrence','repayment','mortgage'].includes(body.action)&&'account_id' in parsed.data&&'target_id' in parsed.data){
  const p=parsed.data as {id:string;account_id:string;target_id:string;date:string;exchange_rate?:number;amount?:number;fee?:number;notes?:string};
  const response=await supa(`/rest/v1/finance_records?select=*&id=in.(${p.account_id},${p.target_id},${p.id})`,{},auth.token);
  if(!response.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
  const records=await response.json() as Entry[];
  const account=records.find(record=>record.id===p.account_id&&record.kind==='Cash'),target=records.find(record=>record.id===p.target_id);
  if(!account||!target)return Response.json({error:'Choose one of your cash accounts.'},{status:400});
  if(account.currency!==target.currency){
   const prior=records.find(record=>record.id===p.id&&record.account_id===account.id&&record.currency===target.currency&&record.date===p.date&&record.account_currency===account.currency&&record.account_exchange_rate);
   let priorPayment:{exchange_rate:number;rate_date:string;account_id:string;account_currency:string;record_currency:string;investment_history:{balance:number|null}}|undefined;
   if(body.action!=='occurrence'){
    const history=await supa(`/rest/v1/investment_account_links?select=*,investment_history(balance)&id=eq.${p.id}`,{},auth.token);
    if(!history.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
    [priorPayment]=await history.json();
    if(priorPayment&&(priorPayment.account_id!==account.id||priorPayment.account_currency!==account.currency||priorPayment.record_currency!==target.currency||!priorPayment.exchange_rate))return Response.json({error:'This update was already saved with different details.'},{status:409});
   }
   let rate:number,rateDate:string;
   if(priorPayment){rate=Number(priorPayment.exchange_rate);rateDate=priorPayment.rate_date;}
   else if(prior){rate=Number(prior.account_exchange_rate);rateDate=prior.account_rate_date!;}
   else{try{const quote=await loadDatedExchangeRate(account.currency,target.currency,p.date);rate=quote.rate;rateDate=quote.effective_date;}catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:422});}}
   if(rate!==p.exchange_rate)return Response.json({error:'The exchange rate changed. Refresh the rate and review the amounts.'},{status:409});
   if(body.action==='occurrence')paymentData={...parsed.data,account_exchange_rate:rate,account_rate_date:rateDate,account_currency:account.currency} as typeof parsed.data;
   else{
    // Use the same atomic dated-payment function as Tracker and mortgage payments.
    const result=await supa(body.action==='repayment'?'/rest/v1/rpc/record_repayment_with_fx':'/rest/v1/rpc/record_investment_with_fx',{method:'POST',body:JSON.stringify(body.action==='repayment'?{p_data:p,p_rate:rate,p_rate_date:rateDate,p_account_currency:account.currency,p_record_currency:target.currency}:{p_id:p.id,p_record_id:target.id,p_type:body.action==='mortgage'?'mortgage_payment':'withdrawal',p_date:p.date,p_amount:Number(p.amount)+Number(p.fee??0),p_balance:null,p_notes:p.notes??'',p_account:account.id,p_rate:rate,p_rate_date:rateDate,p_account_currency:account.currency,p_record_currency:target.currency,p_principal:body.action==='mortgage'?p.amount:0,p_interest:body.action==='mortgage'?p.fee:0})},auth.token);
    if(!result.ok){const failure=await result.json() as {code?:string;message?:string};return Response.json({error:failure.code==='P0001'?failure.message:'Could not save the operation. Please try again.'},{status:409});}
    return Response.json(await result.json());
   }
  }
 }
 // Older planning_action versions accept unknown JSON keys and silently discard
 // additional holdings. Check schema support before allowing any such write.
 if(body.action==='goal'&&'investment_targets' in parsed.data&&Array.isArray(parsed.data.investment_targets)&&parsed.data.investment_targets.length){
  const support=await supa('/rest/v1/savings_goals?select=investment_targets&limit=0',{},auth.token);
  if(!support.ok)return Response.json({error:'Goal holdings could not be saved. Please try again after the app database is updated.'},{status:503});
 }
 const multiGoal=body.action==='goal'&&'kind' in parsed.data&&parsed.data.kind==='investment'&&'investment_targets' in parsed.data&&Array.isArray(parsed.data.investment_targets);
 const result=await supa(multiGoal?'/rest/v1/rpc/planning_investment_goal':body.action==='occurrence'?'/rest/v1/rpc/planning_action_with_actual_amount':'/rest/v1/rpc/planning_action',{method:'POST',body:JSON.stringify(multiGoal?{p_data:parsed.data}:{p_action:body.action,p_data:paymentData})},auth.token);
 if(!result.ok){const error=await result.json() as {code?:string;message?:string};return Response.json({error:multiGoal&&error.code==='PGRST202'?'Could not save the goal. Check that the latest migrations are installed.':error.code==='P0001'?error.message:error.code==='23514'?'Insufficient balance or invalid amount.':error.code==='23505'?'This name or payment already exists.':'Could not save the operation. Please try again.'},{status:409});}
 return Response.json(await result.json());
 }catch{return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
