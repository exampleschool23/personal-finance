import { benchmarkExpenseFunding, benchmarkInvestment, investmentActivity, openingFunding, type BenchmarkMovement } from './investment-benchmarks';
import { income, liabilities } from './finance';
import { convertAmount } from './market';
import type { InvestmentPortfolioInput } from './investment-portfolio';

export type PeriodRow={name:string;date:string;category:string;amount:number|null};
// The three figures follow the chart's funding rules: money invested is what funds benchmarks
// when expenses are excluded (purchases, principal repayments and values recorded without a purchase), and expenses paid is what "Including expenses" adds to it.
export function investmentPeriodTotals(input:InvestmentPortfolioInput&{movements?:BenchmarkMovement[]},start:string,details?:Record<'income'|'invested'|'expenses',PeriodRow[]>){
 const totals={income:0,invested:0,expenses:0};
 const missing=new Set<string>();
 const records=new Map(input.records.map(record=>[record.id,record]));
 const rates=input.market?.rates??(input.market?.fx?{UZS:input.market.fx.rate}:{});
 let context={name:'',date:'',category:''};
 const add=(key:keyof typeof totals,amount:number,currency:string)=>{
  const converted=convertAmount(amount,currency,input.currency,rates);
  if(amount!==0)details?.[key].push({...context,amount:converted});
  if(converted===null||!Number.isFinite(converted))missing.add(currency);else totals[key]+=converted;
 };
 const inPeriod=(date:string)=>date>=start&&date<=input.today;
 const activity=investmentActivity(input.records,input.events,input.movements,input.today);
 for(const item of activity.items){
  if(item.payout||!inPeriod(item.date))continue;
  const kind=records.get(item.recordId)?.kind??'';
  context={name:item.name,date:item.date,category:kind==='Property'?'Rental improvements':kind==='Valuables'?'Valuables purchase':kind==='Vehicle'?'Vehicle purchase':kind==='Retirement account'?'Retirement contribution':kind==='Business'?'Business investment':kind};
  // Money moved from another investment is the same capital, not a new investment.
  add('invested',item.amount-item.reused,item.currency);
 }
 // A holding valued without a recorded purchase counts its first value as invested that day, as in the chart.
 for(const item of openingFunding(input.records,input.events,input.today).values()){
  if(!inPeriod(item.date))continue;
  context={name:item.name,date:item.date,category:'Recorded value · purchase not recorded'};
  add('invested',item.amount,item.currency);
 }
 const eventIds=new Set(activity.events.map(event=>event.id));
 const copied=new Set((input.cashflows??[]).map(row=>row.history_event_id).filter(Boolean));
 for(const event of activity.events){
  const record=records.get(event.record_id);
  if(!record||!inPeriod(event.occurred_on))continue;
  context={name:record.name,date:event.occurred_on,category:record.kind};
  if(benchmarkInvestment(record)&&event.event_type==='income')add('income',Number(event.amount),record.currency);
  // Older Tracker expenses and payments have no transaction copy; count them from the Tracker.
  else if(benchmarkInvestment(record)&&event.event_type==='expense'&&!copied.has(event.id))add('expenses',Number(event.amount),record.currency);
  else if(liabilities.includes(record.kind)&&event.event_type==='mortgage_payment'&&!(input.cashflows??[]).some(row=>row.mortgage_payment_id===event.id)){context.category='Mortgage interest';add('expenses',Number(event.interest??Number(event.amount)-Number(event.principal)),record.currency);}
 }
 for(const row of benchmarkExpenseFunding(input.cashflows,input.today)){
  if(!inPeriod(row.date))continue;
  const source=(input.cashflows??[]).find(item=>'expense:'+item.id===row.id);
  context={name:row.name,date:row.date,category:source?.mortgage_payment_id?'Mortgage interest':row.kind};
  add('expenses',row.amount,row.currency);
 }
 // Actual cashflow rows include salary and other income. Linked Tracker
 // rows are counted once through their source event, not a second time here.
 for(const row of input.cashflows??[]){
  if(row.frequency!=='Once'||!row.date||!inPeriod(row.date))continue;
  context={name:row.name,date:row.date,category:row.kind};
  if(row.mortgage_payment_id&&!eventIds.has(row.mortgage_payment_id)){
   // The payment itself could not be read: its saved copy still carries the principal.
   context.category='Mortgage';
   add('invested',Number(row.payment_principal??Number(row.amount)-Number(row.payment_interest??0)),row.currency);
  }else if(income.includes(row.kind)&&!(row.history_event_id&&eventIds.has(row.history_event_id)))add('income',Number(row.amount),row.currency);
 }
 return {...totals,missing:[...missing]};
}
