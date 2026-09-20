import { assets, liabilities, income, expenses, type Entry } from './finance';
import { historyEventLabel, type HistoryEvent } from './investment-history';
import { convertAmount } from './market';
import type { PortfolioPoint } from './portfolio-history';

export type PortfolioChange = { id:string; name:string; kind:string; label:string; amount:number|null; record?:Entry; tracker?:boolean };
export type PortfolioDetails = { change:number|null; changes:PortfolioChange[]; activity:PortfolioChange[]; remainder:number };
// Balance differences explain net worth. Transaction amounts are context, not
// additional gains: a purchase or principal repayment can move two balances.
export function portfolioChanges(points:PortfolioPoint[],records:Entry[],events:HistoryEvent[],cashflows:Entry[],currency:string,rates:number|Record<string,number>|undefined):Map<string,PortfolioDetails> {
 const byId=new Map(records.filter(r=>assets.includes(r.kind)||liabilities.includes(r.kind)).map(r=>[r.id,r]));
 const sorted=events.filter(e=>byId.has(e.record_id)).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const result=new Map<string,PortfolioDetails>();
 const balancesAt=(date:string)=>{
  const balances=new Map<string,number>();
  for(const event of sorted){
   if(event.occurred_on>date||event.balance===null)continue;
   const record=byId.get(event.record_id)!;
   const amount=convertAmount(Number(event.balance)*Number(event.ownership_percentage)/100,record.currency,currency,rates);
   if(amount!==null&&Number.isFinite(amount))balances.set(record.id,amount);
  }
  return balances;
 };
 for(let index=0;index<points.length;index++){
  const point=points[index],previous=points[index-1];
  const changes:PortfolioChange[]=[],activity:PortfolioChange[]=[];
  const inPeriod=(date:string)=>previous?date>previous.date&&date<=point.date:date===point.date;
  if(previous){
   const before=balancesAt(previous.date),after=balancesAt(point.date);
   for(const [id,amount] of after){
    // A missing earlier balance is not evidence of a gain.
    if(!before.has(id))continue;
    const record=byId.get(id)!,delta=(amount-before.get(id)!)*(liabilities.includes(record.kind)?-1:1);
    if(delta!==0)changes.push({id,name:record.name,kind:record.kind,label:record.kind,amount:delta});
   }
  }
  const eventIds=new Set<string>();
  const eventBalances=new Map<string,number>();
  for(const event of sorted){
   const record=byId.get(event.record_id)!;
   const before=eventBalances.get(record.id);
   const balance=event.balance===null?null:convertAmount(Number(event.balance)*Number(event.ownership_percentage)/100,record.currency,currency,rates);
   if(balance!==null&&Number.isFinite(balance))eventBalances.set(record.id,balance);
   if(!inPeriod(event.occurred_on)||eventIds.has(event.id))continue;
   eventIds.add(event.id);
   if(event.event_type==='baseline')continue;
   let amount:number|null;
   if(event.event_type==='valuation'){
    // A valuation stores the new total, not a transaction amount.
    if(before===undefined||balance===null||!Number.isFinite(balance))continue;
    amount=(balance-before)*(liabilities.includes(record.kind)?-1:1);
    if(amount===0)continue;
   }else{
    amount=convertAmount(Number(event.amount),record.currency,currency,rates);
    const negative=event.event_type==='expense'||(event.event_type==='withdrawal'&&assets.includes(record.kind))||(event.event_type==='contribution'&&liabilities.includes(record.kind));
    if(amount!==null)amount*=negative?-1:1;
   }
   activity.push({record,tracker:true,id:event.id,name:record.name,kind:record.kind,label:historyEventLabel(record.kind,event.event_type),amount:amount!==null&&Number.isFinite(amount)?amount:null});
  }
  const seen=new Set<string>();
  for(const row of cashflows){
   if(row.frequency!=='Once'||!inPeriod(row.date)||seen.has(row.id)||(!income.includes(row.kind)&&!expenses.includes(row.kind)))continue;
   seen.add(row.id);
   if((row.history_event_id&&eventIds.has(row.history_event_id))||(row.mortgage_payment_id&&eventIds.has(row.mortgage_payment_id)))continue;
   const amount=convertAmount(Number(row.amount),row.currency,currency,rates);
   activity.push({record:row,tracker:false,id:row.id,name:row.name,kind:row.kind,label:row.kind,amount:amount!==null&&Number.isFinite(amount)?amount*(expenses.includes(row.kind)?-1:1):null});
  }
  changes.sort((a,b)=>Math.abs(b.amount??0)-Math.abs(a.amount??0));
  const change=previous?point.net-previous.net:null;
  const remainder=change===null?0:change-changes.reduce((sum,row)=>sum+(row.amount??0),0);
  result.set(point.date,{change,changes,activity,remainder:Math.abs(remainder)<1e-8?0:remainder});
 }
 return result;
}
