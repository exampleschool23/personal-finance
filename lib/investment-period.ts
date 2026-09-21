import { investmentEvents } from './actual-investment-performance';
import { income, expenses, liabilities } from './finance';
import { convertAmount } from './market';
import type { InvestmentPortfolioInput } from './investment-portfolio';

export type PeriodRow={name:string;date:string;category:string;amount:number|null};
export function investmentPeriodTotals(input:InvestmentPortfolioInput,start:string,details?:Record<'income'|'invested'|'expenses',PeriodRow[]>){
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
 for(const event of investmentEvents(input.records,input.events,input.today)){
  if(event.occurred_on<start)continue;
  const record=records.get(event.record_id)!;
  const currency=event.currency??record.currency;
  context={name:record.name,date:event.occurred_on,category:record.kind};
  if(liabilities.includes(record.kind)){
   // Activity classification includes the full payment; valuation still retains principal only.
   add('invested',Number(event.amount),currency);
  }else if(event.event_type==='income')add('income',Number(event.amount),currency);
  else if(event.event_type==='expense')add('expenses',Number(event.amount),currency);
  else if(event.event_type==='contribution'){
   const improvement=['Business','Property'].includes(record.kind);
   if(improvement)context.category=record.kind==='Property'?'Rental improvements':'Business investment';
   add('invested',Number(event.amount),currency);
  }
 }
 for(const event of investmentEvents(input.records,input.events,input.today)){
  context={name:records.get(event.record_id)?.name??'',date:event.occurred_on,category:'Internal income adjustment'};
  if(event.occurred_on>=start&&event.event_type==='income'&&event.account_link&&records.get(event.account_link.account_id)?.is_investment===true)add('invested',-Math.abs(Number(event.account_link.amount)),event.account_link.account_currency??records.get(event.account_link.account_id)!.currency);
 }
 // Actual cashflow rows include salary and personal spending. Linked tracker
 // rows are counted once through their source event, not a second time here.
 const eventIds=new Set(investmentEvents(input.records,input.events,input.today).map(event=>event.id));
 for(const row of input.cashflows??[]){
  if(row.frequency!=='Once'||!row.date||row.date<start||row.date>input.today)continue;
  context={name:row.name,date:row.date,category:row.kind};
  if(row.history_event_id&&eventIds.has(row.history_event_id))continue;
  if(row.mortgage_payment_id){
   if(!eventIds.has(row.mortgage_payment_id)){
    context.category='Mortgage';
    add('invested',Number(row.amount),row.currency);
   }
   continue;
  }
  if(income.includes(row.kind))add('income',Number(row.amount),row.currency);
  else if(expenses.includes(row.kind))add('expenses',Number(row.amount),row.currency);
 }
 totals.invested=Math.max(0,totals.invested);
 return {...totals,missing:[...missing]};
}
