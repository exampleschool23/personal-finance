import { income, expenses, type Entry } from './finance';
import { upcomingPayments, type Occurrence } from './planning';
import { snapshotPoints, type PortfolioSnapshot } from './portfolio-snapshots';
export type CategoryRule={id:string;pattern:string;category_id:string;direction:'income'|'expense'|'all';priority:number;enabled:boolean};
export type TransactionSplit={record_id:string;position:number;category_id:string;amount:number};
export type ForecastAssignment={record_id:string;account_id:string};
export type TransactionTools={rules:CategoryRule[];splits:TransactionSplit[];assignments:ForecastAssignment[]};
export const emptyTransactionTools:TransactionTools={rules:[],splits:[],assignments:[]};
export function matchingCategory(name:string,kind:string,rules:CategoryRule[]) {
 const direction=income.includes(kind)?'income':expenses.includes(kind)?'expense':null;
 if(!direction)return null;
 return [...rules].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).find(rule=>rule.enabled&&(rule.direction==='all'||rule.direction===direction)&&name.toLowerCase().includes(rule.pattern.trim().toLowerCase()))?.category_id??null;
}
export function accountForecast(records:Entry[],occurrences:Occurrence[],assignments:ForecastAssignment[],today:string,through:string) {
 const accounts=records.filter(record=>record.kind==='Cash');
 const schedules=upcomingPayments(records,occurrences,today,through).filter(item=>item.type==='scheduled');
 const unassigned:typeof schedules=[];
 const result=accounts.map(account=>({account,current:account.amount,ending:account.amount,lowest:account.amount,events:[] as Array<{key:string;date:string;name:string;amount:number;balance:number;overdue:boolean}>}));
 // At an equal date, outflows precede inflows to expose possible intraday shortfalls.
 for(const item of [...schedules].sort((a,b)=>a.date.localeCompare(b.date)||Number(income.includes(a.record.kind))-Number(income.includes(b.record.kind)))){
  const assignment=assignments.find(value=>value.record_id===item.record.id);
  const target=result.find(value=>value.account.id===assignment?.account_id&&value.account.currency===item.record.currency);
  if(!target){unassigned.push(item);continue;}
  const amount=item.record.amount*(income.includes(item.record.kind)?1:-1);
  target.ending+=amount;target.lowest=Math.min(target.lowest,target.ending);
  target.events.push({key:item.key,date:item.date<today?today:item.date,name:item.record.name,amount,balance:target.ending,overdue:item.overdue});
 }
 return {accounts:result,unassigned};
}
export function monthlyReview(records:Entry[],splits:TransactionSplit[],snapshots:PortfolioSnapshot[],month:string,currency:string,today:string) {
 const actual=records.filter(record=>record.frequency==='Once'&&record.currency===currency&&record.date.slice(0,7)===month&&record.date<=today);
 const received=actual.filter(record=>income.includes(record.kind)).reduce((sum,record)=>sum+record.amount,0);
 const expenseAmount=(record:Entry)=>record.mortgage_payment_id?Number(record.payment_interest??0):record.amount;
 const spent=actual.filter(record=>expenses.includes(record.kind)).reduce((sum,record)=>sum+expenseAmount(record),0);
 const categories=new Map<string,number>();
 for(const record of actual.filter(record=>expenses.includes(record.kind))){
  const parts=record.mortgage_payment_id?[]:splits.filter(part=>part.record_id===record.id);
  for(const part of parts.length?parts:[{category_id:record.custom_category_id??record.kind,amount:expenseAmount(record)}])categories.set(part.category_id,(categories.get(part.category_id)??0)+Number(part.amount));
 }
 const start=month+'-01';
 const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const points=snapshotPoints(snapshots,currency).sort((a,b)=>a.date.localeCompare(b.date));
 const before=points.filter(point=>point.date<start).at(-1),after=points.filter(point=>point.date>=start&&point.date<=end&&point.date<=today).at(-1);
 return {received,spent,saved:received-spent,categories:[...categories].map(([id,amount])=>({id,amount})).sort((a,b)=>b.amount-a.amount),netWorthChange:before&&after?after.net-before.net:null,from:before?.date,to:after?.date};
}
