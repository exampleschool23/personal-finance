import { receivedIncome } from './income-history';
import { compareInvestments, convertHistorical, type ComparisonPoint } from './investment-comparison';
import { convertAmount } from './market';
import type { InvestmentPortfolioInput } from './investment-portfolio';
import type { BenchmarkData } from './benchmark-data';
import type { DiversifiedPortfolio } from './diversified-portfolio';

export function incomeBenchmarkFunding(input:InvestmentPortfolioInput,data:BenchmarkData) {
 const receipts=receivedIncome(input.records,input.events,input.cashflows??[],input.today).filter(receipt=>!input.openingNetWorth||receipt.date>input.openingNetWorth.date);
 let missing=0;
 const flows=receipts.flatMap(receipt=>{
  const amount=convertHistorical(receipt.amount,receipt.currency,'USD',receipt.date,data.fx);
  // Never silently drop a receipt when a required currency rate is unavailable.
  if(amount===null||amount<0||receipt.date<data.start||receipt.date>data.end){missing++;return [];}
  return [{date:receipt.date,amount}];
 });
 return {receipts,flows,missing};
}

// Opening net worth is an end-of-day starting balance. Later receipts buy
// each benchmark once; spending does not withdraw hypothetical holdings.
export function compareIncomeBenchmarks(input:InvestmentPortfolioInput,data:BenchmarkData,portfolio?:DiversifiedPortfolio|null) {
 const funding=incomeBenchmarkFunding(input,data);
 const rates=input.market?.rates??(input.market?.fx?{UZS:input.market.fx.rate}:{});
 if(funding.missing||convertAmount(1,'USD',input.currency,rates)===null)return null;
 const opening=input.openingNetWorth;
 const capital=opening?convertAmount(opening.amount,input.currency,'USD',rates):0;
 if(capital===null||!Number.isFinite(capital)||capital<0||opening&&(opening.date<data.start||opening.date>data.end))return null;
 const flows=opening?[{date:opening.date,amount:capital},...funding.flows]:funding.flows;
 const result=compareInvestments(0,flows,[],data,'USD',true,portfolio);
 return {...result,netCashFlow:convertAmount(result.netCashFlow,'USD',input.currency,rates)!,points:result.points.map(point=>Object.fromEntries(Object.entries(point).map(([key,amount])=>[key,key==='date'||amount===null?amount:convertAmount(Number(amount),'USD',input.currency,rates)])) as ComparisonPoint)};
}
