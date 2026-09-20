import { compareInvestments, type ComparisonPoint } from './investment-comparison';
import type { BenchmarkData } from './benchmark-data';
import { actualInvestmentPerformance, investmentEvents } from './actual-investment-performance';
import { isInvestmentRecord, type BaselineHolding } from './comparison-profile';
import { liabilities, value, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { convertAmount, marketEntry, type MarketData } from './market';

export type InvestmentPortfolioInput={records:Entry[];events:HistoryEvent[];cashflows?:Entry[];market:MarketData|null;currency:string;today:string};
// Application use case: one valuation policy for every view of the user's
// portfolio. Benchmark price simulation is deliberately a separate operation.
export function getInvestmentPortfolio({records,events,cashflows=[],market,currency,today}:InvestmentPortfolioInput){
 const included=records.filter(record=>isInvestmentRecord(record)||liabilities.includes(record.kind));
 const rates=market?.rates??(market?.fx?{UZS:market.fx.rate}:{});
 const activity=investmentEvents(records,events,today,cashflows);
 const live:BaselineHolding[]=records.filter(isInvestmentRecord).flatMap(record=>{
  const converted=marketEntry(record,record.currency,market);
  return converted?[{id:record.id,kind:record.kind as BaselineHolding['kind'],currency:record.currency,balance:value(converted)}]:[];
 });
 const performance=actualInvestmentPerformance(records,events,live,[{date:activity[0]?.occurred_on??today,rates}],currency,today,cashflows);
 const excluded=[...new Set(included.filter(record=>marketEntry(record,currency,market)===null).map(record=>record.currency))];
 const eventDates=new Set(activity.map(event=>event.occurred_on));
 const points=performance.points.filter(point=>point.amount!==null&&(eventDates.has(point.date)||point.date===today)).map(point=>({date:point.date,assets:point.amount!,debt:0,net:point.amount!}));
 return {performance,activity,records:included,rates,excluded,points,value:performance.points.at(-1)?.amount??null};
}

// Simulate in one base currency so changing the display currency cannot change
// hypothetical purchases. Convert the complete comparison at the same current
// rates as Overview, while benchmark instruments retain their dated prices/FX.
export function getInvestmentComparison(input:InvestmentPortfolioInput,data:BenchmarkData){
 const base=getInvestmentPortfolio({...input,currency:'USD'});
 if(base.performance.missing||convertAmount(1,'USD',input.currency,base.rates)===null)return null;
 const result=compareInvestments(0,base.performance.flows,base.performance.points,data,'USD',true);
 return {...result,netCashFlow:convertAmount(result.netCashFlow,'USD',input.currency,base.rates)!,points:result.points.map(point=>Object.fromEntries(Object.entries(point).map(([key,amount])=>[key,key==='date'||amount===null?amount:convertAmount(Number(amount),'USD',input.currency,base.rates)])) as ComparisonPoint)};
}

// Value growth and return after funding answer different questions. Keep both
// explicit so consuming screens cannot substitute one for the other.
export function investmentValueChange(values: readonly (number | null)[]) {
 if(values.length<2||values[0]===null||values.at(-1)===null)return null;
 return values.at(-1)!-values[0]!;
}
