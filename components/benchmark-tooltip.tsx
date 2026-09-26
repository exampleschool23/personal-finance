"use client";
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { benchmarkUnitPrice } from '@/lib/investment-comparison';
import type { BenchmarkData } from '@/lib/benchmark-data';
import type { FundingDetail, FundingScope } from '@/lib/investment-benchmarks';
import type { receivedIncome } from '@/lib/income-history';

type Receipt=ReturnType<typeof receivedIncome>[number];
type Point={date:string;contributed?:number;[key:string]:string|number|null|undefined};
type Props={scope?:FundingScope;fundingDetails?:FundingDetail[];marketHistory?:BenchmarkData|null;openingNetWorth?:{date:string;amount:number};active?:boolean;payload?:readonly {payload?:Point}[];receipts:Receipt[];currency:string;series:{key:string;label:string;color:string}[]};
export function BenchmarkTooltip({active,payload,receipts,currency,series,openingNetWorth,marketHistory,fundingDetails,scope='investments'}:Props){
 const {t,locale}=useLanguage();
 const point=payload?.[0]?.payload;
 if(!active||!point)return null;
 const btcPrice=marketHistory?benchmarkUnitPrice(marketHistory.prices.BTC??[],point.date,'USD',marketHistory.fx):null;
 const funding=(fundingDetails??receipts).filter(receipt=>receipt.date===point.date&&(!openingNetWorth||receipt.date>openingNetWorth.date));
 return <div className="portfolio-tooltip benchmark-tooltip" onMouseMove={event=>event.stopPropagation()} onTouchMove={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
  <header><span>{formatDate(point.date,locale)}</span>{series.map(item=><div className="portfolio-tooltip-row" key={item.key}><i style={{background:item.color}}/><div><strong>{item.label}</strong>{item.key==='BTC'&&<span>{t('BTC price (USD)')}: {btcPrice===null?'—':formatMoney(btcPrice,'USD',locale,true)}</span>}</div><b>{typeof point[item.key]==='number'?formatMoney(point[item.key] as number,currency,locale):'—'}</b></div>)}</header>
  <div className="portfolio-tooltip-body" tabIndex={0} role="region" aria-label={t(fundingDetails?'Investment activity on this date':'Income invested on this date')} onKeyDown={event=>{if(event.key!=='Escape')event.stopPropagation();}}>
   <p className="portfolio-tooltip-note">{t('Total funding invested by this date')} <strong>{typeof point.contributed==='number'?formatMoney(point.contributed,currency,locale):'—'}</strong></p>
   {openingNetWorth&&point.date>=openingNetWorth.date&&<p className="portfolio-tooltip-note">{t('Opening net worth invested')} · {formatDate(openingNetWorth.date,locale)} <strong>{formatMoney(openingNetWorth.amount,currency,locale)}</strong></p>}
   <section><h4>{t(fundingDetails?'Investment activity on this date':'Income invested on this date')}</h4>{funding.length?funding.map(receipt=><div className="portfolio-tooltip-row" key={receipt.id}><i style={{background:categoryColor('kind' in receipt&&receipt.kind?receipt.kind:'Other income')}}/><div><strong>{receipt.id==='opening'?t(receipt.name):receipt.name}</strong><span>{'source' in receipt&&receipt.source==='expense'?t('Expense funding')+' · '+t(receipt.kind??'Other expense'):t('principal' in receipt?'Principal repaid':fundingDetails?'Fresh investment funding':'Income received and invested')}</span></div><b>{formatMoney('principal' in receipt&&typeof receipt.principal==='number'?receipt.principal:receipt.amount,receipt.currency,locale)}</b>{'reused' in receipt&&receipt.reused>0&&<small>{t('Transferred from an existing investment')}: {formatMoney(receipt.reused,receipt.currency,locale)}</small>}</div>):<p className="portfolio-tooltip-note">{t(fundingDetails?'No new investment funding on this date.':'No new income invested on this date.')}</p>}</section>
   <p className="portfolio-tooltip-note">{t(fundingDetails?scope==='expenses'?'Principal repayments, investment purchases and every recorded expense, including interest and fees, fund benchmarks. Only explicitly linked transfers from existing investments are excluded.':'Principal repayments and investment purchases fund benchmarks. Only explicitly linked transfers from existing investments are excluded. Interest, fees and living expenses are excluded.':'Opening net worth funds each benchmark first. Income after that date is invested when received; income already included in the opening balance is not added again.')}</p>
  </div>
 </div>;
}
