import { income, expenses, type Entry } from './finance';
import { depositToday } from './deposit-interest';
export type Category = {id:string;name:string};
export type Goal = {id:string;name:string;account_id:string|null;target:number;allocated:number;target_date:string|null;archived:boolean;kind?:'savings'|'net_worth';currency?:string;monthly_contribution?:number|null;annual_return?:number};
export type Occurrence = {id:string;record_id:string;due_on:string;status:'paid'|'dismissed'};
export type Activity = {id:string;action:string;account_id:string;target_id:string|null;amount:number;received:number;fee:number;occurred_on:string;notes:string;before_balance:number;after_balance:number};
export type PlanningData = {records:Entry[];categories:Category[];goals:Goal[];occurrences:Occurrence[];activity:Activity[];investmentLinks?:Array<{id:string;account_id:string;amount:number;investment_history:{occurred_on:string;record_id:string;event_type:string}}>};
export const emptyPlanning:PlanningData={records:[],categories:[],goals:[],occurrences:[],activity:[]};
export function goalProgress(goal:Goal,today=depositToday()) {
 const remaining=Math.max(0,goal.target-goal.allocated);
 const months=goal.target_date?Math.max(1,(Number(goal.target_date.slice(0,4))-Number(today.slice(0,4)))*12+Number(goal.target_date.slice(5,7))-Number(today.slice(5,7))+1):null;
 return {remaining,percent:Math.min(100,goal.allocated/goal.target*100),monthly:months?remaining/months:null};
}
export type DueItem = {key:string;record:Entry;date:string;overdue:boolean;type:'scheduled'|'repayment'|'maturity'};
export function upcomingPayments(records:Entry[],occurrences:Occurrence[],today=depositToday(),through?:string):DueItem[] {
 const end=through??new Date(Date.parse(today+'T00:00:00Z')+31*86400000).toISOString().slice(0,10);
 const settled=new Set(occurrences.map(o=>o.record_id+':'+o.due_on));
 const result:DueItem[]=[];
 for(const record of records){
  if(!record.date)continue;
  const recurring=[...income,...expenses].includes(record.kind)&&record.frequency!=='Once';
  const add=(date:string,type:DueItem['type'])=>{const key=record.id+':'+date;if(date<=end&&!settled.has(key))result.push({key,record,date,type,overdue:date<today});};
  if(recurring){
   // Generate from the start date so unpaid older occurrences remain visible.
   const startYear=Number(record.date.slice(0,4)),startMonth=Number(record.date.slice(5,7))-1,day=Number(record.date.slice(8));
   for(let index=startYear*12+startMonth;index<=Number(end.slice(0,4))*12+Number(end.slice(5,7))-1;index+=record.frequency==='Yearly'?12:1){
    const year=Math.floor(index/12),month=index%12;
    const date=new Date(Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate()))).toISOString().slice(0,10);
    if(record.end_date&&date>record.end_date)break;
    add(date,'scheduled');
   }
  }else if(record.amount>0&&['Loan','Debt','Mortgage','Money lent','Deposit'].includes(record.kind))add(record.date,record.kind==='Deposit'?'maturity':'repayment');
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.record.name.localeCompare(b.record.name));
}
