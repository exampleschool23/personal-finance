import type { InvestmentPortfolioInput } from './investment-portfolio';
import type { PlanningData } from './planning';
import type { BenchmarkData } from './benchmark-data';
import type { DiversifiedPortfolio } from './diversified-portfolio';
import { compareInvestments, convertHistorical, type CashFlow, type WealthPoint } from './investment-comparison';
import { isInvestmentRecord } from './comparison-profile';
import { expenses, liabilities, value } from './finance';
import { convertAmount, marketEntry } from './market';
import { shiftDay, validDay } from './benchmark-data';

export type FundingScope='investments'|'expenses';
export type ComparisonMethod={mode:'purchases'|'date';date:string;scope?:FundingScope};
export type BenchmarkMovement=NonNullable<PlanningData['movements']>[number]&{created_at?:string};
export type FundingDetail={id:string;date:string;name:string;amount:number;currency:string;reused:number;principal?:number;source?:'investment'|'expense';kind?:string};
export type DecisionInput=InvestmentPortfolioInput&{movements?:BenchmarkMovement[];method:ComparisonMethod};
export type ExpenseFunding={id:string;date:string;name:string;kind:string;amount:number;currency:string};
export const benchmarkInvestment=(record:InvestmentPortfolioInput['records'][number])=>record.kind!=='Cash'&&isInvestmentRecord(record);

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

// Inspect coverage before requesting market data. Unknown purchase costs can
// still support a clearly labeled valuation-based comparison.
export function investmentComparisonCoverage(records:InvestmentPortfolioInput['records'],events:InvestmentPortfolioInput['events'],today:string){
 const missing:string[]=[];const dates:string[]=[];
 for(const record of records.filter(benchmarkInvestment)){
  const rows=events.filter(e=>e.record_id===record.id&&e.occurred_on<=today).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at));
  const first=rows.find(e=>e.balance!==null);
  const purchase=rows.find(e=>e.event_type==='contribution');
  if(!first){missing.push(record.name);dates.push(today);continue;}
  if(Number(first.balance)>0&&(!purchase||purchase.occurred_on>first.occurred_on)){
   missing.push(record.name);dates.push(first.occurred_on);
  }
 }
 const earliest=events.filter(e=>e.occurred_on<=today&&records.some(r=>r.id===e.record_id&&benchmarkInvestment(r))).map(e=>e.occurred_on).sort()[0]??today;
 return {missing:[...new Set(missing)],start:dates.sort().at(-1)??earliest};
}

// Only an explicit investment source proves reuse. A shared cash account does
// not establish which earlier receipt funded a later purchase or repayment.
export function investmentDecisionComparison(input:DecisionInput,data:BenchmarkData,portfolio?:DiversifiedPortfolio|null){
 const byId=new Map(input.records.map(row=>[row.id,row]));
 const assets=input.records.filter(benchmarkInvestment);
 const events=[...input.events].filter(e=>e.occurred_on<=input.today).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const movements=(input.movements??[]).filter(row=>row.occurred_on<=input.today);
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
 const timeline=[
  ...events.map(row=>({type:'event' as const,date:row.occurred_on,time:row.created_at,id:row.id,row})),
  ...movements.map(row=>({type:'movement' as const,date:row.occurred_on,time:row.created_at??row.occurred_on,id:row.id,row})),
 ].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
 const spending=input.method.scope==='expenses'?benchmarkExpenseFunding(input.cashflows,input.today):[];
 const start=input.method.mode==='date'?input.method.date:[timeline[0]?.date,spending[0]?.date].filter((date):date is string=>!!date).sort()[0]??input.today;
 if(!validDay(start)||start>input.today||start<data.start)return null;
 const balances=new Map<string,number>();
 const flows:CashFlow[]=[],details:FundingDetail[]=[],points:WealthPoint[]=[];
 const unverified=new Set<string>();let principal=0,payouts=0,cursor=0,seeded=false;
 const usd=(amount:number,currency:string,date:string)=>{const converted=convertHistorical(amount,currency,'USD',date,data.fx);if(converted===null||!Number.isFinite(converted)){missing=true;return 0;}return converted;};
 const fund=(id:string,date:string,name:string,amount:number,currency:string,reused=0,principalPaid?:number,expenseKind?:string)=>{
  if(date<start||input.method.mode==='date'&&date===start)return;
  const converted=usd(Math.max(0,amount-reused),currency,date);
  if(converted>0)flows.push({date,amount:converted});
  if(amount>0)details.push({id,date,name,amount:Math.max(0,amount-reused),currency,reused,...(principalPaid===undefined?{}:{principal:principalPaid}),...(expenseKind===undefined?{}:{source:'expense' as const,kind:expenseKind})});
 };
 const purchases=new Map<string,string>();for(const e of events)if(e.event_type==='contribution'&&!purchases.has(e.record_id))purchases.set(e.record_id,e.occurred_on);
 const firstDate=timeline[0]?.date??start;
 let spent=0;
 for(let date=firstDate<start?firstDate:start;date<=input.today;date=shiftDay(date,1)){
  // Spending funds benchmarks only; it never adds to actual holdings or proceeds.
  while(spent<spending.length&&spending[spent].date<=date){const row=spending[spent++];fund(row.id,row.date,row.name,row.amount,row.currency,0,undefined,row.kind);}
  while(cursor<timeline.length&&timeline[cursor].date<=date){
   const item=timeline[cursor++];
   if(item.type==='event'){
    const e=item.row,r=byId.get(e.record_id);if(!r)continue;
    if(benchmarkInvestment(r)&&e.balance!==null){
     if(!balances.has(r.id)&&Number(e.balance)>0&&(purchases.get(r.id)??'9999')>date)unverified.add(r.id);
     balances.set(r.id,Number(e.balance)*Number(e.ownership_percentage)/100);
    }
    if(date<start||input.method.mode==='date'&&date===start||paired.has(e.id))continue;
    const link=e.account_link;
    const source=link?byId.get(link.account_id):undefined;
    const explicitReuse=!!source&&benchmarkInvestment(source)&&Number(link?.amount)<0;
    if(benchmarkInvestment(r)&&e.event_type==='contribution'){
     const recycled=explicitReuse?Number(e.amount):0;
     fund(e.id,date,r.name,Number(e.amount),r.currency,recycled);
    }else if(benchmarkInvestment(r)&&['withdrawal','income'].includes(e.event_type)){
     if(!source||!benchmarkInvestment(source))payouts+=usd(Number(e.amount),r.currency,date);
    }else if(liabilities.includes(r.kind)&&['mortgage_payment','withdrawal'].includes(e.event_type)){
     const paid=e.event_type==='mortgage_payment'?Number(e.principal):Number(e.amount);
     const recycled=explicitReuse?paid:0;
     if(date>=start&&(input.method.mode!=='date'||date>start))principal+=usd(paid,r.currency,date);
     fund(e.id,date,r.name,paid,r.currency,recycled,paid);
    }
   }else if(item.type==='movement'){
    if(date<start||input.method.mode==='date'&&date===start)continue;
    const m=item.row,a=byId.get(m.source_id),b=byId.get(m.target_id);if(!a||!b){missing=true;continue;}
    if(m.kind==='interest')continue;
    const fromInvestment=benchmarkInvestment(a),toInvestment=benchmarkInvestment(b);
    const recycled=fromInvestment?Number(m.sent):0;
    const ratio=Number(m.sent)>0?recycled/Number(m.sent):0;
    if(b.kind==='Cash'&&fromInvestment)payouts+=usd(Number(m.target_value),b.currency,date);
    else if(toInvestment){const cost=Math.max(0,Number(m.target_value)-(m.kind==='buy'?Number(m.fee):0));fund(m.id,date,b.name,cost,b.currency,cost*ratio);}
   }
  }
  if(date<start)continue;
  let total=0;
  for(const r of assets){
   const balance=balances.get(r.id);
   if(balance===undefined){
    const first=events.find(e=>e.record_id===r.id&&e.balance!==null);
    if(!first||first.occurred_on<=date||first.event_type!=='contribution'&&Number(first.balance)!==0)missing=true;
    continue;
   }
   const live=date===input.today?marketEntry(r,r.currency,input.market):null;
   total+=usd(live?value(live):balance,r.currency,date);
  }
  if(input.method.mode==='date'&&!seeded){
   payouts=0;principal=0;
   flows.push({date,amount:total});details.push({id:'opening',date,name:'Starting investment value',amount:total,currency:'USD',reused:0});seeded=true;
  }
  points.push({date,amount:total+principal+payouts});
 }
 if(input.method.mode==='purchases'&&unverified.size)return {missingPurchases:[...unverified].map(id=>byId.get(id)!.name),result:null,details};
 if(missing)return null;
 const result=compareInvestments(0,flows,points,{...data,start},'USD',true,portfolio);
 const rates=input.market?.rates??(input.market?.fx?{UZS:input.market.fx.rate}:{});
 if(convertAmount(1,'USD',input.currency,rates)===null)return null;
 return {missingPurchases:[],details,result:{...result,points:result.points.map(point=>Object.fromEntries(Object.entries(point).map(([key,amount])=>[key,key==='date'||amount===null?amount:convertAmount(Number(amount),'USD',input.currency,rates)])) as typeof point)}};
}
