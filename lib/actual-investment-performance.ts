import { expenses, liabilities, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { investmentKinds, type BaselineHolding } from './comparison-profile';
import { convertHistorical, type CashFlow, type WealthPoint } from './investment-comparison';
import { shiftDay, type FxPoint } from './benchmark-data';

type InvestmentActivity = HistoryEvent & { currency?:string };
export function investmentEvents(records:Entry[],events:HistoryEvent[],end:string,cashflows:Entry[]=[]):InvestmentActivity[]{
 const ids=new Set(records.filter(record=>(investmentKinds as readonly string[]).includes(record.kind)).map(record=>record.id));
 const debts=new Set(records.filter(record=>liabilities.includes(record.kind)).map(record=>record.id));
 const activity:InvestmentActivity[]=events.filter(event=>(ids.has(event.record_id)||(debts.has(event.record_id)&&['withdrawal','mortgage_payment'].includes(event.event_type)))&&event.occurred_on<=end);
 // Tracker transactions already have an event. Only independent, actual business
 // spending enters here; recurring plans and personal spending never fund benchmarks.
 for(const row of cashflows){
  const target=row.business_id??row.income_source_id;
  const cost=row.kind!=='Charity'&&expenses.includes(row.kind);
  if(row.frequency!=='Once'||!row.date||row.date>end||!target||!ids.has(target)||(!cost&&!['Business income','Rent income','Other income'].includes(row.kind))||row.history_event_id||row.mortgage_payment_id)continue;
  activity.push({id:'cashflow:'+row.id,record_id:target,event_type:cost?'expense':'income',occurred_on:row.date,created_at:row.date,amount:Number(row.amount),balance:null,ownership_percentage:100,principal:0,interest:0,notes:row.notes,currency:row.currency});
 }
 return activity.sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}

// Purchases fund the comparison on their recorded dates. Observations are never
// silently presented as purchase costs: their opening values are disclosed separately.
export function actualInvestmentPerformance(records:Entry[],events:HistoryEvent[],live:BaselineHolding[],fx:FxPoint[],currency:string,end:string,cashflows:Entry[]=[]){
 const byId=new Map(records.filter(record=>(investmentKinds as readonly string[]).includes(record.kind)).map(record=>[record.id,record]));
 const debts=new Map(records.filter(record=>liabilities.includes(record.kind)).map(record=>[record.id,record]));
 const repaid=new Map<string,number>();
 const sorted=investmentEvents(records,events,end,cashflows);
 const start=sorted[0]?.occurred_on??end;
 const firstPurchase=new Map<string,string>();
 for(const event of sorted)if(event.event_type==='contribution'&&!firstPurchase.has(event.record_id))firstPurchase.set(event.record_id,event.occurred_on);
 const balances=new Map<string,number>(),liveById=new Map(live.map(holding=>[holding.id,holding]));
 const observed=new Set<string>();
 const active=new Set<string>();
 const distributions:CashFlow[]=[];
 const flows:CashFlow[]=[],points:WealthPoint[]=[];
 let missing=false,cursor=0,distributed=0;
 for(let date=start;date<=end;date=shiftDay(date,1)){
  while(cursor<sorted.length&&sorted[cursor].occurred_on<=date){
   const event=sorted[cursor++];
   const liability=debts.get(event.record_id);
   if(liability){
    const principal=event.event_type==='mortgage_payment'?Number(event.principal):Number(event.amount);
    const paid=Number(event.amount);
    const amount=convertHistorical(paid,liability.currency,currency,date,fx);
    if(amount===null||!Number.isFinite(principal)||principal<0||principal>paid||!Number.isFinite(paid)||paid<0)missing=true;
    else {flows.push({date,amount});repaid.set(liability.id,(repaid.get(liability.id)??0)+principal);}
    continue;
   }
   const record=byId.get(event.record_id)!;
   active.add(record.id);
   const balance=event.balance===null?null:Number(event.balance)*Number(event.ownership_percentage)/100;
   // An automatically created snapshot may precede a same-day purchase entry.
   // The explicit purchase already funds it; don't count the snapshot a second time.
   const purchaseFundsOpening=(firstPurchase.get(record.id)??'9999')<=date;
   let flow=['contribution','expense'].includes(event.event_type)?Number(event.amount):event.event_type==='withdrawal'?-Number(event.amount):0;
   if(!balances.has(record.id)&&balance!==null&&event.event_type!=='contribution'&&!purchaseFundsOpening){
    if(event.event_type==='withdrawal'){missing=true;}
    else if(balance>0){flow=balance;observed.add(record.id);}
   }
   if(flow){const amount=convertHistorical(flow,event.currency??record.currency,currency,date,fx);if(amount===null)missing=true;else flows.push({date,amount});}
   if(event.event_type==='income'){
    const amount=convertHistorical(Number(event.amount),event.currency??record.currency,currency,date,fx);
    if(amount===null)missing=true;else{distributed+=amount;distributions.push({date,amount});}
   }
   if(balance!==null)balances.set(record.id,balance);
  }
  let total=distributed;
  let complete=!missing&&[...active].every(id=>balances.has(id));
  for(const [id,principal] of repaid){
   const amount=convertHistorical(principal,debts.get(id)!.currency,currency,date,fx);
   if(amount===null)complete=false;else total+=amount;
  }
  for(const [id,balance] of balances){
   const record=byId.get(id)!;
   const current=date===end?liveById.get(id):null;
   if(date===end&&!current)complete=false;
   const amount=convertHistorical(current?.balance??balance,record.currency,currency,date,fx);
   if(amount===null)complete=false;else total+=amount;
  }
  if(date===end&&balances.size!==byId.size)complete=false;
  points.push({date,amount:complete?total:null});
 }
 return {start,points,flows,distributions,distributed,missing:missing||points.at(-1)?.amount===null,observed:[...observed]};
}
