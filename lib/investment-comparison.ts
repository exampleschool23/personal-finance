import { portfolioAssets, portfolioAssetKey, portfolioAssetCurrency, type DiversifiedPortfolio } from './diversified-portfolio';
import { dateMillis, dayMillis, historicalRate, latestOn, shiftDay, type BenchmarkData, type FxPoint, type PricePoint } from './benchmark-data';

export type CashFlow = { date: string; amount: number };
export type WealthPoint = { date: string; amount: number | null };
export type ComparisonPoint = { date: string; actual: number | null; contributed: number; [key: string]: string | number | null };
export function convertHistorical(amount: number, from: string, to: string, date: string, fx: FxPoint[]) {
 if (!Number.isFinite(amount)) return null;
 if (amount === 0 || from === to) return amount;
 const source = historicalRate(fx, from, date), target = historicalRate(fx, to, date);
 return source && target ? amount / source * target : null;
}
export function benchmarkUnitPrice(prices: PricePoint[], date: string, currency: string, fx: FxPoint[]) {
 const quote = latestOn(prices,date);
 // Weekend/holiday closes may carry forward briefly; do not hide long feed gaps.
 if (!quote || !Number.isFinite(quote.close) || quote.close<=0 || dateMillis(date) - dateMillis(quote.date) > 7 * dayMillis) return null;
 return convertHistorical(quote.close,'USD',currency,date,fx);
}
export function compareInvestments(starting: number, flows: CashFlow[], actual: WealthPoint[], data: BenchmarkData, currency: string, includeStartFlows = false, portfolio?: DiversifiedPortfolio | null) {
 const dates: string[] = [];
 for (let date = data.start; date <= data.end; date = shiftDay(date,1)) dates.push(date);
 const flowsByDay = new Map<string,number>();
 for (const flow of flows) if ((flow.date > data.start || (includeStartFlows && flow.date === data.start)) && flow.date <= data.end) flowsByDay.set(flow.date,(flowsByDay.get(flow.date) ?? 0) + flow.amount);
 // Modeled business returns and USD cash share the same dated purchase engine.
 const prices = {...data.prices};
 if (portfolio) for(const asset of portfolioAssets(portfolio)) {
  const key=portfolioAssetKey(asset,portfolio);
  if(!portfolio.assets&&(asset.kind==='business'||asset.kind==='cash'))prices[key]=dates.map((date,index)=>({date,close:(1+(asset.kind==='business'?asset.rate:0)/100)**(index/365)}));
 }

 const keys = Object.keys(prices);
 const units = new Map<string,number | null>();
 const unavailable = new Set<string>();
 for (const key of keys) {
  const price = benchmarkUnitPrice(prices[key],data.start,currency,data.fx);
  units.set(key,starting===0?0:price && starting >= 0 ? starting / price : null);
  if (units.get(key) === null) unavailable.add(key);
 }
 // Deposits compound daily at an annual effective rate; additions earn only after their date.
 const deposits = [...(portfolio?.assets?portfolioAssets(portfolio).filter(asset=>!['stock','crypto'].includes(asset.kind)).map(asset=>({key:portfolioAssetKey(asset,portfolio),currency:portfolioAssetCurrency(asset),rate:asset.kind==='cash'?0:asset.rate/100})):[]),{key:'depositUZS',currency:'UZS',rate:.21},{key:'depositUSD',currency:'USD',rate:.08}];
 for (const deposit of deposits) {
  units.set(deposit.key, convertHistorical(starting,currency,deposit.currency,data.start,data.fx));
  if (units.get(deposit.key) === null) unavailable.add(deposit.key);
 }
 let contributed = starting;
 const points: ComparisonPoint[] = dates.map((date,index) => {
  const flow = index || includeStartFlows ? flowsByDay.get(date) ?? 0 : 0;
  contributed += flow;
  const point: ComparisonPoint = {date,actual:latestOn(actual,date)?.amount ?? null,contributed};
  for (const key of keys) {
   const price = benchmarkUnitPrice(prices[key],date,currency,data.fx);
   let holding = units.get(key) ?? null;
   // Missing valuation quotes do not destroy known units. A missing trade
   // price does: we cannot reconstruct the purchase/withdrawal later.
   if(holding===null){point[key]=null;continue;}
   if(price===null){
    if(flow!==0){units.set(key,null);unavailable.add(key);}
    point[key]=holding===0&&flow===0?0:null;
    if(point[key]===null)unavailable.add(key);
    continue;
   }
   if(holding*price+flow < -1e-8){units.set(key,null);point[key]=null;unavailable.add(key);continue;}
   holding=Math.max(0,holding+flow/price);
   units.set(key,holding);
   point[key]=holding*price;
  }
  for (const deposit of deposits) {
   let balance = units.get(deposit.key) ?? null;
   const addition = convertHistorical(flow,currency,deposit.currency,date,data.fx);
   if (balance !== null && addition !== null) balance = balance * (index ? (1 + deposit.rate) ** (1 / 365) : 1) + addition;
   else balance = null;
   if (balance !== null && balance < -1e-8) balance = null;
   units.set(deposit.key,balance);
   point[deposit.key] = balance === null ? null : convertHistorical(Math.max(0,balance),deposit.currency,currency,date,data.fx);
   if (point[deposit.key] === null) unavailable.add(deposit.key);
  }
  if (portfolio) {
   const sleeves = portfolioAssets(portfolio).map(asset=>({key:portfolioAssetKey(asset,portfolio),weight:asset.weight})).filter(sleeve=>sleeve.weight>0);
   point.PORTFOLIO = sleeves.every(sleeve=>typeof point[sleeve.key]==='number') ? sleeves.reduce((sum,sleeve)=>sum+(point[sleeve.key] as number)*sleeve.weight/100,0) : null;
   if(point.PORTFOLIO===null)unavailable.add('PORTFOLIO');
  }
  return point;
 });
 return {points,unavailable:[...unavailable],netCashFlow:contributed-starting};
}

// Cumulative profit / gross invested capital. Keep gross purchases separate from
