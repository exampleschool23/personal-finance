"use client";
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import type { PortfolioPoint } from '@/lib/portfolio-history';
import type { PortfolioChange, PortfolioDetails } from '@/lib/portfolio-changes';

type Props={showBalanceDifference?:boolean;valueLabel?:string;active?:boolean;payload?:readonly {payload?:PortfolioPoint}[];details:Map<string,PortfolioDetails>;currency:string;onOpenActivity?:(activity:PortfolioChange)=>void};
export function PortfolioTooltip({active,payload,details,currency,onOpenActivity,valueLabel='NET WORTH',showBalanceDifference=true}:Props){
 const {t,locale}=useLanguage();
 const point=payload?.[0]?.payload;
 if(!active||!point)return null;
 const detail=details.get(point.date);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 const signed=(amount:number)=>(amount>0?'+':'')+money(amount);
 const rows=(items:PortfolioChange[])=>items.map(row=><button type="button" className="portfolio-tooltip-row" key={row.id} disabled={!row.record||!onOpenActivity} onClick={event=>{event.stopPropagation();onOpenActivity?.(row);}}><i style={{background:categoryColor(row.kind)}}/><div><strong>{row.name}</strong><span>{t(row.label)}</span></div><b>{row.amount===null?'—':signed(row.amount)}</b></button>);
 return <div className="portfolio-tooltip" onMouseMove={event=>event.stopPropagation()} onTouchMove={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
  <header><span>{formatDate(point.date,locale)}</span><small>{t(valueLabel)}</small><strong>{money(point.net)}</strong></header>
  <div className="portfolio-tooltip-body" tabIndex={0} role="region" aria-label={t('Recorded activity')} onKeyDown={event=>{if(event.key!=='Escape')event.stopPropagation();}}>
   {detail?.activity.length?<section><h4>{t('Recorded activity')}</h4>{rows(detail.activity)}</section>:<p className="portfolio-tooltip-note">{t('No recorded activity in this interval.')}</p>}
   {showBalanceDifference&&!!detail?.remainder&&<p className="portfolio-tooltip-note">{t('Live prices or other balance differences')} <strong>{signed(detail.remainder)}</strong></p>}
  </div>
 </div>;
}
