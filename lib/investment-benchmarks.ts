import type { InvestmentPortfolioInput } from './investment-portfolio';
import type { PlanningData } from './planning';
import type { BenchmarkData } from './benchmark-data';
import type { DiversifiedPortfolio } from './diversified-portfolio';
import type { HistoryEvent } from './investment-history';
import { compareInvestments, convertHistorical, type CashFlow, type WealthPoint } from './investment-comparison';
import { isInvestmentRecord } from './comparison-profile';
import { expenses, liabilities, value } from './finance';
import { convertAmount, marketEntry } from './market';
import { shiftDay, validDay } from './benchmark-data';

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
  const amount=row.mortgage_payment_id?Number(row.payment_interest??0):Number(row.amount);
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
// Saved choices from before funding scopes lack `scope`; they keep excluding expenses.
export function readBenchmarkMethod(storage:Pick<Storage,'getItem'>,owner:string,today:string):Required<ComparisonMethod>|null{
 try{
  const saved=JSON.parse(storage.getItem(benchmarkMethodStorageKey(owner))??'null');
  if(!saved||!['purchases','date'].includes(saved.mode)||typeof saved.date!=='string'||!validDay(saved.date)||saved.date>today)return null;
  if(saved.scope!==undefined&&!['investments','expenses'].includes(saved.scope))return null;
  return {mode:saved.mode,date:saved.date,scope:saved.scope??'investments'};
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
 const counted=(date:string)=>date>start||(!dated&&date===start);
 const balances=new Map<string,number>(),cost=new Map<string,number>();
 const flows:CashFlow[]=[],details:FundingDetail[]=[],points:WealthPoint[]=[];
 const observed=new Set<string>(),valued=new Set<string>();let principal=0,payouts=0,cursor=0,next=0,spent=0,seeded=false;
 const usd=(amount:number,currency:string,date:string)=>{const converted=convertHistorical(amount,currency,'USD',date,data.fx);if(converted===null||!Number.isFinite(converted)){missing=true;return 0;}return converted;};
 const fund=(id:string,date:string,name:string,amount:number,currency:string,reused=0,principalPaid?:number,expenseKind?:string,opening=false)=>{
  if(!counted(date))return;
  const converted=usd(Math.max(0,amount-reused),currency,date);
  if(converted>0)flows.push({date,amount:converted});
  if(amount>0)details.push({id,date,name,amount:Math.max(0,amount-reused),currency,reused,...(principalPaid===undefined?{}:{principal:principalPaid}),...(expenseKind===undefined?{}:{source:'expense' as const,kind:expenseKind}),...(opening?{source:'opening' as const}:{})});
 };
 const purchases=new Map<string,string>(),opening=new Map<string,HistoryEvent>(),firstBalance=new Map<string,HistoryEvent>();
 for(const e of events){
  if(!opening.has(e.record_id))opening.set(e.record_id,e);
  if(e.balance!==null&&!firstBalance.has(e.record_id))firstBalance.set(e.record_id,e);
  if(e.event_type==='contribution'&&!purchases.has(e.record_id))purchases.set(e.record_id,e.occurred_on);
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
    if(Number(e.balance)>0&&!valued.has(e.record_id)){
     valued.add(e.record_id);
     // Value recorded without a purchase is capital that was already invested: benchmarks receive
     // the same amount on the same day, so it is never shown as a gain.
     if((purchases.get(e.record_id)??'9999')>e.occurred_on){observed.add(e.record_id);const r=byId.get(e.record_id)!;fund('opening:'+e.id,e.occurred_on,r.name,balance,r.currency,0,undefined,undefined,true);}
    }
    balances.set(e.record_id,balance);
   }else if(!balances.has(e.record_id)&&['contribution','withdrawal'].includes(e.event_type)){
    // Bought but not yet valued: carry the money put in until the first recorded value.
    cost.set(e.record_id,Math.max(0,(cost.get(e.record_id)??0)+(e.event_type==='contribution'?1:-1)*Number(e.amount)));
   }
  }
  while(next<items.length&&items[next].date<=date){
   const item=items[next++];
   if(!counted(item.date))continue;
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
   payouts=0;principal=0;
   flows.push({date,amount:total});details.push({id:'opening',date,name:'Starting investment value',amount:total,currency:'USD',reused:0});seeded=true;
  }
  points.push({date,amount:total+principal+payouts});
 }
 if(missing)return null;
 const result=compareInvestments(0,flows,points,{...data,start},'USD',true,portfolio);
 const rates=input.market?.rates??(input.market?.fx?{UZS:input.market.fx.rate}:{});
 if(convertAmount(1,'USD',input.currency,rates)===null)return null;
 return {missingPurchases:[...observed].map(id=>byId.get(id)!.name),details,result:{...result,points:result.points.map(point=>Object.fromEntries(Object.entries(point).map(([key,amount])=>[key,key==='date'||amount===null?amount:convertAmount(Number(amount),'USD',input.currency,rates)])) as typeof point)}};
}
