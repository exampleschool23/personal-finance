"use client";
import { normalizeEntry } from '@/lib/finance';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import type { MarketData } from '@/lib/market';
import { useState } from 'react';
import { CircleHelp, CalendarDays, ReceiptText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { useLanguage } from '@/components/language-provider';
import { monthlyReview } from '@/lib/transaction-tools';
import type { ToolsController } from '@/components/transaction-tools-panel';
import { emptyPlanning,type PlanningData } from '@/lib/planning';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatMonthYear } from '@/lib/format';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
export function MonthlyReview({data:providedData,owner,demo=false,revision=0,tools,snapshots,historyError,currency,market}:{data:PlanningData;owner?:string|null;demo?:boolean;revision?:number;tools:ToolsController;snapshots:PortfolioSnapshot[];historyError:string;currency:string;market?:MarketData|null}){
 const {t,locale}=useLanguage();
 const today=depositToday();
 const [month,setMonth]=useState(()=>today.slice(0,7));
 const remote=useOwnerResource('/api/planning?scope=review&month='+month,owner??null,!!owner&&!demo,revision,emptyPlanning);
 const data=owner&&!demo?{...remote.data,records:remote.data.records.map(normalizeEntry)}:providedData;
 const result=monthlyReview(data.records,tools.data.splits,snapshots,month,currency,today,data.activity,market?.rates??market?.fx?.rate,data.investmentLinks);
 const priorDate=new Date(month+'-01T00:00:00Z');priorDate.setUTCMonth(priorDate.getUTCMonth()-1);
 const previous=monthlyReview(data.records,tools.data.splits,snapshots,priorDate.toISOString().slice(0,7),currency,today,data.activity,market?.rates??market?.fx?.rate,data.investmentLinks);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 if(owner&&!demo&&(remote.loading||remote.error))return <section className="panel tools-panel monthly-review"><h2>{t('Monthly review')} · {formatMonthYear(month,locale)}</h2>{remote.error?<p role="alert">{t(remote.error)} <Button onClick={remote.retry}>{t('Retry')}</Button></p>:<p role="status">{t('Loading records…')}</p>}</section>;
 return <section className="panel tools-panel monthly-review">
  <header className="monthly-review-heading">
   <div><div className="monthly-review-title"><h2>{t('Monthly review')} · {formatMonthYear(month,locale)}</h2><Dialog>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="monthly-review-help" aria-label={t('How this review is calculated')} title={t('How this review is calculated')}><CircleHelp size={19} aria-hidden="true"/></Button></DialogTrigger>
    <DialogContent className="monthly-review-help-dialog" showCloseButton={false}>
     <DialogClose className="monthly-review-help-close" aria-label={t('Close')}><X size={18} aria-hidden="true"/></DialogClose>
     <div className="monthly-review-help-icon"><CircleHelp size={26} aria-hidden="true"/></div>
     <DialogTitle>{t('How this review is calculated')}</DialogTitle>
     <DialogDescription>{t('Recorded income and spending converted to {currency}. Includes principal and interest payments.',{currency})}</DialogDescription>
     <div className="monthly-review-help-note"><ReceiptText size={21} aria-hidden="true"/><p>{t('Recorded expenses include full mortgage and loan payments. Other currencies use available exchange rates. Recurring plans and transfers are excluded.')}</p></div>
     <div className="monthly-review-help-note"><CalendarDays size={21} aria-hidden="true"/><p>{t('The current month includes transactions through today; the previous month is a full month. Net-worth observations may not fall on month boundaries.')}</p></div>
     <DialogClose asChild><Button type="button" className="monthly-review-help-done">{t('Close')}</Button></DialogClose>
    </DialogContent>
   </Dialog></div><p className="muted">{t('Recorded income and spending converted to {currency}. Includes principal and interest payments.',{currency})}</p></div>
   <label>{t('Month')}<DatePicker mode="month" value={month} max={today} onChange={setMonth}/></label>
  </header>
  {tools.error&&<p className="error" role="alert">{t(tools.error)} <Button type="button" variant="outline" onClick={tools.retry}>{t('Retry')}</Button></p>}
  <div className="review-grid monthly-review-metrics">{[
   {label:'Income received',value:result.received,previous:previous.received},
   {label:'Actual spending',value:result.spent,previous:previous.spent},
   {label:'Income minus expenses',value:result.saved,previous:previous.saved},
  ].map(item=><article key={item.label}><h3>{t(item.label)}</h3><strong className={item.value<0?'negative':undefined}>{money(item.value)}</strong><p className="muted">{t('Previous month')}: {money(item.previous)}</p></article>)}</div>
  {!!(result.missing+previous.missing)&&<p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  <div className="monthly-review-net-worth"><strong>{t('Net-worth change')}: {historyError||result.netWorthChange===null?'—':money(result.netWorthChange)}</strong><p className="muted">{historyError?t('Net-worth history could not be loaded.'):result.netWorthChange!==null?t('Observed between {from} and {to}',{from:formatDate(result.from!,locale),to:formatDate(result.to!,locale)}):t('Two recorded balances are needed to show a change.')}</p></div>

 </section>;
}
