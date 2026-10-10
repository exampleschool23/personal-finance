import { archivedIn, budgetKey, scheduleDates, income, expenses, interestKinds, type Entry } from './finance';
import type { AssetMovement } from './asset-movements';
import type { HoldingAccount } from './holding-accounts';
import { shiftDay, withMonthDay } from './calendar-days';
import { depositToday } from './deposit-interest';
import { amountIn, type Money } from './money';
import { sharedDayRate, type DayRate } from './day-rates';
export type Category = {id:string;name:string;direction:'income'|'expense'};
export type InvestmentTarget = {holding_account_id:string;asset_kind:'Stock'|'Crypto';asset_symbol:string;target:number;monthly_contribution?:number|null};
export type Goal = {completed_on?:string|null;funding_priority?:number;funding_monthly?:number|null;funding_enabled?:boolean;paused_until?:string|null;funding_mode?:'one_time'|'refill';investment_targets?:InvestmentTarget[];id:string;name:string;account_id:string|null;target:number;allocated:number;target_date:string|null;archived:boolean;kind?:'savings'|'net_worth'|'investment';holding_account_id?:string|null;asset_kind?:'Stock'|'Crypto'|null;asset_symbol?:string|null;currency?:string;monthly_contribution?:number|null;annual_return?:number};
export type Occurrence = {id:string;record_id:string;due_on:string;status:'paid'|'dismissed';notes?:string|null;transaction_id?:string|null;transaction?:{amount:number|null;date:string;currency?:string;/** As it was entered, when the read converted it into the schedule's currency. */entered?:Money}|null;/** What later payments added, when the read attached them; null when one was in a currency it could not count. */extra?:number|null;/** The same later payments as entered: one currency added up, null when they mix currencies, absent when there are none. */extraEntered?:Money|null};
/** A payment that names its schedule by id: the schedule (`occurrence_record_id`) and the due date it pays. */
export type ExtraPayment = {id?:string;occurrence_record_id:string;occurrence_due_on:string;amount:number;currency?:string;date?:string;/** As it was entered, when the read converted it into the schedule's currency. */entered?:Money};
/** What the payments naming each paid due date added after its first one. The first payment settles the due date
 * (`transaction_id`) and may name it too, so it is left out here; every payment is counted once. Given the schedules'
 * currencies, a payment in another currency makes its due date's total unknown (null) rather than adding a wrong figure. */
export function laterPayments(occurrences:Occurrence[],payments:ExtraPayment[],currencyOf?:Map<string,string>):Map<string,number|null> {
 const first=new Set(occurrences.flatMap(item=>item.transaction_id?[item.transaction_id]:[]));
 const totals=new Map<string,number|null>();
 for(const payment of payments){
  if(!payment.occurrence_record_id||!payment.occurrence_due_on||(payment.id&&first.has(payment.id)))continue;
  const key=payment.occurrence_record_id+':'+payment.occurrence_due_on,currency=currencyOf?.get(payment.occurrence_record_id);
  const amount=currency&&payment.currency?amountIn({amount:payment.amount,currency:payment.currency},currency):Number(payment.amount);
  const total=totals.has(key)?totals.get(key)!:0;
  totals.set(key,total===null||amount===null?null:total+amount);
 }
 return totals;
}
/** Each paid occurrence with the total of the later payments made for it (null when one could not be counted), and the
 * same payments as they were entered (`extraEntered`), so a screen can show what was typed rather than the converted total. */
export function withExtraPayments(occurrences:Occurrence[],payments:ExtraPayment[],currencyOf?:Map<string,string>):Occurrence[] {
 const totals=laterPayments(occurrences,payments,currencyOf);
 const first=new Set(occurrences.flatMap(item=>item.transaction_id?[item.transaction_id]:[]));
 const entered=new Map<string,Money|null>();
 for(const payment of payments){
  if(!payment.occurrence_record_id||!payment.occurrence_due_on||(payment.id&&first.has(payment.id)))continue;
  const key=payment.occurrence_record_id+':'+payment.occurrence_due_on,own=payment.entered??(payment.currency?{amount:Number(payment.amount),currency:payment.currency}:null),before=entered.get(key);
  entered.set(key,before===null||!own||(before&&before.currency!==own.currency)?null:{amount:(before?.amount??0)+own.amount,currency:own.currency});
 }
 return occurrences.map(item=>{
  if(item.status!=='paid')return item;
  const key=item.record_id+':'+item.due_on;
  return {...item,extra:totals.has(key)?totals.get(key)!:0,...(entered.has(key)?{extraEntered:entered.get(key)!}:{})};
 });
}
export type Activity = {id:string;action:string;account_id:string;target_id:string|null;amount:number;received:number;fee:number;occurred_on:string;notes:string;before_balance:number;after_balance:number};
export type PlanningData = {/** Built-in categories this workspace deleted (migration 122): set by the workspace, never by the planning read. */removedKinds?:string[];debtPayments?:DebtPayment[];movements?:Array<Omit<AssetMovement,'date'> & {occurred_on:string;realized_gain:number|null}>;holdingAccounts?:HoldingAccount[];records:Entry[];categories:Category[];goals:Goal[];occurrences:Occurrence[];activity:Activity[];investmentLinks?:Array<{id:string;account_id:string;account_currency?:string|null;amount:number;investment_history:{occurred_on:string;record_id:string;event_type:string}}>};
export const emptyPlanning:PlanningData={records:[],categories:[],goals:[],occurrences:[],activity:[]};
export type DueItem = {key:string;record:Entry;date:string;overdue:boolean;type:'scheduled'|'repayment'|'maturity'|'installment';amount:number};
/** A repayment or mortgage payment made against a loan, debt or mortgage on a day. `amount` is what it paid (principal
 * and interest) in `currency`, when the read knows it; null when it could not be counted in the loan's currency. */
export type DebtPayment = {record_id:string;date:string;amount?:number|null;currency?:string;/** The cash account it was paid from, when known. */account_id?:string};
type RepaymentRow={id?:string;action:string;target_id:string|null;occurred_on:string;amount?:number;fee?:number;account_id?:string};
type MortgagePaymentRow={id?:string;mortgage_id:string;paid_on:string;principal?:number;interest?:number};
/** Repayments from account activity and mortgage payments, as one list. A mortgage payment from an account is in both
 * under one id; it is counted once. Given the records' currencies, each payment carries what it paid: a repayment in
 * its account's currency, a mortgage payment in the mortgage's. */
export function debtPaymentsFrom(activity:RepaymentRow[],mortgagePayments:MortgagePaymentRow[]=[],currencyOf?:Map<string,string>):DebtPayment[]{
 const mortgageIds=new Set(mortgagePayments.flatMap(row=>row.id?[row.id]:[]));
 const accountOf=new Map(activity.flatMap(row=>row.id&&row.account_id?[[row.id,row.account_id] as const]:[]));
 const paid=(amount:number|undefined,extra:number|undefined,currency:string|undefined)=>amount===undefined||!currency?{}:{amount:Number(amount)+Number(extra??0),currency};
 const from=(account:string|undefined)=>account?{account_id:account}:{};
 return [...activity.filter(row=>(row.action==='repayment'||row.action==='mortgage')&&row.target_id&&!(row.id&&mortgageIds.has(row.id))).map(row=>({record_id:row.target_id!,date:row.occurred_on,...paid(row.amount,row.fee,currencyOf?.get(row.account_id??'')),...from(row.account_id)})),
  ...mortgagePayments.map(row=>({record_id:row.mortgage_id,date:row.paid_on,...paid(row.principal,row.interest,currencyOf?.get(row.mortgage_id)),...from(row.id?accountOf.get(row.id):undefined)}))];
}
/** Each payment's amount in its loan's currency, at the official rate of the payment's day; null when no rate is found.
 * Each currency pair and day is asked for once, a few at a time. */
export async function debtPaymentsInLoanCurrency(payments:DebtPayment[],currencyOf:Map<string,string>,dayRate:DayRate):Promise<DebtPayment[]>{
 const rate=sharedDayRate(dayRate);
 return Promise.all(payments.map(async payment=>{
  const loan=currencyOf.get(payment.record_id);
  if(payment.amount==null||!payment.currency||!loan||payment.currency===loan)return payment;
  try{return {...payment,amount:payment.amount*await rate(payment.currency,loan,payment.date),currency:loan};}catch{return {...payment,amount:null,currency:loan};}
 }));
}
/** What was paid towards each loan month (`id:YYYY-MM`) in the loan's currency: null when a payment could not be counted
 * in it, absent when the read did not say how much was paid. */
export function paidInstallmentAmounts(payments:DebtPayment[],currencyOf:Map<string,string>):Map<string,number|null>{
 const totals=new Map<string,number|null>(),unknown=new Set<string>();
 for(const payment of payments){
  const key=payment.record_id+':'+payment.date.slice(0,7),loan=currencyOf.get(payment.record_id);
  if(payment.amount===undefined){unknown.add(key);continue;}
  const amount=payment.amount===null||!loan?null:amountIn({amount:payment.amount,currency:payment.currency??loan},loan);
  const total=totals.has(key)?totals.get(key)!:0;
  totals.set(key,total===null||amount===null?null:total+amount);
 }
 for(const key of unknown)totals.delete(key);
 return totals;
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
/** The due dates settled or skipped: the occurrence rows alone. Every payment, whichever field named its schedule,
 * has one (migration 140); nothing is inferred from the payments themselves. */
export function settledOccurrences(_records:Entry[],occurrences:Occurrence[]){
 return new Set(occurrences.map(o=>o.record_id+':'+o.due_on));
}
/** The sample workspace's copy of move_schedule_day (migration 141): an occurrence of an every-month schedule sits on the
 * schedule's day in its own month (the last day of a shorter month), so moving the day moves the paid months with it. */
export function onScheduleDays<T extends {record_id:string;due_on:string}>(occurrences:readonly T[],records:readonly Entry[]):T[]{
 const days=new Map(records.filter(record=>record.frequency==='Monthly'&&/^\d{4}-\d{2}-\d{2}$/.test(record.date??'')).map(record=>[record.id,Number(record.date.slice(8))]));
 return occurrences.map(item=>{const day=days.get(item.record_id);if(!day)return item;const due=withMonthDay(item.due_on,day);return due===item.due_on?item:{...item,due_on:due};});
}
export const isRecurringCashFlow=(record:Entry)=>[...income,...expenses].includes(record.kind)&&record.frequency!=='Once';
/** What a one-time payment is: its kind and category, and its business or property. */
export type SchedulePayment={kind?:string;custom_category_id?:string|null;business_id?:string|null;income_source_id?:string|null};
/** The active schedules a one-time payment may name by id: the same item (its custom category, else its kind; `budgetKey`,
 * as Budget counts it), and the same business for business income or property for rent, in any currency (migration 120).
 * The bot and the record forms offer these. */
export function paymentSchedules(records:Entry[],payment:SchedulePayment):Entry[]{
 return records.filter(record=>isRecurringCashFlow(record)&&!record.archived&&!record.source_paused&&!!payment.kind
  &&budgetKey(record)===budgetKey({kind:payment.kind,custom_category_id:payment.custom_category_id})&&income.includes(record.kind)===income.includes(payment.kind)
  &&(record.kind!=='Business income'||!payment.business_id||record.business_id===payment.business_id)
  &&(record.kind!=='Rent income'||!payment.income_source_id||record.income_source_id===payment.income_source_id));
}
/** A payment naming `schedule` by id, or none. It takes the schedule's name when it has none, its amount when it has none and
 * is in the schedule's currency, and rent its property. A payment in another currency keeps its own: the schedule counts it at the day's rate. */
export function chooseSchedule(payment:Pick<Entry,'name'|'amount'|'currency'>,schedule:Entry|null):Partial<Entry>{
 if(!schedule)return {occurrence_record_id:null};
 return {occurrence_record_id:schedule.id,...(payment.name.trim()?{}:{name:schedule.name}),...(payment.amount>0||payment.currency!==schedule.currency?{}:{amount:Number(schedule.amount)}),...(schedule.kind==='Rent income'&&schedule.income_source_id?{income_source_id:schedule.income_source_id}:{})};
}
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
