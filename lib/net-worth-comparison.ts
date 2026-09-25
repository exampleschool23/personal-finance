import { compareInvestments } from './investment-comparison';
import type { BenchmarkData } from './benchmark-data';
import type { DiversifiedPortfolio } from './diversified-portfolio';
import { convertAmount, type MarketData } from './market';

// Overview asks how its opening net worth would grow if invested once.
// Investment contributions include transfers within wealth, so must not fund
// this comparison a second time. Simulate in USD to keep display FX neutral.
export function getNetWorthComparison(points: readonly {date:string;net:number}[], data:BenchmarkData, currency:string, market:MarketData|null, portfolio?:DiversifiedPortfolio|null) {
 const first=points[0];
 if(!first||!Number.isFinite(first.net)||first.net<0||first.date<data.start||first.date>data.end)return null;
 const rates=market?.rates??(market?.fx?{UZS:market.fx.rate}:{});
 const starting=convertAmount(first.net,currency,'USD',rates);
 const displayRate=convertAmount(1,'USD',currency,rates);
 if(starting===null||displayRate===null)return null;
 const result=compareInvestments(starting,[],[],{...data,start:first.date},'USD',false,portfolio);
 const byDate=new Map(result.points.map(point=>[point.date,point]));
 return {...result,points:points.map(point=>{
  const comparison=byDate.get(point.date);
  return {...Object.fromEntries(Object.entries(comparison??{}).map(([key,value])=>[key,typeof value==='number'?value*displayRate:value])),date:point.date,actual:point.net,contributed:first.net};
 })};
}
