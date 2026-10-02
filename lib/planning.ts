import { scheduleDates, income, expenses, interestKinds, type Entry } from './finance';
import type { AssetMovement } from './asset-movements';
import type { HoldingAccount } from './holding-accounts';
import { depositToday } from './deposit-interest';
export type Category = {id:string;name:string;direction:'income'|'expense'};
export type InvestmentTarget = {holding_account_id:string;asset_kind:'Stock'|'Crypto';asset_symbol:string;target:number;monthly_contribution?:number|null};
export type Goal = {completed_on?:string|null;funding_priority?:number;funding_monthly?:number|null;funding_enabled?:boolean;paused_until?:string|null;funding_mode?:'one_time'|'refill';investment_targets?:InvestmentTarget[];id:string;name:string;account_id:string|null;target:number;allocated:number;target_date:string|null;archived:boolean;kind?:'savings'|'net_worth'|'investment';holding_account_id?:string|null;asset_kind?:'Stock'|'Crypto'|null;asset_symbol?:string|null;currency?:string;monthly_contribution?:number|null;annual_return?:number};
export type Occurrence = {id:string;record_id:string;due_on:string;status:'paid'|'dismissed'};
export type Activity = {id:string;action:string;account_id:string;target_id:string|null;amount:number;received:number;fee:number;occurred_on:string;notes:string;before_balance:number;after_balance:number};
export type PlanningData = {movements?:Array<Omit<AssetMovement,'date'> & {occurred_on:string;realized_gain:number|null}>;holdingAccounts?:HoldingAccount[];records:Entry[];categories:Category[];goals:Goal[];occurrences:Occurrence[];activity:Activity[];investmentLinks?:Array<{id:string;account_id:string;account_currency?:string|null;amount:number;investment_history:{occurred_on:string;record_id:string;event_type:string}}>};
export const emptyPlanning:PlanningData={records:[],categories:[],goals:[],occurrences:[],activity:[]};
export type DueItem = {key:string;record:Entry;date:string;overdue:boolean;type:'scheduled'|'repayment'|'maturity'};
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
export function upcomingPayments(records:Entry[],occurrences:Occurrence[],today=depositToday(),through?:string):DueItem[] {
 const end=through??new Date(Date.parse(today+'T00:00:00Z')+31*86400000).toISOString().slice(0,10);
 const settled=settledOccurrences(records,occurrences);
 const result:DueItem[]=[];
 const assetsById=scheduleAssets(records);
 for(const record of records){
  if(!record.date||record.source_paused)continue;
  const recurring=isRecurringCashFlow(record);
  const start=scheduleStart(record,assetsById);
  const add=(date:string,type:DueItem['type'])=>{const key=record.id+':'+date;if(date>=start&&date<=end&&!settled.has(key))result.push({key,record,date,type,overdue:date<today});};
  if(recurring){
   for(const date of scheduleDates(record,start,end))add(date,'scheduled');
  }else if(record.amount>0&&['Loan','Debt','Mortgage','Money lent',...interestKinds].includes(record.kind))add(record.date,interestKinds.includes(record.kind)?'maturity':'repayment');
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.record.name.localeCompare(b.record.name));
}
