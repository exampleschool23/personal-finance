import { getInvestmentComparison, type InvestmentPortfolioInput } from './investment-portfolio';
import type { BenchmarkData } from './benchmark-data';
import type { DiversifiedPortfolio } from './diversified-portfolio';

// Overview keeps its net-worth line, while benchmarks replay the same dated
// investment funding as the Investments view. A visible range only crops the
// result; it must not reset purchases to that range's opening net worth.
export function getNetWorthComparison(points: readonly {date:string;net:number}[], data:BenchmarkData, input:InvestmentPortfolioInput, portfolio?:DiversifiedPortfolio|null) {
 if(!points.length)return null;
 const result=getInvestmentComparison(input,data,portfolio);
 if(!result)return null;
 const byDate=new Map(result.points.map(point=>[point.date,point]));
 return {...result,points:points.map(point=>({
  ...byDate.get(point.date),date:point.date,actual:point.net,
 }))};
}
