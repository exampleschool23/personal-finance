import type { Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { investmentKinds, type BaselineHolding } from './comparison-profile';
import { convertHistorical, type CashFlow, type WealthPoint } from './investment-comparison';
import { shiftDay, type FxPoint } from './benchmark-data';

export function investmentEvents(records:Entry[],events:HistoryEvent[],end:string){
 const ids=new Set(records.filter(record=>(investmentKinds as readonly string[]).includes(record.kind)).map(record=>record.id));
 return events.filter(event=>ids.has(event.record_id)&&event.occurred_on<=end).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}

// Purchases fund the comparison on their recorded dates. Observations are never
// silently presented as purchase costs: their opening values are disclosed separately.
export function actualInvestmentPerformance(records:Entry[],events:HistoryEvent[],live:BaselineHolding[],fx:FxPoint[],currency:string,end:string){
 const byId=new Map(records.filter(record=>(investmentKinds as readonly string[]).includes(record.kind)).map(record=>[record.id,record]));
 const sorted=investmentEvents(records,events,end);
 const start=sorted[0]?.occurred_on??end;
 const firstPurchase=new Map<string,string>();
 for(const event of sorted)if(event.event_type==='contribution'&&!firstPurchase.has(event.record_id))firstPurchase.set(event.record_id,event.occurred_on);
 const balances=new Map<string,number>(),liveById=new Map(live.map(holding=>[holding.id,holding]));
 const observed=new Set<string>();
 const distributions:CashFlow[]=[];
 const flows:CashFlow[]=[],points:WealthPoint[]=[];
 let missing=false,cursor=0,distributed=0;
 for(let date=start;date<=end;date=shiftDay(date,1)){
  while(cursor<sorted.length&&sorted[cursor].occurred_on<=date){
   const event=sorted[cursor++],record=byId.get(event.record_id)!;
   const balance=event.balance===null?null:Number(event.balance)*Number(event.ownership_percentage)/100;
   // An automatically created snapshot may precede a same-day purchase entry.
   // The explicit purchase already funds it; don't count the snapshot a second time.
   if(event.event_type==='baseline'&&!balances.has(record.id)&&(firstPurchase.get(record.id)??'9999')<=date)continue;
   let flow=event.event_type==='contribution'?Number(event.amount):event.event_type==='withdrawal'?-Number(event.amount):0;
   if(!balances.has(record.id)&&balance!==null&&event.event_type!=='contribution'){
    if(event.event_type==='withdrawal'){missing=true;}
    else if(balance>0){flow=balance;observed.add(record.id);}
   }
   if(flow){const amount=convertHistorical(flow,record.currency,currency,date,fx);if(amount===null)missing=true;else flows.push({date,amount});}
   if(event.event_type==='income'||event.event_type==='expense'){
    const amount=convertHistorical(Number(event.amount),record.currency,currency,date,fx);
    if(amount===null)missing=true;else{const payout=event.event_type==='income'?amount:-amount;distributed+=payout;distributions.push({date,amount:payout});}
   }
   if(balance!==null)balances.set(record.id,balance);
  }
  let total=distributed;
  let complete=!missing;
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
