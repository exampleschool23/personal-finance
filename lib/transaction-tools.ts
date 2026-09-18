import { convertAmount } from './market';
import { income, expenses, type Entry } from './finance';
import { upcomingPayments, type Occurrence, type Activity, type PlanningData } from './planning';
import { snapshotPoints, type PortfolioSnapshot } from './portfolio-snapshots';
export type TransactionSplit={record_id:string;position:number;category_id:string;amount:number};
export type ForecastAssignment={record_id:string;account_id:string;exchange_rate?:number;from_currency?:string;to_currency?:string};
export type TransactionTools={splits:TransactionSplit[];assignments:ForecastAssignment[]};
export const emptyTransactionTools:TransactionTools={splits:[],assignments:[]};
export function accountForecast(records:Entry[],occurrences:Occurrence[],assignments:ForecastAssignment[],today:string,through:string) {
 const accounts=records.filter(record=>record.kind==='Cash');
 const schedules=upcomingPayments(records,occurrences,today,through).filter(item=>item.type==='scheduled');
 const unassigned:typeof schedules=[];
 const result=accounts.map(account=>({account,current:account.amount,ending:account.amount,lowest:account.amount,events:[] as Array<{key:string;date:string;name:string;amount:number;balance:number;overdue:boolean}>}));
 // At an equal date, outflows precede inflows to expose possible intraday shortfalls.
 for(const item of [...schedules].sort((a,b)=>a.date.localeCompare(b.date)||Number(income.includes(a.record.kind))-Number(income.includes(b.record.kind)))){
  const assignment=assignments.find(value=>value.record_id===item.record.id);
  const target=result.find(value=>value.account.id===assignment?.account_id);
  const rate=target?.account.currency===item.record.currency?1:assignment?.from_currency===item.record.currency&&assignment?.to_currency===target?.account.currency?Number(assignment?.exchange_rate):NaN;
  if(!target||!Number.isFinite(rate)||rate<=0){unassigned.push(item);continue;}
  const amount=item.record.amount*rate*(income.includes(item.record.kind)?1:-1);
  target.ending+=amount;target.lowest=Math.min(target.lowest,target.ending);
  target.events.push({key:item.key,date:item.date<today?today:item.date,name:item.record.name,amount,balance:target.ending,overdue:item.overdue});
 }
 return {accounts:result,unassigned};
}
export function monthlyReview(records:Entry[],splits:TransactionSplit[],snapshots:PortfolioSnapshot[],month:string,currency:string,today:string,activity:Activity[]=[],rates?:number|Record<string,number>,investmentLinks:NonNullable<PlanningData['investmentLinks']>=[]) {
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
  const amount=converted(record.amount,record.currency);if(amount===null)continue;
  if(income.includes(record.kind)){received+=amount;continue;}
  spent+=amount;
  const parts=record.mortgage_payment_id?[]:splits.filter(part=>part.record_id===record.id);
  for(const part of parts.length?parts:[{category_id:record.custom_category_id??record.kind,amount:record.amount}]){
   const value=convertAmount(Number(part.amount),record.currency,currency,rates)!;
   categories.set(part.category_id,(categories.get(part.category_id)??0)+value);
  }
 }
 const recordsById=new Map(records.map(record=>[record.id,record]));
 const seenActivity=new Set<string>();
 for(const payment of activity){
  if(seenActivity.has(payment.id)||!['repayment','mortgage'].includes(payment.action)||payment.occurred_on.slice(0,7)!==month||payment.occurred_on>today)continue;
  seenActivity.add(payment.id);
  const target=recordsById.get(payment.target_id??'');
  if(!target||!['Loan','Debt','Mortgage'].includes(target.kind))continue;
  // Mortgage expense records already contain principal and interest. Repayment
  // expense records contain only interest; add the principal from account activity.
  if(actual.some(record=>record.mortgage_payment_id===payment.id))continue;
  const feeRecorded=actual.some(record=>record.operation_id===payment.id&&expenses.includes(record.kind));
  const account=recordsById.get(payment.account_id);
  if(!account){missing++;continue;}
  const amount=converted(Number(payment.amount)+(feeRecorded?0:Number(payment.fee)),account.currency);
  if(amount===null)continue;
  spent+=amount;categories.set(target.kind,(categories.get(target.kind)??0)+amount);
 }
 // Tracker debt repayments are cash outflows in investment_account_links,
 // rather than account_activity. The link ID is the history event ID.
 const seenLinks=new Set<string>();
 for(const link of investmentLinks){
  const event=link.investment_history;
  if(seenLinks.has(link.id)||!event||event.occurred_on.slice(0,7)!==month||event.occurred_on>today||Number(link.amount)>=0)continue;
  seenLinks.add(link.id);
  const target=recordsById.get(event.record_id);
  const repayment=event.event_type==='withdrawal'&&!!target&&['Loan','Debt'].includes(target.kind);
  if(!repayment&&event.event_type!=='expense')continue;
  if(seenActivity.has(link.id)||actual.some(record=>expenses.includes(record.kind)&&record.history_event_id===link.id))continue;
  const unit=link.account_currency??recordsById.get(link.account_id)?.currency;
  if(!unit){missing++;continue;}
  const amount=converted(-Number(link.amount),unit);
  if(amount===null)continue;
  spent+=amount;
  const category=repayment?target!.kind:'Other expense';
  categories.set(category,(categories.get(category)??0)+amount);
 }
 const start=month+'-01';
 const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const points=snapshotPoints(snapshots,currency).sort((a,b)=>a.date.localeCompare(b.date));
 const before=points.filter(point=>point.date<start).at(-1),after=points.filter(point=>point.date>=start&&point.date<=end&&point.date<=today).at(-1);
 return {received,spent,missing,saved:received-spent,categories:[...categories].map(([id,amount])=>({id,amount})).sort((a,b)=>b.amount-a.amount),netWorthChange:before&&after?after.net-before.net:null,from:before?.date,to:after?.date};
}
