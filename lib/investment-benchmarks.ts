import type { InvestmentPortfolioInput } from './investment-portfolio';
import type { PlanningData } from './planning';
import type { BenchmarkData } from './benchmark-data';
import type { DiversifiedPortfolio } from './diversified-portfolio';
import type { HistoryEvent } from './investment-history';
import { compareInvestments, convertHistorical, type CashFlow, type WealthPoint } from './investment-comparison';
import { isInvestmentRecord } from './comparison-profile';
import { expenses, liabilities, value } from './finance';
import { convertAmount, marketEntry, marketRates } from './market';
import { validDay } from './benchmark-data';
import { shiftDay } from './calendar-days';
import { spendingAmount } from './spending';

export type FundingScope='investments'|'expenses';
export type ComparisonMethod={mode:'purchases'|'date';date:string;scope?:FundingScope};
export type BenchmarkMovement=NonNullable<PlanningData['movements']>[number]&{created_at?:string};
export type FundingDetail={id:string;date:string;name:string;amount:number;currency:string;reused:number;principal?:number;source?:'investment'|'expense'|'opening';kind?:string};
export type DecisionInput=InvestmentPortfolioInput&{movements?:BenchmarkMovement[];method:ComparisonMethod};
export type ExpenseFunding={id:string;date:string;name:string;kind:string;amount:number;currency:string};
export type AccountRepayment={id:string;action:string;account_id:string;target_id:string|null;amount:number;occurred_on:string;notes:string;created_at?:string};
/** Money entering or leaving investments: a purchase or principal repayment funds benchmarks; a payout is proceeds or income paid out. */
export type ActivityItem={id:string;date:string;recordId:string;name:string;amount:number;currency:string;reused:number;principal?:number;payout?:boolean};
type Records=InvestmentPortfolioInput['records'];
/** Market and exchange-rate history is requested from this day at the earliest. */
export const benchmarkHistoryStart='2016-01-01';
// Cash is never an investment holding here, even when marked for investments: its
// balance moves with salary and spending, which would appear as gains and losses.
export const benchmarkInvestment=(record:Records[number])=>record.kind!=='Cash'&&isInvestmentRecord(record);
const inOrder=(a:{date:string;time:string;id:string},b:{date:string;time:string;id:string})=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id);

// Actual one-time spending that "Including expenses" also invests. Tracker,
// fee and interest copies are the only record of that spending, so they count;
// a mortgage copy counts only its interest because its principal already funds
// through the mortgage payment event. Transfers are never expense records.
export function benchmarkExpenseFunding(cashflows:InvestmentPortfolioInput['cashflows'],today:string):ExpenseFunding[]{
 return (cashflows??[]).flatMap(row=>{
  if(!expenses.includes(row.kind)||row.frequency!=='Once'||!validDay(row.date)||row.date>today)return [];
  const amount=spendingAmount(row);
  return Number.isFinite(amount)&&amount>0?[{id:'expense:'+row.id,date:row.date,name:row.name,kind:row.kind,amount,currency:row.currency}]:[];
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}

// A repayment recorded from Accounts changes both balances but leaves no Tracker
// transaction. Present it as the same dated repayment the Tracker would have saved.
export function accountRepaymentEvents(activity:readonly AccountRepayment[],records:Records):HistoryEvent[]{
 const byId=new Map(records.map(row=>[row.id,row]));
 return activity.flatMap(row=>{
  const target=byId.get(row.target_id??'');
  if(row.action!=='repayment'||!target||!['Money lent','Loan','Debt'].includes(target.kind)||!(Number(row.amount)>0))return [];
  const amount=Number(row.amount);
  return [{id:'repayment:'+row.id,record_id:target.id,event_type:'withdrawal' as const,occurred_on:row.occurred_on,created_at:row.created_at??row.occurred_on,amount,balance:null,ownership_percentage:100,principal:0,interest:0,notes:row.notes,account_link:{account_id:row.account_id,amount:target.kind==='Money lent'?amount:-amount}}];
 });
}

export function benchmarkMethodStorageKey(owner:string){return 'finance:benchmark-method:'+owner;}
// Only the funding scope is kept in this browser; the tracking start is saved to the account.
// Choices saved before funding scopes lack `scope`; they keep excluding expenses.
export function readBenchmarkScope(storage:Pick<Storage,'getItem'>,owner:string):FundingScope|null{
 try{
  const saved=JSON.parse(storage.getItem(benchmarkMethodStorageKey(owner))??'null');
  if(!saved||typeof saved!=='object')return null;
  if(saved.scope===undefined)return 'investments';
  return ['investments','expenses'].includes(saved.scope)?saved.scope:null;
 }catch{return null;}
}

// One classification of investment money, shared by the chart and the summary figures.
// Only an explicit investment source proves reuse. A shared cash account does
// not establish which earlier receipt funded a later purchase or repayment.
export function investmentActivity(records:Records,allEvents:InvestmentPortfolioInput['events'],allMovements:BenchmarkMovement[]|undefined,today:string){
 const byId=new Map(records.map(row=>[row.id,row]));
 const events=allEvents.filter(e=>e.occurred_on<=today).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const movements=(allMovements??[]).filter(row=>row.occurred_on<=today);
 const paired=new Set<string>();let missing=false;
 // Older movement rows predate an explicit event link. Match each leg once by
 // its complete financial identity; matching identical legs is interchangeable.
 for(const row of movements){
  for(const [id,type,amount] of [[row.source_id,'withdrawal',row.source_value],[row.target_id,row.kind==='interest'?'income':'contribution',row.target_value]] as const){
   if(row.kind==='interest'&&type==='withdrawal')continue;
   const match=events.find(e=>!paired.has(e.id)&&e.record_id===id&&e.event_type===type&&e.occurred_on===row.occurred_on&&Number(e.amount)===Number(amount)&&e.notes===row.notes);
   if(match)paired.add(match.id);else missing=true;
  }
 }
 // The same security moved between two of the owner's holdings is still one
 // position: neither sale proceeds nor a fresh purchase.
 for(const out of events){
  const from=byId.get(out.record_id);
  if(!from||paired.has(out.id)||out.event_type!=='withdrawal'||out.account_link||!out.notes.startsWith('Security transfer. ')||!['Stock','Crypto'].includes(from.kind))continue;
  const match=events.find(e=>{const to=byId.get(e.record_id);return !paired.has(e.id)&&e.event_type==='contribution'&&!e.account_link&&e.record_id!==out.record_id&&e.occurred_on===out.occurred_on&&Number(e.amount)===Number(out.amount)&&e.notes===out.notes&&to?.kind===from.kind&&to.name===from.name&&to.currency===from.currency;});
  if(match){paired.add(out.id);paired.add(match.id);}
 }
 const timeline=[
  ...events.filter(row=>!paired.has(row.id)).map(row=>({type:'event' as const,date:row.occurred_on,time:row.created_at,id:row.id,row})),
  ...movements.map(row=>({type:'movement' as const,date:row.occurred_on,time:row.created_at??row.occurred_on,id:row.id,row})),
 ].sort(inOrder);
 const items:ActivityItem[]=[];
 for(const item of timeline){
  if(item.type==='event'){
   const e=item.row,r=byId.get(e.record_id);if(!r)continue;
   const entry={id:e.id,date:e.occurred_on,recordId:r.id,name:r.name,currency:r.currency,reused:0};
   if(benchmarkInvestment(r)&&e.event_type==='contribution')items.push({...entry,amount:Number(e.amount)});
   else if(benchmarkInvestment(r)&&['withdrawal','income'].includes(e.event_type))items.push({...entry,amount:Number(e.amount),payout:true});
   else if(liabilities.includes(r.kind)&&['mortgage_payment','withdrawal'].includes(e.event_type)){
    const paid=e.event_type==='mortgage_payment'?Number(e.principal):Number(e.amount);
    items.push({...entry,amount:paid,principal:paid});
   }
  }else{
   const m=item.row,a=byId.get(m.source_id),b=byId.get(m.target_id);if(!a||!b){missing=true;continue;}
   if(m.kind==='interest')continue;
   const entry={id:m.id,date:m.occurred_on,recordId:b.id,name:b.name,currency:b.currency};
   if(b.kind==='Cash'&&benchmarkInvestment(a))items.push({...entry,amount:Number(m.target_value),reused:0,payout:true});
   else if(benchmarkInvestment(b)){const cost=Math.max(0,Number(m.target_value)-(m.kind==='buy'?Number(m.fee):0));items.push({...entry,amount:cost,reused:benchmarkInvestment(a)&&Number(m.sent)>0?cost:0});}
  }
 }
 return {items,events,byId,missing};
}

// Inspect coverage before requesting market data. Unknown purchase costs can
// still support a clearly labeled valuation-based comparison.
export function investmentComparisonCoverage(records:Records,events:InvestmentPortfolioInput['events'],today:string){
 const missing:string[]=[];const dates:string[]=[];
 for(const record of records.filter(benchmarkInvestment)){
  const rows=events.filter(e=>e.record_id===record.id&&e.occurred_on<=today).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at));
  const purchase=rows.find(e=>e.event_type==='contribution');
  if(!rows.some(e=>e.balance!==null)){missing.push(record.name);dates.push(today);continue;}
  // Value that appears without a purchase is an observation, including the
  // first value entered for a holding that was created empty.
  const observed=rows.find(e=>e.balance!==null&&Number(e.balance)>0);
  if(observed&&(!purchase||purchase.occurred_on>observed.occurred_on)){
   missing.push(record.name);dates.push(observed.occurred_on);
  }
 }
 const earliest=events.filter(e=>e.occurred_on<=today&&records.some(r=>r.id===e.record_id&&benchmarkInvestment(r))).map(e=>e.occurred_on).sort()[0]??today;
 return {missing:[...new Set(missing)],start:dates.sort().at(-1)??earliest};
}

// From original purchases, the comparison opens on the first day investment money moved:
// the earliest holding history, repayment or, when spending funds benchmarks, expense.
// Cash accounts and the day a debt was opened are not investment activity.
export function purchaseComparisonStart(input:Pick<DecisionInput,'records'|'events'|'movements'|'cashflows'|'today'>,scope:FundingScope){
 const activity=investmentActivity(input.records,input.events,input.movements,input.today);
 const holding=activity.events.find(e=>{const r=activity.byId.get(e.record_id);return !!r&&benchmarkInvestment(r);})?.occurred_on;
 const funded=activity.items.map(item=>item.date).sort()[0];
 const spent=scope==='expenses'?benchmarkExpenseFunding(input.cashflows,input.today)[0]?.date:undefined;
 return [holding,funded,spent].filter((date):date is string=>!!date).sort()[0]??input.today;
}

// A holding valued before any purchase was recorded holds capital that was already invested:
// its first recorded value counts as invested on the day it was recorded, so it is never a gain.
// The chart funds benchmarks with it and the period summary counts it as money invested.
export function openingFunding(records:Records,events:InvestmentPortfolioInput['events'],today:string){
 const byId=new Map(records.map(row=>[row.id,row]));
 const rows=events.filter(e=>e.occurred_on<=today).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const purchases=new Map<string,string>(),valued=new Set<string>(),openings=new Map<string,FundingDetail&{recordId:string}>();
 for(const e of rows)if(e.event_type==='contribution'&&!purchases.has(e.record_id))purchases.set(e.record_id,e.occurred_on);
 for(const e of rows){
  const r=byId.get(e.record_id);
  if(!r||!benchmarkInvestment(r)||e.balance===null||!(Number(e.balance)>0)||valued.has(r.id))continue;
  valued.add(r.id);
  if((purchases.get(r.id)??'9999')>e.occurred_on)openings.set(e.id,{id:'opening:'+e.id,date:e.occurred_on,recordId:r.id,name:r.name,amount:Number(e.balance)*Number(e.ownership_percentage)/100,currency:r.currency,reused:0,source:'opening'});
 }
 return openings;
}

/** The day benchmark comparisons start from. They cannot precede the first recorded investment: there is no value to compare from that day.
 * A start saved earlier than that compares from the first investment day (the saved day itself is kept and shown); a future one is ignored. */
export function effectiveTrackingStart(trackingStart:string|null,firstInvestment:string,today:string){
 if(!trackingStart||trackingStart>today)return null;
 return trackingStart<firstInvestment?firstInvestment:trackingStart;
}

/** How benchmarks are compared for a saved tracking start. A start on or before the first investment day compares
 * from original purchases on that day: nothing was invested earlier, so opening holdings and that day's principal
 * repayments fund benchmarks exactly as the period summary counts them. A later start compares from the value that day. */
export function comparisonMethod(trackingStart:string|null,purchaseStart:string,today:string,scope:FundingScope){
 // Market history is limited. Earlier purchases compare from recorded values on its first day.
 const earliestStart=purchaseStart<benchmarkHistoryStart?benchmarkHistoryStart:purchaseStart;
 const trackingFrom=effectiveTrackingStart(trackingStart,earliestStart,today);
 const beforeMarketHistory=!trackingFrom&&purchaseStart<benchmarkHistoryStart;
 const method:ComparisonMethod=trackingFrom&&trackingFrom>purchaseStart?{mode:'date',date:trackingFrom,scope}:beforeMarketHistory?{mode:'date',date:earliestStart,scope}:{mode:'purchases',date:purchaseStart,scope};
 // The saved day is earlier than the day comparisons can start: the settings say so instead of contradicting the picker.
 const chosenEarlier=method.mode==='purchases'&&!!trackingStart&&trackingStart<method.date;
 return {method,trackingFrom,earliestStart,beforeMarketHistory,chosenEarlier};
}

export function investmentDecisionComparison(input:DecisionInput,data:BenchmarkData,portfolio?:DiversifiedPortfolio|null){
 const scope=input.method.scope??'investments',dated=input.method.mode==='date';
 const activity=investmentActivity(input.records,input.events,input.movements,input.today);
 const {byId,items}=activity;let missing=activity.missing;
 const assets=input.records.filter(benchmarkInvestment);
 const held=new Set(assets.map(row=>row.id));
 const events=activity.events.filter(e=>held.has(e.record_id));
 const spending=scope==='expenses'?benchmarkExpenseFunding(input.cashflows,input.today):[];
 const start=dated?input.method.date:purchaseComparisonStart(input,scope);
 if(!validDay(start)||start>input.today||start<data.start)return null;
 // From a dated start, that day's holdings are in the starting value; a principal repayment that day is not, so it funds benchmarks.
 const counted=(date:string,repayment=false)=>date>start||((!dated||repayment)&&date===start);
 const balances=new Map<string,number>(),cost=new Map<string,number>();
 const flows:CashFlow[]=[],details:FundingDetail[]=[],points:WealthPoint[]=[];
 const observed=new Set<string>();let principal=0,payouts=0,cursor=0,next=0,spent=0,seeded=false;
 const usd=(amount:number,currency:string,date:string)=>{const converted=convertHistorical(amount,currency,'USD',date,data.fx);if(converted===null||!Number.isFinite(converted)){missing=true;return 0;}return converted;};
 const fund=(id:string,date:string,name:string,amount:number,currency:string,reused=0,principalPaid?:number,expenseKind?:string,opening=false)=>{
  if(!counted(date,principalPaid!==undefined))return;
  const converted=usd(Math.max(0,amount-reused),currency,date);
  if(converted>0)flows.push({date,amount:converted});
  if(amount>0)details.push({id,date,name,amount:Math.max(0,amount-reused),currency,reused,...(principalPaid===undefined?{}:{principal:principalPaid}),...(expenseKind===undefined?{}:{source:'expense' as const,kind:expenseKind}),...(opening?{source:'opening' as const}:{})});
 };
 const openings=openingFunding(input.records,input.events,input.today);
 const opening=new Map<string,HistoryEvent>(),firstBalance=new Map<string,HistoryEvent>();
 for(const e of events){
  if(!opening.has(e.record_id))opening.set(e.record_id,e);
  if(e.balance!==null&&!firstBalance.has(e.record_id))firstBalance.set(e.record_id,e);
 }
 // A holding joins the comparison on the day its history begins. Earlier days do not include it:
 // nothing is known about it then, and one new record must not erase every other holding's history.
 const absentBefore=(id:string,date:string)=>{
  const first=opening.get(id);
  return !!first&&!!firstBalance.get(id)&&first.occurred_on>date;
 };
 const firstDate=[events[0]?.occurred_on,items[0]?.date,start].filter((date):date is string=>!!date).sort()[0];
 for(let date=firstDate;date<=input.today;date=shiftDay(date,1)){
  // Spending funds benchmarks only; it never adds to actual holdings or proceeds.
  while(spent<spending.length&&spending[spent].date<=date){const row=spending[spent++];fund(row.id,row.date,row.name,row.amount,row.currency,0,undefined,row.kind);}
  while(cursor<events.length&&events[cursor].occurred_on<=date){
   const e=events[cursor++];
   if(e.balance!==null){
    const balance=Number(e.balance)*Number(e.ownership_percentage)/100;
    // Value recorded without a purchase: benchmarks receive the same amount on the same day.
    const first=openings.get(e.id);
    if(first){observed.add(e.record_id);fund(first.id,first.date,first.name,first.amount,first.currency,0,undefined,undefined,true);}
    balances.set(e.record_id,balance);
   }else if(!balances.has(e.record_id)&&['contribution','withdrawal'].includes(e.event_type)){
    // Bought but not yet valued: carry the money put in until the first recorded value.
    cost.set(e.record_id,Math.max(0,(cost.get(e.record_id)??0)+(e.event_type==='contribution'?1:-1)*Number(e.amount)));
   }
  }
  while(next<items.length&&items[next].date<=date){
   const item=items[next++];
   if(!counted(item.date,item.principal!==undefined))continue;
   if(item.payout){payouts+=usd(item.amount,item.currency,item.date);continue;}
   if(item.principal!==undefined)principal+=usd(item.principal,item.currency,item.date);
   fund(item.id,item.date,item.name,item.amount,item.currency,item.reused,item.principal);
  }
  if(date<start)continue;
  let total=0;
  for(const r of assets){
   const balance=balances.get(r.id)??cost.get(r.id);
   if(balance===undefined){if(!absentBefore(r.id,date))missing=true;continue;}
   const live=date===input.today?marketEntry(r,r.currency,input.market):null;
   total+=usd(live?value(live):balance,r.currency,date);
  }
  if(dated&&!seeded){
   flows.push({date,amount:total});details.push({id:'opening',date,name:'Starting investment value',amount:total,currency:'USD',reused:0});seeded=true;
  }
  points.push({date,amount:total+principal+payouts});
 }
 if(missing)return null;
 const result=compareInvestments(0,flows,points,{...data,start},'USD',true,portfolio);
 const rates=marketRates(input.market)??{};
 if(convertAmount(1,'USD',input.currency,rates)===null)return null;
 // Each day leaves USD at that day's rate, the one it entered at: a UZS deposit shown in UZS only grows,
 // instead of moving with today's dollar. Today's live rate covers a day the feed has no rate for.
 const shown=(amount:number,date:string)=>convertHistorical(amount,'USD',input.currency,date,data.fx)??convertAmount(amount,'USD',input.currency,rates);
 return {missingPurchases:[...observed].map(id=>byId.get(id)!.name),details,result:{...result,points:result.points.map(point=>Object.fromEntries(Object.entries(point).map(([key,amount])=>[key,key==='date'||amount===null?amount:shown(Number(amount),point.date)])) as typeof point)}};
}
