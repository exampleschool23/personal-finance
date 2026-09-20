import { expenses, liabilities, type Entry } from './finance';
import { historyEventLabel, type HistoryEvent } from './investment-history';
import { isInvestmentRecord, type BaselineHolding } from './comparison-profile';
import { convertHistorical, type CashFlow, type WealthPoint } from './investment-comparison';
import { shiftDay, type FxPoint } from './benchmark-data';

type InvestmentActivity = HistoryEvent & { currency?:string };
export function investmentEvents(records:Entry[],events:HistoryEvent[],end:string,cashflows:Entry[]=[]):InvestmentActivity[]{
 const ids=new Set(records.filter(record=>isInvestmentRecord(record)).map(record=>record.id));
 const debts=new Set(records.filter(record=>liabilities.includes(record.kind)).map(record=>record.id));
 const byId=new Map(records.map(record=>[record.id,record]));
 const activity:InvestmentActivity[]=events.filter(event=>(ids.has(event.record_id)||(debts.has(event.record_id)&&['withdrawal','mortgage_payment'].includes(event.event_type)))&&event.occurred_on<=end).map(event=>{
  const opened=byId.get(event.record_id)?.opened_on;
  // Only an explicit opening date can date an opening balance earlier.
  // Never backfill a later valuation or today's balance into unknown history.
  const earlier=events.some(other=>other.record_id===event.record_id&&other.occurred_on<event.occurred_on);
  return event.event_type==='baseline'&&!earlier&&opened&&/^\d{4}-\d{2}-\d{2}$/.test(opened)&&opened<event.occurred_on?{...event,occurred_on:opened}:event;
 });
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
 const byId=new Map(records.filter(record=>isInvestmentRecord(record)).map(record=>[record.id,record]));
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
 const audit=new Map([...byId,...debts].map(([id,record])=>[id,{id,name:record.name,kind:record.kind,funding:0,value:0,principalPaid:0,interestPaid:0,income:0,transactions:[] as {id:string;date:string;label:string;original:number;currency:string;funding:number}[]}]));
 const addFunding=(event:InvestmentActivity,amount:number,original:number,unit:string,label:string,recordId=event.record_id)=>{
  flows.push({date:event.occurred_on,amount});
  const row=audit.get(recordId)!;row.funding+=amount;
  row.transactions.push({id:event.id+':'+label,date:event.occurred_on,label,original,currency:unit,funding:amount});
 };
 const incomeByRecord=new Map<string,number>();
 let missing=false,cursor=0,distributed=0,internalIncome=0;
 for(let date=start;date<=end;date=shiftDay(date,1)){
  while(cursor<sorted.length&&sorted[cursor].occurred_on<=date){
   const event=sorted[cursor++];
   const liability=debts.get(event.record_id);
   if(liability){
    const principal=event.event_type==='mortgage_payment'?Number(event.principal):Number(event.amount);
    const paid=Number(event.amount);
    const amount=convertHistorical(paid,liability.currency,currency,date,fx);
    if(amount===null||!Number.isFinite(principal)||principal<0||principal>paid||!Number.isFinite(paid)||paid<0)missing=true;
    else {
     addFunding(event,amount,paid,liability.currency,historyEventLabel(liability.kind,event.event_type));
     repaid.set(liability.id,(repaid.get(liability.id)??0)+principal);
     audit.get(liability.id)!.principalPaid+=convertHistorical(principal,liability.currency,currency,date,fx)??0;
     audit.get(liability.id)!.interestPaid+=convertHistorical(paid-principal,liability.currency,currency,date,fx)??0;
    }
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
   if(flow){const unit=event.currency??record.currency;const amount=convertHistorical(flow,unit,currency,date,fx);if(amount===null)missing=true;else addFunding(event,amount,flow,unit,observed.has(record.id)&&!balances.has(record.id)?'Opening capital':historyEventLabel(record.kind,event.event_type));}
   // The linked cash contribution is internal income, not new external capital.
   if(event.event_type==='income'&&event.account_link&&byId.has(event.account_link.account_id)){
    const account=byId.get(event.account_link.account_id)!;
    const credited=convertHistorical(Number(event.account_link.amount),event.account_link.account_currency??account.currency,currency,date,fx);
    if(credited===null||!Number.isFinite(credited))missing=true;
    else {addFunding(event,-credited,-Number(event.account_link.amount),event.account_link.account_currency??account.currency,'Internal income adjustment',account.id);internalIncome+=Math.max(0,credited);}
   }
   // Income credited to included cash is already present in its balance.
   if(event.event_type==='income'&&!(event.account_link&&byId.has(event.account_link.account_id))){
    const amount=convertHistorical(Number(event.amount),event.currency??record.currency,currency,date,fx);
    if(amount===null)missing=true;else{distributed+=amount;distributions.push({date,amount});incomeByRecord.set(record.id,(incomeByRecord.get(record.id)??0)+amount);audit.get(record.id)!.income+=amount;}
   }
   if(balance!==null)balances.set(record.id,balance);
  }
  let total=distributed;
  let complete=!missing&&[...byId.keys()].every(id=>{
   if(balances.has(id))return true;
   // A documented future purchase establishes that the holding is not yet owned.
   // A later opening snapshot alone does not establish an earlier zero balance.
   const purchase=firstPurchase.get(id);
   const first=sorted.find(event=>event.record_id===id);
   return !active.has(id)&&first?.event_type==='contribution'&&!!purchase&&purchase>date;
  });
  for(const [id,principal] of repaid){
   const amount=convertHistorical(principal,debts.get(id)!.currency,currency,date,fx);
   if(amount===null)complete=false;else {total+=amount;if(date===end)audit.get(id)!.value=amount;}
  }
  for(const [id,balance] of balances){
   const record=byId.get(id)!;
   const current=date===end?liveById.get(id):null;
   if(date===end&&!current)complete=false;
   const amount=convertHistorical(current?.balance??balance,record.currency,currency,date,fx);
   if(amount===null)complete=false;else {total+=amount;if(date===end)audit.get(id)!.value=amount+(incomeByRecord.get(id)??0);}
  }
  if(date===end&&balances.size!==byId.size)complete=false;
  points.push({date,amount:complete?total:null});
 }
 return {start,points,flows,breakdown:[...audit.values()].map(row=>({...row,result:row.value-row.funding})),invested:Math.max(0,flows.reduce((sum,flow)=>sum+Math.max(0,flow.amount),0)-internalIncome),distributions,distributed,missing:missing||points.at(-1)?.amount===null,observed:[...observed]};
}
