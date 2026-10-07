// What a finished conversation saves: a record, or a transfer or payment for the planning functions.
import type {Entry} from '../finance';
import type {RecordInput} from '../record-schema';
import {find,recordName} from './steps';
import type {Commit,Draft,FlowContext} from './types';

const blank={quantity:0,cost:0,frequency:'Once' as const,notes:'',ownership_percentage:100,estimated_monthly_income:0};
/** A new cash account, with the balance typed for it. */
const accountRecord=(d:Draft['data'],ctx:FlowContext):RecordInput=>({...blank,id:d.id??ctx.newId,name:d.account_name??'',kind:'Cash',currency:d.currency??'',amount:d.amount??0,quantity:1,rate:0,date:ctx.today,business_id:null,estimated_monthly_payment:0});
/** A new loan, debt or mortgage. It starts today, so its monthly payments fall on today's day of the month. */
const liabilityRecord=(d:Draft['data'],ctx:FlowContext):RecordInput=>({...blank,id:d.id??ctx.newId,name:d.name??'',kind:d.lkind??'Loan',currency:d.currency??'',amount:d.amount??0,rate:d.rate??0,date:d.date??ctx.today,opened_on:ctx.today,business_id:null,estimated_monthly_payment:d.payment??0});
/** An expense or income booked to its account; in another currency, with the dated rate it was converted at. */
function cashFlowCommit(draft:Draft,account:Entry,ctx:FlowContext):Commit{
 const d=draft.data,custom=!!d.custom_category_id;
 const currency=d.currency??account.currency,converted=currency!==account.currency;
 // A business chosen here (or "No business") wins over the account's own business.
 const business=d.business_id!==undefined?d.business_id:account.business_id??null;
 const kind=(custom?(draft.kind==='income'?'Other income':'Other expense'):d.category) as RecordInput['kind'];
 // A scheduled payment names its schedule by id; rent income also carries the schedule's property.
 const schedule=d.schedule_id?find(ctx.records??[],d.schedule_id):undefined;
 const linked=schedule?{occurrence_record_id:schedule.id,...(kind==='Rent income'&&schedule.income_source_id?{income_source_id:schedule.income_source_id}:{})}:{};
 const record:RecordInput={...blank,...linked,id:d.id??ctx.newId,name:recordName(draft,ctx),kind,custom_category_id:d.custom_category_id??null,currency,amount:d.amount??0,rate:0,date:d.date??ctx.today,account_id:account.id,...(business?{business_id:business}:{}),payment_type:'regular',estimated_monthly_payment:0,...(converted?{account_exchange_rate:d.fx_rate}:{})};
 return converted?{type:'record',record,fx:{account_rate_date:d.fx_rate_date??d.date??ctx.today,account_currency:account.currency}}:{type:'record',record};
}
/** A transfer, repayment or mortgage payment for the planning functions. */
function paymentCommit(draft:Draft,account:Entry,ctx:FlowContext):Commit{
 const d=draft.data;
 const base={id:d.id??ctx.newId,account_id:account.id,target_id:d.target_id!,date:d.date??ctx.today,notes:''};
 if(draft.kind==='transfer')return {type:'planning',action:'transfer',data:{...base,amount:d.amount??0,received:d.received??d.amount??0,fee:0}};
 const target=find(ctx.liabilities,d.target_id);
 const action=draft.kind==='repayment'?'repayment':'mortgage',data={...base,amount:d.amount??0,received:0,fee:action==='mortgage'?d.interest??0:0};
 // Paid from an account in another currency: the app's dated-rate payment functions convert it.
 if(target&&target.currency!==account.currency&&d.fx_rate)return {type:'fxpayment',action,data,rate:d.fx_rate,rate_date:d.fx_rate_date??data.date,account_currency:account.currency,record_currency:target.currency};
 return {type:'planning',action,data};
}
/** The record or payment a confirmed draft saves, with the id fixed when its date was chosen. */
export function commitFor(draft:Draft,ctx:FlowContext):Commit{
 const d=draft.data;
 if(draft.kind==='account')return {type:'record',record:accountRecord(d,ctx),resume:d.resume};
 if(draft.kind==='liability')return {type:'record',record:liabilityRecord(d,ctx),resume:d.resume};
 const account=find(ctx.accounts,d.account_id)!;
 return draft.kind==='expense'||draft.kind==='income'?cashFlowCommit(draft,account,ctx):paymentCommit(draft,account,ctx);
}
