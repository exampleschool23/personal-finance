import { convertAmount } from './market';
import { income, expenses, type Entry } from './finance';
import type { Activity, PlanningData } from './planning';
import { snapshotPoints, type PortfolioSnapshot } from './portfolio-snapshots';
import { isMortgagePayment, spendingAmount } from './spending';
/** `category_id` is an added category's id or a built-in category kind such as 'Living expense'. */
export type TransactionSplit={record_id:string;position:number;category_id:string;amount:number};
/** Database rows keep built-in categories in `kind`; the app reads one label, like `custom_category_id ?? kind` on records. */
export function normalizeSplits(rows:readonly {record_id:string;position:number;category_id?:string|null;kind?:string|null;amount:number|string}[]):TransactionSplit[]{
 return rows.map(row=>({record_id:row.record_id,position:Number(row.position),category_id:row.category_id??row.kind??'',amount:Number(row.amount)}));
}
export type ForecastAssignment={record_id:string;account_id:string;exchange_rate?:number;from_currency?:string;to_currency?:string};
export type TransactionTools={splits:TransactionSplit[];assignments:ForecastAssignment[]};
export const emptyTransactionTools:TransactionTools={splits:[],assignments:[]};
/** Received and spent in one month, by the shared spending definition (`lib/spending.ts`).
 * `activity` is accepted for callers that pass it; repayments in it are transfers and never spending. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- positional callers still pass account activity
export function monthlyReview(records:Entry[],splits:TransactionSplit[],snapshots:PortfolioSnapshot[],month:string,currency:string,today:string,_activity:Activity[]=[],rates?:number|Record<string,number>,investmentLinks:NonNullable<PlanningData['investmentLinks']>=[]) {
 const actual=records.filter(record=>record.frequency==='Once'&&record.date.slice(0,7)===month&&record.date<=today);
 let received=0,spent=0,missing=0;
 const categories=new Map<string,number>();
 const converted=(amount:number,unit:string)=>{
  const value=convertAmount(Number(amount),unit,currency,rates);
  if(value===null||!Number.isFinite(value)){missing++;return null;}
  return value;
 };
 const seen=new Set<string>();
 for(const record of actual){
  if(seen.has(record.id)||(!income.includes(record.kind)&&!expenses.includes(record.kind)))continue;
  seen.add(record.id);
  if(income.includes(record.kind)){const amount=converted(record.amount,record.currency);if(amount!==null)received+=amount;continue;}
  // Shared definition: a mortgage payment counts only its interest.
  const amount=converted(spendingAmount(record),record.currency);if(amount===null)continue;
  spent+=amount;
  const parts=isMortgagePayment(record)?[]:splits.filter(part=>part.record_id===record.id);
  for(const part of parts.length?parts:[{category_id:record.custom_category_id??record.kind,amount:spendingAmount(record)}]){
   const value=convertAmount(Number(part.amount),record.currency,currency,rates)!;
   categories.set(part.category_id,(categories.get(part.category_id)??0)+value);
  }
 }
 // Loan, debt and mortgage principal repayments (account activity and Tracker
 // withdrawals) are transfers, not spending; their fees are expense records.
 // Tracker expenses on investments have no record of their own until copied.
 const recordsById=new Map(records.map(record=>[record.id,record]));
 const seenLinks=new Set<string>();
 for(const link of investmentLinks){
  const event=link.investment_history;
  if(seenLinks.has(link.id)||!event||event.event_type!=='expense'||event.occurred_on.slice(0,7)!==month||event.occurred_on>today||Number(link.amount)>=0)continue;
  seenLinks.add(link.id);
  if(actual.some(record=>expenses.includes(record.kind)&&record.history_event_id===link.id))continue;
  const unit=link.account_currency??recordsById.get(link.account_id)?.currency;
  if(!unit){missing++;continue;}
  const amount=converted(-Number(link.amount),unit);
  if(amount===null)continue;
  spent+=amount;categories.set('Other expense',(categories.get('Other expense')??0)+amount);
 }
 const start=month+'-01';
 const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const points=snapshotPoints(snapshots,currency).sort((a,b)=>a.date.localeCompare(b.date));
 const before=points.filter(point=>point.date<start).at(-1),after=points.filter(point=>point.date>=start&&point.date<=end&&point.date<=today).at(-1);
 return {received,spent,missing,saved:received-spent,categories:[...categories].map(([id,amount])=>({id,amount})).sort((a,b)=>b.amount-a.amount),netWorthChange:before&&after?after.net-before.net:null,from:before?.date,to:after?.date};
}
