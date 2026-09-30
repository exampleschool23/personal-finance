import { planningReadFilters,currentReviewMonth } from '@/lib/planning-reads';
import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
import { depositForecasts } from '@/lib/deposit-forecasts';
import type { Entry } from '@/lib/finance';
import { isoDate } from '@/lib/api-validation';
import { planningSchemas } from '@/lib/planning-schemas';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
import { queueActionNotification } from '@/lib/notify-action';
import type { ActionEvent } from '@/lib/action-messages';
export async function GET(req?:Request){
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const scope=req?new URL(req.url).searchParams.get('scope')??'full':'full';
 if(!['full','review','workspace','insights'].includes(scope))return Response.json({error:'Invalid planning scope.'},{status:400});
 const month=req?new URL(req.url).searchParams.get('month')??currentReviewMonth():currentReviewMonth();
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isoDate.safeParse(month+'-01').success)return Response.json({error:'Invalid review month.'},{status:400});
 const filters=planningReadFilters(scope,month);
 const tables={movements:'asset_movements',holdingAccounts:'holding_accounts',records:'finance_records',categories:'transaction_categories',goals:'savings_goals',occurrences:'payment_occurrences',activity:'account_activity',investmentLinks:'investment_account_links'};
 const results=await Promise.all(Object.entries(tables).filter(([key])=>scope==='insights'?key==='records':scope==='full'||(key!=='movements'&&(scope==='review'||!['activity','investmentLinks'].includes(key)))).map(async([key,table])=>[key,await readOwnerRows(table,auth.token,filters[key as keyof typeof filters]??{})]));
 const data={records:[],categories:[],goals:[],occurrences:[],activity:[],movements:[],investmentLinks:[],...Object.fromEntries(results)} as Record<string,unknown>;
 const estimates=new Map((scope==='insights'?[]:await depositForecasts(auth.token)).map(record=>[record.id,record.estimated_monthly_income]));
 data.records=(data.records as Entry[]).map(record=>record.kind==='Deposit'?{...record,estimated_monthly_income:estimates.get(record.id)??0}:record);
 return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load planning data. Check that the latest migrations are installed.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const body=await req.json() as {action:keyof typeof planningSchemas;data:unknown};
 if(!Object.hasOwn(planningSchemas,body.action))return Response.json({error:'Check the account fields.'},{status:400});
 const parsed=planningSchemas[body.action].safeParse(body.data);if(!parsed.success)return Response.json({error:'Check the account fields.'},{status:400});
 if(body.action==='delete_goal'){
  // Moves the goal and its activity to Recently deleted; retries are harmless.
  const response=await supa('/rest/v1/rpc/delete_savings_goal',{method:'POST',body:JSON.stringify({p_id:(parsed.data as {id:string}).id})},auth.token);
  if(!response.ok){const error=await response.json() as {code?:string;message?:string};return Response.json({error:error.code==='PGRST202'?'Goal deletion needs the latest database update.':error.code==='P0001'?error.message:'Could not delete the goal. Please try again.'},{status:error.code==='PGRST202'?503:409});}
  queueActionNotification(auth,{type:'goal_deleted'});
  return Response.json({ok:true});
 }
 if(body.action==='exception'&&'skip' in parsed.data){
  const response=await supa('/rest/v1/rpc/set_schedule_exception',{method:'POST',body:JSON.stringify({p_record:parsed.data.target_id,p_day:parsed.data.date,p_skip:parsed.data.skip})},auth.token);
  if(!response.ok){const error=await response.json() as {code?:string;message?:string};return Response.json({error:error.code==='P0001'?error.message:'Could not update the scheduled occurrence.'},{status:409});}
  queueActionNotification(auth,{type:'exception',target_id:parsed.data.target_id,date:parsed.data.date,skip:parsed.data.skip});
  return Response.json({ok:true});
 }
 let paymentData=parsed.data;
 if(['occurrence','repayment','mortgage'].includes(body.action)&&'account_id' in parsed.data&&'target_id' in parsed.data){
  const p=parsed.data as unknown as {id:string;account_id:string;target_id:string;date:string;exchange_rate?:number;amount?:number;fee?:number;notes?:string};
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
    const fxEvent=planningEvent(body.action,parsed.data);if(fxEvent)queueActionNotification(auth,fxEvent);
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
 const event=planningEvent(body.action,parsed.data);if(event)queueActionNotification(auth,event);
 return Response.json(await result.json());
 }catch{return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
/** The message-worthy summary of a saved planning action; categories and skipped kinds give null. */
function planningEvent(action:string,data:unknown):ActionEvent|null{
 const p=data as {account_id:string;target_id:string|null;amount:number;received:number;fee:number;date:string;name:string;target:number;currency?:string};
 switch(action){
  case 'occurrence':return {type:'occurrence',account_id:p.account_id,target_id:p.target_id!,amount:p.amount,date:p.date};
  case 'repayment':return {type:'repayment',account_id:p.account_id,target_id:p.target_id!,amount:p.amount,date:p.date};
  case 'mortgage':return {type:'mortgage',account_id:p.account_id,target_id:p.target_id!,principal:p.amount,interest:p.fee,date:p.date};
  case 'transfer':return {type:'transfer',account_id:p.account_id,target_id:p.target_id!,amount:p.amount,received:p.received,date:p.date};
  case 'reconcile':return {type:'reconcile',account_id:p.account_id,amount:p.amount,date:p.date};
  case 'dismiss':return {type:'dismiss',target_id:p.target_id!,date:p.date};
  case 'goal':return {type:'goal',name:p.name,target:p.target,currency:p.currency??''};
  default:return null;
 }
}
