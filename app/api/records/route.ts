import { isoDate,uuid,nonnegativeAmount,fiatCurrency } from '@/lib/api-validation';
import { requiresCashAccount } from '@/lib/cash-account-required';
import { resolveEarningSource,type EarningSource } from '@/lib/earning-sources';
import { resolveIncomeSource } from '@/lib/income-sources';
import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
import { depositForecasts } from '@/lib/deposit-forecasts';
import { z } from 'zod';
import { kinds, income, expenses, assetRecordKinds, type Entry } from '@/lib/finance';
import { session,supa,sameOrigin } from '@/lib/supabase';
const validDate=isoDate;
const schema=z.object({revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),is_investment:z.boolean().optional(),earning_source_id:uuid.nullable().optional(),earning_due_on:validDate.nullable().optional(),payment_type:z.enum(['regular','bonus']).default('regular'),income_source_id:uuid.nullable().optional(),income_due_on:validDate.nullable().optional(),account_exchange_rate:z.number().finite().positive().max(1e15).optional(),opened_on:validDate.nullable().optional(),deposit_compounding:z.enum(['monthly','daily','none']).optional(),holding_account_id:uuid.nullable().optional(),account_id:uuid.nullable().optional(),custom_category_id:uuid.nullable().optional(),id:uuid,name:z.string().trim().min(1).max(120),kind:z.enum(kinds),currency:fiatCurrency,amount:nonnegativeAmount,quantity:z.number().finite().min(0).max(1e12),cost:nonnegativeAmount,rate:z.number().finite().min(0).max(1000),date:z.union([validDate,z.literal('')]),lent_date:z.union([validDate,z.literal('')]).optional(),end_date:validDate.nullable().optional(),frequency:z.enum(['Once','Monthly','Yearly']),estimated_monthly_payment:nonnegativeAmount.default(0),estimated_monthly_income:nonnegativeAmount.default(0),ownership_percentage:z.number().finite().min(0).max(100).default(100),business_id:uuid.nullable().optional(),expense_plan_id:uuid.nullable().optional(),notes:z.string().max(2000)}).superRefine((r,ctx)=>{if(r.income_source_id&&(r.kind!=='Rent income'&&(r.kind!=='Salary'||r.frequency!=='Once')))ctx.addIssue({code:'custom',path:['income_source_id'],message:'Choose a matching income source.'});if(r.income_due_on&&(!r.income_source_id||r.kind!=='Salary'))ctx.addIssue({code:'custom',path:['income_due_on'],message:'Choose a matching income source.'});if(r.kind==='Business income'&&!r.business_id)ctx.addIssue({code:'custom',path:['business_id'],message:'Choose a business.'});if(r.opened_on&&(!['Cash','Deposit','Stock','Crypto','Debt','Loan','Mortgage'].includes(r.kind)||(['Debt','Loan','Mortgage'].includes(r.kind)&&r.date&&r.date<r.opened_on)))ctx.addIssue({code:'custom',path:['opened_on'],message:'Check the start and due dates.'});if(r.holding_account_id&&!['Cash','Stock','Crypto'].includes(r.kind))ctx.addIssue({code:'custom',path:['holding_account_id'],message:'Only cash, stocks and crypto can belong to an investment account.'});if(r.account_id && (r.frequency!=='Once'||![...income,...expenses].includes(r.kind)))ctx.addIssue({code:'custom',path:['account_id'],message:'Only actual income and expenses can update an account.'});if(r.end_date && (r.frequency==='Once' || ![...income,...expenses].includes(r.kind) || r.end_date<r.date))ctx.addIssue({code:'custom',path:['end_date'],message:'Check the end date.'});if(r.expense_plan_id && (!expenses.includes(r.kind) || r.frequency!=='Once' || r.business_id))ctx.addIssue({code:'custom',path:['expense_plan_id'],message:'Only one-time personal expenses can link to a plan.'});if(r.business_id && ![...income,...expenses].includes(r.kind))ctx.addIssue({code:'custom',path:['business_id'],message:'Only income and expenses can link to a business.'});if(r.kind==='Money lent'){if(!r.lent_date)ctx.addIssue({code:'custom',path:['lent_date'],message:'Date lent is required.'});if(r.date && r.lent_date && r.date<r.lent_date)ctx.addIssue({code:'custom',path:['date'],message:'Due date must not precede lending date.'});}else if(!r.date)ctx.addIssue({code:'custom',path:['date'],message:'Date is required.'});});
async function handle(req:Request,method:string){if(method!=='GET'&&!sameOrigin(req))return new Response(null,{status:403});try{const s=await session();if(!s)return Response.json({error:'Please sign in again.'},{status:401});let path='/rest/v1/finance_records';let init:RequestInit={};if(method==='GET'){
 const params=new URL(req.url).searchParams;
 const query=z.object({page:z.coerce.number().int().min(1).max(1000000),section:z.enum(['all','assets','cashflow','debts']),currency:fiatCurrency.nullable(),summary:z.enum(['0','1'])}).safeParse({page:params.get('page')||'1',section:params.get('section')||'all',currency:params.get('currency'),summary:params.get('summary')||'0'});
 if(!query.success)return Response.json({error:'Invalid pagination parameters.'},{status:400});
 path='/rest/v1/rpc/finance_records_page';init={method:'POST',body:JSON.stringify({p_page:query.data.page,p_section:query.data.section,p_currency:query.data.currency,p_summary:query.data.summary==='1'})};
 }else if(method==='DELETE'){const {id}=await req.json() as {id:unknown};if(!uuid.safeParse(id).success)return new Response(null,{status:400});path='/rest/v1/rpc/move_item_to_deleted';init={method:'POST',body:JSON.stringify({p_id:id,p_source:'finance_records'})};}else{const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the record fields.'},{status:400});if(requiresCashAccount(parsed.data)&&!parsed.data.account_id)return Response.json({error:'Choose a cash account.'},{status:400});const payload={...parsed.data,account_exchange_rate:null as number|null,account_rate_date:null as string|null,account_currency:null as string|null};
if(parsed.data.earning_source_id){
 const response=await supa('/rest/v1/income_sources?select=*&id=eq.'+parsed.data.earning_source_id,{},s.token);
 if(!response.ok)return Response.json({error:'Could not load income sources.'},{status:503});
 const sources=await response.json() as EarningSource[];
 let original:Entry|undefined;
 if(sources[0]?.archived){const prior=await supa('/rest/v1/finance_records?select=*&id=eq.'+parsed.data.id,{},s.token);if(!prior.ok)return Response.json({error:'Could not load income sources.'},{status:503});original=(await prior.json() as Entry[])[0];}
 try{Object.assign(payload,resolveEarningSource(parsed.data as Entry,sources,original));}catch(error){return Response.json({error:(error as Error).message},{status:400});}
}
if(parsed.data.income_source_id&&!parsed.data.earning_source_id){
 const response=await supa('/rest/v1/finance_records?select=*&id=eq.'+parsed.data.income_source_id,{},s.token);
 if(!response.ok)return Response.json({error:'Could not load income sources.'},{status:503});
 const records=await response.json() as Entry[];
 try{Object.assign(payload,resolveIncomeSource(parsed.data as Entry,records));}
 catch(error){return Response.json({error:(error as Error).message},{status:400});}
}
if(parsed.data.account_id){
 const response=await supa('/rest/v1/finance_records?select=id,kind,currency,account_id,account_exchange_rate,account_rate_date,account_currency,date&id=in.('+parsed.data.account_id+','+parsed.data.id+')',{},s.token);
 if(!response.ok)return Response.json({error:'Could not load accounts or exchange history.'},{status:503});
 const records=await response.json() as Array<{id:string;kind:string;currency:string;account_id:string|null;account_exchange_rate:number|null;account_rate_date:string|null;account_currency:string|null;date:string}>;
 const account=records.find(record=>record.id===parsed.data.account_id&&record.kind==='Cash');
 if(!account)return Response.json({error:'Choose one of your cash accounts.'},{status:400});
 if(account.currency!==parsed.data.currency){
  const prior=records.find(record=>record.id===parsed.data.id&&record.account_id===account.id&&record.currency===parsed.data.currency&&record.date===parsed.data.date&&record.account_currency===account.currency&&record.account_exchange_rate);
  let rate:number,rateDate:string;
  if(prior){rate=Number(prior.account_exchange_rate);rateDate=prior.account_rate_date!;}
  else{try{const quote=await loadDatedExchangeRate(account.currency,parsed.data.currency,parsed.data.date);rate=quote.rate;rateDate=quote.effective_date;}catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:422});}}
  if(parsed.data.account_exchange_rate!==rate)return Response.json({error:'The exchange rate changed. Refresh the rate and review the amounts.'},{status:409});
  Object.assign(payload,{account_exchange_rate:rate,account_rate_date:rateDate,account_currency:account.currency});
 }
}
const {revision,...record}=payload;
init={method:'POST',body:JSON.stringify({p_expected_revision:revision??null,p_record:{...record,business_id:payload.business_id || null,date:parsed.data.date || null,lent_date:parsed.data.kind==='Money lent'?parsed.data.lent_date:null}})};path='/rest/v1/rpc/save_finance_record';}const r=await supa(path,init,s.token);if(!r.ok){const failure=await r.clone().json().catch(()=>({})) as {message?:string;details?:string};if((failure as {code?:string}).code==='PGRST202')return Response.json({error:'The app database needs an update before records can be saved.'},{status:503});const paymentErrors=['This record changed since you opened it. Reload it before saving.','Choose a category matching the transaction type.','Edit this schedule in Income sources.','Choose an active income source.','Source payments must be one-time income.','Choose a scheduled payment date.','This scheduled payment is already recorded.','Variable income and bonuses have no scheduled due date.','Choose a matching income source.','Choose a scheduled salary date.','This salary payment is already recorded.','This income source has linked records.','Clear the split before changing the transaction amount or type.','Check the dated exchange rate.','This record has saved tracker updates or transactions and cannot be deleted.','Check the start and due dates.','The start date cannot change after creation.','Check the opening balance date.','The opening balance date cannot change after creation.','Movement income and fees cannot be edited or deleted.','Choose one of your matching stock or crypto accounts.','Account operation fees cannot be edited or deleted.','Choose one of your cash accounts.','The account and transaction currencies must match.','Only actual income and expenses can update an account.','Check the expense plan, currency and spending date.','Tracked cash movements cannot be edited or deleted.','Tracked records must keep their category and currency.','Payment records cannot be edited or deleted.','A mortgage with payments must keep its category and currency.'];if(failure.message && paymentErrors.includes(failure.message))return Response.json({error:failure.message},{status:409});if(failure.details?.includes('payment_occurrences'))return Response.json({error:'This scheduled payment is already recorded. Keep its transaction.'},{status:409});if(failure.details?.includes('investment_history'))return Response.json({error:'This record has investment history and cannot be deleted.'},{status:409});if(failure.details?.includes('mortgage_payments'))return Response.json({error:'This mortgage has recorded payments and cannot be deleted.'},{status:409});}if(!r.ok && r.status===400)return Response.json({error:'Insufficient balance or invalid amount.'},{status:409});if(!r.ok && r.status===409)return Response.json({error:'This business has linked records. Unlink them before deleting or changing its category.'},{status:409});if(!r.ok)return Response.json({error:'Could not access your records. Confirm the database setup and try again.'},{status:503});if(method==='DELETE')return Response.json({ok:true});
const data=await r.json() as {summary?:Entry[];records?:Entry[];total?:number;page?:number};
if(method==='GET' && new URL(req.url).searchParams.get('section')==='assets'){
 // Load every holding so live prices and exchange rates can determine order before pagination.
 const records:Entry[]=[];
 for(let offset=0;;offset+=500){
  const params=new URLSearchParams({select:'*',kind:`in.(${assetRecordKinds.join(',')})`,order:'id.asc',limit:'500',offset:String(offset)});
  const response=await supa('/rest/v1/finance_records?'+params,{},s.token);
  if(!response.ok)return Response.json({error:'Could not access your records. Confirm the database setup and try again.'},{status:503});
  const batch=await response.json() as Entry[];
  records.push(...batch);
  if(batch.length<500)break;
 }
 data.records=records;data.total=records.length;
 data.page=Math.min(data.page ?? 1,Math.max(1,Math.ceil(records.length/10)));
}
if(method==='GET' && data.summary){
 const deposits=await depositForecasts(s.token);
 data.summary=[...data.summary.filter((entry:{kind:string})=>entry.kind!=='Deposit'),...deposits];
}
return Response.json(data);}catch{return Response.json({error:'Connection unavailable. Your changes have not been saved.'},{status:503});}}
export const GET=(r:Request)=>handle(r,'GET');export const POST=(r:Request)=>handle(r,'POST');export const DELETE=(r:Request)=>handle(r,'DELETE');
