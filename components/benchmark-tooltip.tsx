"use client";
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { benchmarkUnitPrice } from '@/lib/investment-comparison';
import type { BenchmarkData } from '@/lib/benchmark-data';
import type { receivedIncome } from '@/lib/income-history';

type Receipt=ReturnType<typeof receivedIncome>[number];
type Point={date:string;contributed?:number;[key:string]:string|number|null|undefined};
type Props={marketHistory?:BenchmarkData|null;openingNetWorth?:{date:string;amount:number};active?:boolean;payload?:readonly {payload?:Point}[];receipts:Receipt[];currency:string;series:{key:string;label:string;color:string}[]};
export function BenchmarkTooltip({active,payload,receipts,currency,series,openingNetWorth,marketHistory}:Props){
 const {t,locale}=useLanguage();
 const point=payload?.[0]?.payload;
 if(!active||!point)return null;
 const btcPrice=marketHistory?benchmarkUnitPrice(marketHistory.prices.BTC??[],point.date,'USD',marketHistory.fx):null;
 const funding=receipts.filter(receipt=>receipt.date===point.date&&(!openingNetWorth||receipt.date>openingNetWorth.date));
 return <div className="portfolio-tooltip benchmark-tooltip" onMouseMove={event=>event.stopPropagation()} onTouchMove={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
  <header><span>{formatDate(point.date,locale)}</span>{series.map(item=><div className="portfolio-tooltip-row" key={item.key}><i style={{background:item.color}}/><div><strong>{item.label}</strong>{item.key==='BTC'&&<span>{t('BTC price (USD)')}: {btcPrice===null?'—':formatMoney(btcPrice,'USD',locale,true)}</span>}</div><b>{typeof point[item.key]==='number'?formatMoney(point[item.key] as number,currency,locale):'—'}</b></div>)}</header>
  <div className="portfolio-tooltip-body" tabIndex={0} role="region" aria-label={t('Income invested on this date')} onKeyDown={event=>{if(event.key!=='Escape')event.stopPropagation();}}>
   <p className="portfolio-tooltip-note">{t('Total funding invested by this date')} <strong>{typeof point.contributed==='number'?formatMoney(point.contributed,currency,locale):'—'}</strong></p>
   {openingNetWorth&&point.date>=openingNetWorth.date&&<p className="portfolio-tooltip-note">{t('Opening net worth invested')} · {formatDate(openingNetWorth.date,locale)} <strong>{formatMoney(openingNetWorth.amount,currency,locale)}</strong></p>}
   <section><h4>{t('Income invested on this date')}</h4>{funding.length?funding.map(receipt=><div className="portfolio-tooltip-row" key={receipt.id}><i style={{background:categoryColor('Other income')}}/><div><strong>{receipt.name}</strong><span>{t('Income received and invested')}</span></div><b>{formatMoney(receipt.amount,receipt.currency,locale)}</b></div>):<p className="portfolio-tooltip-note">{t('No new income invested on this date.')}</p>}</section>
   <p className="portfolio-tooltip-note">{t('Opening net worth funds each benchmark first. Income after that date is invested when received; income already included in the opening balance is not added again.')}</p>
  </div>
 </div>;
}
