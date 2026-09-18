"use client";
import type { MarketData } from '@/lib/market';
import { ForecastAccountAssignment } from '@/components/forecast-account-assignment';
import { useState } from 'react';
import Link from 'next/link';
import { CircleHelp, CalendarDays, ReceiptText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { useLanguage } from '@/components/language-provider';
import { accountForecast, monthlyReview } from '@/lib/transaction-tools';
import type { ToolsController } from '@/components/transaction-tools-panel';
import type { PlanningData } from '@/lib/planning';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatMonthYear, formatNumber } from '@/lib/format';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
export function AccountForecast({data,tools}:{data:PlanningData;tools:ToolsController}){
 const {t,locale}=useLanguage();const today=depositToday();const [through,setThrough]=useState(()=>new Date(Date.parse(today+'T00:00:00Z')+30*86400000).toISOString().slice(0,10));
 const forecast=accountForecast(data.records,data.occurrences,tools.data.assignments,today,through);
 const schedules=data.records.filter(record=>!record.source_paused&&record.frequency!=='Once'&&['Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'].includes(record.kind));
 return <section className="panel tools-panel"><div className="review-heading"><div><h2>{t('Account balance forecast')}</h2><p className="muted">{t('A projection from current cash and unpaid recurring schedules. Overdue items are included today. Budgets, unscheduled costs and maturity reminders are excluded. No money moves automatically.')}</p></div><label>{t('Forecast through')}<DatePicker value={through} min={today} onChange={setThrough}/></label></div>
 {tools.error&&<p className="error" role="alert">{t(tools.error)} <Button onClick={tools.retry}>{t('Retry')}</Button></p>}
 {!tools.loading&&!tools.error&&<><div className="review-grid">{forecast.accounts.map(item=><article key={item.account.id}><h3>{item.account.name}</h3><p>{t('Current balance')}: {formatMoney(item.current,item.account.currency,locale)}</p><strong className={item.lowest<0?'negative':''}>{formatMoney(item.ending,item.account.currency,locale)}</strong><p>{t('Lowest projected balance')}: {formatMoney(item.lowest,item.account.currency,locale)}</p>{item.lowest<0&&<p role="status">{t('A payment may exceed the available balance.')}</p>}<details><summary>{t('Projected activity')}</summary><ol className="tool-list">{item.events.map(event=><li key={event.key}><span>{formatDate(event.date,locale)} · {event.name}{event.overdue&&` · ${t('Overdue')}`}</span><span>{formatMoney(event.amount,item.account.currency,locale)} → {formatMoney(event.balance,item.account.currency,locale)}</span></li>)}</ol></details></article>)}</div>
 {!!forecast.unassigned.length&&<p className="partial-total" role="status">{t('{count} payments are not assigned to an account and are excluded.',{count:formatNumber(forecast.unassigned.length,locale,0)})}</p>}
 <details open={forecast.unassigned.length>0}><summary>{t('Assign schedules to cash accounts')}</summary><p className="muted">{t('Choose any cash account. Cross-currency forecasts use the rate saved with the assignment. Actual payments use their payment-date rate.')}</p><div className="review-grid">{schedules.map(record=><ForecastAccountAssignment key={record.id+':'+(tools.data.assignments.find(item=>item.record_id===record.id)?.account_id??'')} record={record} accounts={data.records.filter(account=>account.kind==='Cash')} assignment={tools.data.assignments.find(item=>item.record_id===record.id)} today={today} tools={tools}/>)}</div></details></>}
 {!forecast.accounts.length&&<Link href="/accounts">{t('Add account')}</Link>}
 </section>;
}
export function MonthlyReview({data,tools,snapshots,historyError,currency,market}:{data:PlanningData;tools:ToolsController;snapshots:PortfolioSnapshot[];historyError:string;currency:string;market?:MarketData|null}){
 const {t,locale}=useLanguage();
 const today=depositToday();
 const [month,setMonth]=useState(()=>today.slice(0,7));
 const result=monthlyReview(data.records,tools.data.splits,snapshots,month,currency,today,data.activity,market?.rates??market?.fx?.rate,data.investmentLinks);
 const priorDate=new Date(month+'-01T00:00:00Z');priorDate.setUTCMonth(priorDate.getUTCMonth()-1);
 const previous=monthlyReview(data.records,tools.data.splits,snapshots,priorDate.toISOString().slice(0,7),currency,today,data.activity,market?.rates??market?.fx?.rate,data.investmentLinks);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
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
  <div className="review-grid monthly-review-metrics">{[
   {label:'Income received',value:result.received,previous:previous.received},
   {label:'Actual spending',value:result.spent,previous:previous.spent},
   {label:'Income minus expenses',value:result.saved,previous:previous.saved},
  ].map(item=><article key={item.label}><h3>{t(item.label)}</h3><strong className={item.value<0?'negative':undefined}>{money(item.value)}</strong><p className="muted">{t('Previous month')}: {money(item.previous)}</p></article>)}</div>
  {!!(result.missing+previous.missing)&&<p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  <div className="monthly-review-net-worth"><strong>{t('Net-worth change')}: {historyError||result.netWorthChange===null?'—':money(result.netWorthChange)}</strong><p className="muted">{historyError?t('Net-worth history could not be loaded.'):result.netWorthChange!==null?t('Observed between {from} and {to}',{from:formatDate(result.from!,locale),to:formatDate(result.to!,locale)}):t('Two recorded balances are needed to show a change.')}</p></div>

 </section>;
}
