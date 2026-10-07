import { archivedIn, scheduleDates, income, expenses, interestKinds, type Entry } from './finance';
import type { AssetMovement } from './asset-movements';
import type { HoldingAccount } from './holding-accounts';
import { shiftDay } from './calendar-days';
import { depositToday } from './deposit-interest';
export type Category = {id:string;name:string;direction:'income'|'expense'};
export type InvestmentTarget = {holding_account_id:string;asset_kind:'Stock'|'Crypto';asset_symbol:string;target:number;monthly_contribution?:number|null};
export type Goal = {completed_on?:string|null;funding_priority?:number;funding_monthly?:number|null;funding_enabled?:boolean;paused_until?:string|null;funding_mode?:'one_time'|'refill';investment_targets?:InvestmentTarget[];id:string;name:string;account_id:string|null;target:number;allocated:number;target_date:string|null;archived:boolean;kind?:'savings'|'net_worth'|'investment';holding_account_id?:string|null;asset_kind?:'Stock'|'Crypto'|null;asset_symbol?:string|null;currency?:string;monthly_contribution?:number|null;annual_return?:number};
export type Occurrence = {id:string;record_id:string;due_on:string;status:'paid'|'dismissed';notes?:string|null;transaction_id?:string|null;transaction?:{amount:number;date:string}|null;/** What later payments added, when the read attached them. */extra?:number};
/** A payment that names its schedule by id: the schedule (`occurrence_record_id`) and the due date it pays. */
export type ExtraPayment = {id?:string;occurrence_record_id:string;occurrence_due_on:string;amount:number};
/** What the payments naming each paid due date added after its first one. The first payment settles the due date
 * (`transaction_id`) and may name it too, so it is left out here; every payment is counted once. */
export function laterPayments(occurrences:Occurrence[],payments:ExtraPayment[]):Map<string,number> {
 const first=new Set(occurrences.flatMap(item=>item.transaction_id?[item.transaction_id]:[]));
 const totals=new Map<string,number>();
 for(const payment of payments){
  if(!payment.occurrence_record_id||!payment.occurrence_due_on||(payment.id&&first.has(payment.id)))continue;
  const key=payment.occurrence_record_id+':'+payment.occurrence_due_on;
  totals.set(key,(totals.get(key)??0)+Number(payment.amount));
 }
 return totals;
}
/** Each paid occurrence with the total of the later payments made for it. */
export function withExtraPayments(occurrences:Occurrence[],payments:ExtraPayment[]):Occurrence[] {
 const totals=laterPayments(occurrences,payments);
 return occurrences.map(item=>item.status==='paid'?{...item,extra:totals.get(item.record_id+':'+item.due_on)??0}:item);
}
export type Activity = {id:string;action:string;account_id:string;target_id:string|null;amount:number;received:number;fee:number;occurred_on:string;notes:string;before_balance:number;after_balance:number};
export type PlanningData = {debtPayments?:DebtPayment[];movements?:Array<Omit<AssetMovement,'date'> & {occurred_on:string;realized_gain:number|null}>;holdingAccounts?:HoldingAccount[];records:Entry[];categories:Category[];goals:Goal[];occurrences:Occurrence[];activity:Activity[];investmentLinks?:Array<{id:string;account_id:string;account_currency?:string|null;amount:number;investment_history:{occurred_on:string;record_id:string;event_type:string}}>};
export const emptyPlanning:PlanningData={records:[],categories:[],goals:[],occurrences:[],activity:[]};
export type DueItem = {key:string;record:Entry;date:string;overdue:boolean;type:'scheduled'|'repayment'|'maturity'|'installment';amount:number};
/** A repayment or mortgage payment made against a loan, debt or mortgage on a day. */
export type DebtPayment = {record_id:string;date:string};
/** Repayments from account activity and mortgage payments, as one list. */
export function debtPaymentsFrom(activity:Array<{action:string;target_id:string|null;occurred_on:string}>,mortgagePayments:Array<{mortgage_id:string;paid_on:string}>=[]):DebtPayment[]{
 return [...activity.filter(row=>(row.action==='repayment'||row.action==='mortgage')&&row.target_id).map(row=>({record_id:row.target_id!,date:row.occurred_on})),...mortgagePayments.map(row=>({record_id:row.mortgage_id,date:row.paid_on}))];
}
const liabilityKinds=['Loan','Debt','Mortgage'];
/** A loan, debt or mortgage with an outstanding balance and a positive monthly payment is due every month. */
export const hasMonthlyInstallment=(record:Entry)=>liabilityKinds.includes(record.kind)&&record.amount>0&&Number(record.estimated_monthly_payment??0)>0;
/** The calendar day in Tashkent of a creation timestamp. */
const createdDay=(timestamp:string)=>{const time=Date.parse(timestamp);return Number.isFinite(time)?depositToday(new Date(time)):null;};
/** The day a loan's monthly payments count from: its start date, else the day the record was created, else its due date. */
export function installmentAnchor(record:Entry&{created_at?:string|null}):string|null{
 return record.opened_on||(record.created_at?createdDay(record.created_at):null)||record.date||null;
}
/** Monthly payment days of a loan between two days: on the start date's day of month, after the start and up to the due date. */
export function installmentDates(record:Entry,from:string,through:string):string[]{
 const anchor=installmentAnchor(record);
 if(!anchor||!hasMonthlyInstallment(record))return [];
 const last=record.date&&record.date<through?record.date:through;
 return scheduleDates({date:anchor,frequency:'Monthly'} as Entry,from,last).filter(date=>date>anchor);
}
/** Installments, and payments of a schedule, are owed from the day the record was added: a schedule entered with a
 * start years back is not years overdue. Dates before it stay open to record in their month, but never remind. */
export const installmentsFrom=(record:Entry&{created_at?:string|null})=>(record.created_at?createdDay(record.created_at):null)??'0000-01-01';
/** Loan months already paid: a repayment or mortgage payment for the loan in that month settles that month's installment. */
export const paidInstallmentMonths=(payments:DebtPayment[])=>new Set(payments.map(payment=>payment.record_id+':'+payment.date.slice(0,7)));
/** Schedule occurrences already settled: paid or skipped occurrences, and salary receipts recorded against an income source. */
export function settledOccurrences(records:Entry[],occurrences:Occurrence[]){
 return new Set([...occurrences.map(o=>o.record_id+':'+o.due_on),...records.filter(r=>r.kind==='Salary'&&r.frequency==='Once'&&r.income_source_id).map(r=>r.income_source_id+':'+(r.income_due_on??r.date))]);
}
export const isRecurringCashFlow=(record:Entry)=>[...income,...expenses].includes(record.kind)&&record.frequency!=='Once';
export const scheduleAssets=(records:Entry[])=>new Map(records.filter(record=>['Business','Property'].includes(record.kind)).map(record=>[record.id,record]));
/** Income from a business or property starts no earlier than the asset itself. */
export function scheduleStart(record:Entry,assetsById:Map<string,Entry>){
 const asset=assetsById.get((record.kind==='Business income'?record.business_id:record.kind==='Rent income'?record.income_source_id:null)??'');
 return asset?.date&&asset.date>record.date?asset.date:record.date;
}
export function upcomingPayments(records:Entry[],occurrences:Occurrence[],today=depositToday(),through?:string,debtPayments?:DebtPayment[]):DueItem[] {
 const end=through??shiftDay(today,31);
 const settled=settledOccurrences(records,occurrences),paid=debtPayments&&paidInstallmentMonths(debtPayments);
 const result:DueItem[]=[];
 const assetsById=scheduleAssets(records);
 for(const record of records){
  if(!record.date||record.source_paused||record.archived)continue;
  const recurring=isRecurringCashFlow(record);
  const start=scheduleStart(record,assetsById);
  const add=(date:string,type:DueItem['type'])=>{const key=record.id+':'+date;if(type==='scheduled'&&date<today&&date<installmentsFrom(record))return;if(!archivedIn(record,date.slice(0,7))&&date>=start&&date<=end&&!settled.has(key))result.push({key,record,date,type,overdue:date<today,amount:record.amount});};
  if(recurring){
   for(const date of scheduleDates(record,start,end))add(date,'scheduled');
  }else if(record.amount>0&&['Loan','Debt','Mortgage','Money lent',...interestKinds].includes(record.kind))add(record.date,interestKinds.includes(record.kind)?'maturity':'repayment');
  // Monthly loan payments, only when the caller knows which months were paid: an unpaid month stays overdue until a payment is recorded in it.
  if(paid)for(const date of installmentDates(record,installmentsFrom(record),end))if(date!==record.date&&!paid.has(record.id+':'+date.slice(0,7)))result.push({key:record.id+':installment:'+date,record,date,type:'installment',overdue:date<today,amount:Number(record.estimated_monthly_payment)});
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.record.name.localeCompare(b.record.name));
}
