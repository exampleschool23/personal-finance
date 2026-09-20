import { assets, liabilities, income, expenses, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
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
export function recordedCashFlows(records: Entry[], currency: string, fx: FxPoint[], start: string, end: string) {
 const days = new Map<string, number>();
 let missing = 0;
 for (const record of records) {
  if (record.frequency !== 'Once' || record.date <= start || record.date > end || (!income.includes(record.kind) && !expenses.includes(record.kind))) continue;
  const amount = convertHistorical(Number(record.amount), record.currency, currency, record.date, fx);
  if (amount === null) { missing++; continue; }
  days.set(record.date, (days.get(record.date) ?? 0) + (income.includes(record.kind) ? amount : -amount));
 }
 return { flows: [...days].map(([date,amount]) => ({ date, amount })).sort((a,b) => a.date.localeCompare(b.date)), missing };
}
export function monthlyCashFlows(start: string, end: string, amount: number): CashFlow[] {
 // Deposit at the end of each complete monthly anniversary, clipping short months.
 const original = new Date(dateMillis(start));
 const flows: CashFlow[] = [];
 for (let month = 1; ; month++) {
  const last = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + month + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + month, Math.min(original.getUTCDate(), last))).toISOString().slice(0,10);
  if (date > end) break;
  flows.push({date,amount});
 }
 return flows;
}
export function netWorthHistory(records: Entry[], events: HistoryEvent[], currency: string, fx: FxPoint[], dates: string[]): WealthPoint[] {
 const holdings = records.filter(record => assets.includes(record.kind) || liabilities.includes(record.kind));
 const byId = new Map(holdings.map(record => [record.id,record]));
 const sorted = events.filter(event => byId.has(event.record_id) && event.balance !== null).sort((a,b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
 const balances = new Map<string, number>();
 let cursor = 0;
 return [...dates].sort().map(date => {
  while (cursor < sorted.length && sorted[cursor].occurred_on <= date) {
   const event = sorted[cursor++];
   balances.set(event.record_id, Number(event.balance) * Number(event.ownership_percentage) / 100);
  }
  if (!holdings.length || balances.size !== holdings.length) return { date, amount: null };
  let total = 0;
  for (const record of holdings) {
   const amount = convertHistorical(balances.get(record.id)!, record.currency, currency, date, fx);
   if (amount === null || !Number.isFinite(amount)) return { date, amount: null };
   total += liabilities.includes(record.kind) ? -amount : amount;
  }
  return { date, amount: total };
 });
}
export function firstCompleteDate(records: Entry[], events: HistoryEvent[]) {
 const holdings = records.filter(record => assets.includes(record.kind) || liabilities.includes(record.kind));
 const first = holdings.map(record => events.filter(event => event.record_id === record.id && event.balance !== null).map(event => event.occurred_on).sort()[0]);
 return first.length && first.every(Boolean) ? first.sort().at(-1)! : null;
}
function priceAt(prices: PricePoint[], date: string, currency: string, fx: FxPoint[]) {
 const quote = latestOn(prices,date);
 // Weekend/holiday closes may carry forward briefly; do not hide long feed gaps.
 if (!quote || !Number.isFinite(quote.close) || quote.close<=0 || dateMillis(date) - dateMillis(quote.date) > 7 * dayMillis) return null;
 return convertHistorical(quote.close,'USD',currency,date,fx);
}
export function compareInvestments(starting: number, flows: CashFlow[], actual: WealthPoint[], data: BenchmarkData, currency: string, includeStartFlows = false) {
 const dates: string[] = [];
 for (let date = data.start; date <= data.end; date = shiftDay(date,1)) dates.push(date);
 const flowsByDay = new Map<string,number>();
 for (const flow of flows) if ((flow.date > data.start || (includeStartFlows && flow.date === data.start)) && flow.date <= data.end) flowsByDay.set(flow.date,(flowsByDay.get(flow.date) ?? 0) + flow.amount);
 const keys = Object.keys(data.prices);
 const units = new Map<string,number | null>();
 const unavailable = new Set<string>();
 for (const key of keys) {
  const price = priceAt(data.prices[key],data.start,currency,data.fx);
  units.set(key,starting===0?0:price && starting >= 0 ? starting / price : null);
  if (units.get(key) === null) unavailable.add(key);
 }
 // Deposits compound daily at an annual effective rate; additions earn only after their date.
 const deposits = [{key:'depositUZS',currency:'UZS',rate:.21},{key:'depositUSD',currency:'USD',rate:.08}];
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
   const price = priceAt(data.prices[key],date,currency,data.fx);
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
  return point;
 });
 return {points,unavailable:[...unavailable],netCashFlow:contributed-starting};
}

// Cumulative profit / gross invested capital. Keep gross purchases separate from
// sales so realized profit remains meaningful after a complete withdrawal.
export function percentagePerformance(points:ComparisonPoint[],flows:CashFlow[],starting=0){
 const investedByDay=new Map<string,number>();
 for(const flow of flows)if(flow.amount>0)investedByDay.set(flow.date,(investedByDay.get(flow.date)??0)+flow.amount);
 let invested=starting;
 return points.map(point=>{
  invested+=investedByDay.get(point.date)??0;
  const result:ComparisonPoint={date:point.date,actual:null,contributed:point.contributed,invested};
  for(const [key,amount] of Object.entries(point))if(key!=='date'&&key!=='contributed')result[key]=typeof amount==='number'&&invested>0?(amount-point.contributed)/invested*100:null;
  return result;
 });
}
