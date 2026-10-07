import { planningReadFilters,currentReviewMonth } from '@/lib/planning-reads';
import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
import { depositForecasts } from '@/lib/deposit-forecasts';
import { interestKinds, type Entry } from '@/lib/finance';
import { isoDate } from '@/lib/api-validation';
import { planningSchemas } from '@/lib/planning-schemas';
import { debtPaymentsFrom, withExtraPayments } from '@/lib/planning';
import { crossSite,parseAction,postgrestFailure,readJson,signInAgain } from '@/lib/api-route';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
import { categoryNameTaken, duplicateCategoryMessage } from '@/lib/category-names';
import type { Category, ExtraPayment, Occurrence } from '@/lib/planning';
import { queueMilestoneCheck } from '@/lib/notify-action';
import type { ActionEvent } from '@/lib/action-messages';
/** Later payments for recorded occurrences add to them; limited scopes leave those transactions out of `records`. Before migration 112 there are none. */
const readExtraPayments=(scope:string,token:string)=>scope==='insights'?Promise.resolve([] as ExtraPayment[]):readOwnerRows<ExtraPayment>('finance_records',token,{select:'id,occurrence_record_id,occurrence_due_on,amount',occurrence_record_id:'not.is.null'}).catch(()=>[] as ExtraPayment[]);
export async function GET(req?:Request){
 try{const auth=await session();if(!auth)return signInAgain();
 const scope=req?new URL(req.url).searchParams.get('scope')??'full':'full';
 if(!['full','review','workspace','insights','budget'].includes(scope))return Response.json({error:'Invalid planning scope.'},{status:400});
 const month=req?new URL(req.url).searchParams.get('month')??currentReviewMonth():currentReviewMonth();
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isoDate.safeParse(month+'-01').success)return Response.json({error:'Invalid review month.'},{status:400});
 const first=req?new URL(req.url).searchParams.get('from')??undefined:undefined;
 // A budget read covers at most two years, ending with `month`.
 if(scope==='budget'&&(!first||!/^\d{4}-(0[1-9]|1[0-2])$/.test(first)||first>month||(Number(month.slice(0,4))*12+Number(month.slice(5)))-(Number(first.slice(0,4))*12+Number(first.slice(5)))>23))return Response.json({error:'Invalid review month.'},{status:400});
 const filters=planningReadFilters(scope,month,first);
 const tables={movements:'asset_movements',holdingAccounts:'holding_accounts',records:'finance_records',categories:'transaction_categories',goals:'savings_goals',occurrences:'payment_occurrences',activity:'account_activity',investmentLinks:'investment_account_links'};
 const reads=Promise.all(Object.entries(tables).filter(([key])=>scope==='insights'?key==='records':scope==='full'||(key!=='movements'&&(scope==='review'||scope==='budget'||!['activity','investmentLinks'].includes(key)))).map(async([key,table])=>[key,await readOwnerRows(table,auth.token,filters[key as keyof typeof filters]??{})]));
 const extraPayments=readExtraPayments(scope,auth.token);
 const results=await reads;
 const data={records:[],categories:[],goals:[],occurrences:[],activity:[],movements:[],investmentLinks:[],...Object.fromEntries(results)} as Record<string,unknown>;
 // Loan repayments and mortgage payments settle a loan's monthly payment on Recurring and Upcoming payments.
 if(scope==='full'||scope==='workspace'){const [repayments,mortgagePayments]=await Promise.all([readOwnerRows<{action:string;target_id:string|null;occurred_on:string}>('account_activity',auth.token,{select:'action,target_id,occurred_on',action:'in.(repayment,mortgage)'}),readOwnerRows<{mortgage_id:string;paid_on:string}>('mortgage_payments',auth.token,{select:'id,mortgage_id,paid_on'})]);data.debtPayments=debtPaymentsFrom(repayments,mortgagePayments);}
 data.occurrences=withExtraPayments(data.occurrences as Occurrence[],await extraPayments);
 // Every scope but insights reads every holding (only income and expense history is period-limited), so the
 // deposits are already here and are not read again.
 const estimates=new Map((scope==='insights'?[]:await depositForecasts(auth.token,data.records as Entry[])).map(record=>[record.id,record.estimated_monthly_income]));
 data.records=(data.records as Entry[]).map(record=>interestKinds.includes(record.kind)?{...record,estimated_monthly_income:estimates.get(record.id)??0}:record);
 return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load planning data. Check that the latest migrations are installed.'},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return crossSite();
 try{const auth=await session();if(!auth)return signInAgain();
 const input=parseAction(await readJson(req),planningSchemas);if(!input)return Response.json({error:'Check the account fields.'},{status:400});
 const action=input.action,value=input.data;
 if(action==='delete_goal'){
  // Moves the goal and its activity to Recently deleted; retries are harmless.
  const response=await supa('/rest/v1/rpc/delete_savings_goal',{method:'POST',body:JSON.stringify({p_id:(value as {id:string}).id})},auth.token);
  if(!response.ok)return postgrestFailure(response,'Could not delete the goal. Please try again.',{codes:{PGRST202:['Goal deletion needs the latest database update.',503]}});
  queueMilestoneCheck(auth,{type:'goal_deleted'});
  return Response.json({ok:true});
 }
 if(action==='exception'&&'skip' in value){
  // A note travels only when there is one, so a skip still works before migration 104 is applied.
  const note=value.skip?value.notes.trim():'';
  const response=await supa('/rest/v1/rpc/set_schedule_exception',{method:'POST',body:JSON.stringify({p_record:value.target_id,p_day:value.date,p_skip:value.skip,...(note?{p_notes:note}:{})})},auth.token);
  if(!response.ok)return postgrestFailure(response,'Could not update the scheduled occurrence.',{codes:{PGRST202:['The app database needs an update. Ask the administrator to apply the latest migrations.',503]}});
  queueMilestoneCheck(auth,{type:'exception',target_id:value.target_id,date:value.date,skip:value.skip});
  return Response.json({ok:true});
 }
 if(action==='delete_schedule'&&'remove_history' in value){
  const response=await supa('/rest/v1/rpc/delete_schedule',{method:'POST',body:JSON.stringify({p_source:value.source,p_id:value.id,p_remove_history:value.remove_history})},auth.token);
  if(!response.ok)return postgrestFailure(response,'Could not delete this schedule. Please try again.',{codes:{PGRST202:['The app database needs an update. Ask the administrator to apply the latest migrations.',503]}});
  return Response.json({ok:true});
 }
 if(action==='archive'&&'source' in value&&'archived' in value){
  // Only a repeating income or bill, or a spending plan, is archived; its recorded payments are untouched.
  const path=value.source==='plan'?`expense_plans?id=eq.${value.id}`:`finance_records?id=eq.${value.id}&frequency=neq.Once`;
  const response=await supa('/rest/v1/'+path,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({archived:value.archived})},auth.token);
  if(!response.ok)return postgrestFailure(response,'Could not update the scheduled occurrence.',{codes:{PGRST204:['The app database needs an update. Ask the administrator to apply the latest migrations.',503],'42703':['The app database needs an update. Ask the administrator to apply the latest migrations.',503]}});
  if(!(await response.json() as unknown[]).length)return Response.json({error:'Could not update the scheduled occurrence.'},{status:404});
  return Response.json({ok:true});
 }
 if(action==='category'){
  // Letter case alone does not make a new category; the database repeats this check for every writer.
  const category=value as {id:string;name:string;direction:Category['direction']};
  const existing=await readOwnerRows<Category>('transaction_categories',auth.token);
  if(categoryNameTaken(category.name,category.direction,existing,[],category.id))return Response.json({error:duplicateCategoryMessage},{status:409});
 }
 let paymentData:unknown=value;
 if(['occurrence','repayment','mortgage'].includes(action)&&'account_id' in value&&'target_id' in value){
  const p=value as unknown as {id:string;account_id:string;target_id:string;date:string;paid_on?:string;exchange_rate?:number;amount?:number;fee?:number;notes?:string};
  // A scheduled payment converts at the rate of the day it was paid, not its due date.
  const rateDay=p.paid_on??p.date;
  const response=await supa(`/rest/v1/finance_records?select=*&id=in.(${p.account_id},${p.target_id},${p.id})`,{},auth.token);
  if(!response.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
  const records=await response.json() as Entry[];
  const account=records.find(record=>record.id===p.account_id&&record.kind==='Cash'),target=records.find(record=>record.id===p.target_id);
  if(!account||!target)return Response.json({error:'Choose one of your cash accounts.'},{status:400});
  // The database refuses an over-repayment with a generic message; name the real reason, as the bot and the investment tracker do.
  if(action==='repayment'&&account.currency===target.currency&&Number(p.amount)>Number(target.amount))return Response.json({error:'Repayment cannot exceed the outstanding balance.'},{status:409});
  if(account.currency!==target.currency){
   const prior=records.find(record=>record.id===p.id&&record.account_id===account.id&&record.currency===target.currency&&record.date===rateDay&&record.account_currency===account.currency&&record.account_exchange_rate);
   let priorPayment:{exchange_rate:number;rate_date:string;account_id:string;account_currency:string;record_currency:string;investment_history:{balance:number|null}}|undefined;
   if(action!=='occurrence'){
    const history=await supa(`/rest/v1/investment_account_links?select=*,investment_history(balance)&id=eq.${p.id}`,{},auth.token);
    if(!history.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
    [priorPayment]=await history.json();
    if(priorPayment&&(priorPayment.account_id!==account.id||priorPayment.account_currency!==account.currency||priorPayment.record_currency!==target.currency||!priorPayment.exchange_rate))return Response.json({error:'This update was already saved with different details.'},{status:409});
   }
   let rate:number,rateDate:string;
   if(priorPayment){rate=Number(priorPayment.exchange_rate);rateDate=priorPayment.rate_date;}
   else if(prior){rate=Number(prior.account_exchange_rate);rateDate=prior.account_rate_date!;}
   else{try{const quote=await loadDatedExchangeRate(account.currency,target.currency,rateDay);rate=quote.rate;rateDate=quote.effective_date;}catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:422});}}
   if(rate!==p.exchange_rate)return Response.json({error:'The exchange rate changed. Refresh the rate and review the amounts.'},{status:409});
   if(action==='occurrence')paymentData={...value,account_exchange_rate:rate,account_rate_date:rateDate,account_currency:account.currency};
   else{
    // Use the same atomic dated-payment function as Tracker and mortgage payments.
    const result=await supa(action==='repayment'?'/rest/v1/rpc/record_repayment_with_fx':'/rest/v1/rpc/record_investment_with_fx',{method:'POST',body:JSON.stringify(action==='repayment'?{p_data:p,p_rate:rate,p_rate_date:rateDate,p_account_currency:account.currency,p_record_currency:target.currency}:{p_id:p.id,p_record_id:target.id,p_type:action==='mortgage'?'mortgage_payment':'withdrawal',p_date:p.date,p_amount:Number(p.amount)+Number(p.fee??0),p_balance:null,p_notes:p.notes??'',p_account:account.id,p_rate:rate,p_rate_date:rateDate,p_account_currency:account.currency,p_record_currency:target.currency,p_principal:action==='mortgage'?p.amount:0,p_interest:action==='mortgage'?p.fee:0})},auth.token);
    if(!result.ok)return postgrestFailure(result,'Could not save the operation. Please try again.');
    const fxEvent=planningEvent(action,value);if(fxEvent)queueMilestoneCheck(auth,fxEvent);
    return Response.json(await result.json());
   }
  }
 }
 // Older planning_action versions accept unknown JSON keys and silently discard
 // additional holdings. Check schema support before allowing any such write.
 if(action==='goal'&&'investment_targets' in value&&Array.isArray(value.investment_targets)&&value.investment_targets.length){
  const support=await supa('/rest/v1/savings_goals?select=investment_targets&limit=0',{},auth.token);
  if(!support.ok)return Response.json({error:'Goal holdings could not be saved. Please try again after the app database is updated.'},{status:503});
 }
 // The database treats a second payment for a paid occurrence as a retry and reports success
 // without saving it. Only a retry of the same transaction may succeed; another payment is refused.
 // A later payment for an occurrence that is already recorded is asked for explicitly and adds to it.
 const extra=action==='occurrence'&&'extra' in value&&value.extra===true;
 if(action==='occurrence'&&!extra){
  const data=value as {id:string;target_id:string;date:string};
  const prior=await supa('/rest/v1/payment_occurrences?select=transaction_id&status=eq.paid&record_id=eq.'+data.target_id+'&due_on=eq.'+data.date,{},auth.token);
  if(!prior.ok)return Response.json({error:'Could not save the operation. Please try again.'},{status:503});
  if((await prior.json() as {transaction_id:string|null}[]).some(row=>row.transaction_id!==data.id))return Response.json({error:'This scheduled payment is already recorded. Keep its transaction.'},{status:409});
 }
 const multiGoal=action==='goal'&&'kind' in value&&value.kind==='investment'&&'investment_targets' in value&&Array.isArray(value.investment_targets);
 const result=await supa(extra?'/rest/v1/rpc/record_occurrence_extra':multiGoal?'/rest/v1/rpc/planning_investment_goal':action==='occurrence'?'/rest/v1/rpc/planning_action_with_actual_amount':'/rest/v1/rpc/planning_action',{method:'POST',body:JSON.stringify(extra?{p_data:paymentData}:multiGoal?{p_data:value}:{p_action:action,p_data:paymentData})},auth.token);
 if(!result.ok)return postgrestFailure(result,'Could not save the operation. Please try again.',{codes:{...(multiGoal?{PGRST202:'Could not save the goal. Check that the latest migrations are installed.'}:{}),'23514':'Insufficient balance or invalid amount.','23505':'This name or payment already exists.'}});
 const event=planningEvent(action,value);if(event)queueMilestoneCheck(auth,event);
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
