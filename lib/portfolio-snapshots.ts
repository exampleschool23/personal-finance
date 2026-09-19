import { assets, liabilities, value, type Entry } from './finance';
import { convertAmount, instrumentFor, instrumentKey, type MarketData } from './market';
import type { PortfolioPoint } from './portfolio-history';

export type PortfolioSnapshot = { occurred_on: string; assets: number; debt: number; rates: Record<string,number>; updated_at: string };

// Totals are in USD; original holdings, ownership and quantities remain untouched.
export function snapshotTotals(records:Entry[],market:Pick<MarketData,'quotes'|'rates'|'fx'>){
 const rates={...(market.rates??(market.fx?{UZS:market.fx.rate}:{})),USD:1};
 let assetTotal=0,debt=0;
 for(const record of records){
  if(!assets.includes(record.kind)&&!liabilities.includes(record.kind))continue;
  const instrument=instrumentFor(record);
  let amount:number|null;
  if(['Crypto','Stock'].includes(record.kind)&&Number(record.quantity)>0){
   const quote=instrument?market.quotes[instrumentKey(instrument)]:undefined;
   if(!quote||!Number.isFinite(quote.usd)||quote.usd<=0)return null;
   amount=quote.usd*Number(record.quantity);
  }else amount=convertAmount(value(record),record.currency,'USD',rates);
  if(amount===null||!Number.isFinite(amount)||amount<0)return null;
  if(assets.includes(record.kind))assetTotal+=amount;else debt+=amount;
 }
 return {assets:assetTotal,debt,rates};
}

export function snapshotPoints(snapshots:PortfolioSnapshot[],currency:string):PortfolioPoint[]{
 return snapshots.flatMap(snapshot=>{
  const assets=convertAmount(Number(snapshot.assets),'USD',currency,snapshot.rates);
  const debt=convertAmount(Number(snapshot.debt),'USD',currency,snapshot.rates);
  return assets===null||debt===null?[]:[{date:snapshot.occurred_on,assets,debt,net:assets-debt}];
 });
}

export function mergePortfolioPoints(recorded:PortfolioPoint[],snapshots:PortfolioPoint[],current:PortfolioPoint,source:'recorded'|'observed'='recorded'){
 const byDate=new Map<string,PortfolioPoint>();
 // Aggregate observations cannot be reconciled after records are added or
 // backdated. Keep them separate instead of overriding dated balances.
 for(const point of [...(source==='recorded'?recorded:snapshots),current])if(point.date<=current.date)byDate.set(point.date,point);
 return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
