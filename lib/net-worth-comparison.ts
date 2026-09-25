import type { InvestmentPortfolioInput } from './investment-portfolio';
import { compareIncomeBenchmarks } from './income-benchmarks';
import type { BenchmarkData } from './benchmark-data';
import type { DiversifiedPortfolio } from './diversified-portfolio';
import { latestOn } from './benchmark-data';

// Overview keeps its net-worth line, while benchmarks replay the same dated
// income receipts. A visible range only crops the
// result; it must not reset purchases to that range's opening net worth.
export function getNetWorthComparison(points: readonly {date:string;net:number}[], data:BenchmarkData, input:InvestmentPortfolioInput, portfolio?:DiversifiedPortfolio|null) {
 if(!points.length)return null;
 const result=compareIncomeBenchmarks(input,data,portfolio);
 if(!result)return null;
 const actual=[...points].sort((a,b)=>a.date.localeCompare(b.date));
 return {...result,points:result.points.filter(point=>point.date>=actual[0].date).map(point=>({
  ...point,actual:latestOn(actual,point.date)?.net??null,
 }))};
}
