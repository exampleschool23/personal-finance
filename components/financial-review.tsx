"use client";
import { useState } from 'react';
import Link from 'next/link';
import { ChartNoAxesCombined, ChevronDown, Plus } from 'lucide-react';
import { categoryColor } from '@/lib/category-colors';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { DatePicker } from '@/components/date-picker';
import { CategoryBadge } from '@/components/category-badge';
import { useLanguage } from '@/components/language-provider';
import { accountForecast, monthlyReview } from '@/lib/transaction-tools';
import type { ToolsController } from '@/components/transaction-tools-panel';
import type { PlanningData } from '@/lib/planning';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatMonthYear, formatNumber } from '@/lib/format';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
export function AccountForecast({data,tools}:{data:PlanningData;tools:ToolsController}){
 const {t,locale}=useLanguage();const today=depositToday();const [through,setThrough]=useState(()=>new Date(Date.parse(today+'T00:00:00Z')+30*86400000).toISOString().slice(0,10));const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const forecast=accountForecast(data.records,data.occurrences,tools.data.assignments,today,through);
 const schedules=data.records.filter(record=>record.frequency!=='Once'&&['Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense'].includes(record.kind));
 return <section className="panel tools-panel"><div className="review-heading"><div><h2>{t('Account balance forecast')}</h2><p className="muted">{t('A projection from current cash and unpaid recurring schedules. Overdue items are included today. Budgets, unscheduled costs and maturity reminders are excluded. No money moves automatically.')}</p></div><label>{t('Forecast through')}<DatePicker value={through} min={today} onChange={setThrough}/></label></div>
 {tools.error&&<p className="error" role="alert">{t(tools.error)} <Button onClick={tools.retry}>{t('Retry')}</Button></p>}
 {!tools.loading&&!tools.error&&<><div className="review-grid">{forecast.accounts.map(item=><article key={item.account.id}><h3>{item.account.name}</h3><p>{t('Current balance')}: {formatMoney(item.current,item.account.currency,locale)}</p><strong className={item.lowest<0?'negative':''}>{formatMoney(item.ending,item.account.currency,locale)}</strong><p>{t('Lowest projected balance')}: {formatMoney(item.lowest,item.account.currency,locale)}</p>{item.lowest<0&&<p role="status">{t('A payment may exceed the available balance.')}</p>}<details><summary>{t('Projected activity')}</summary><ol className="tool-list">{item.events.map(event=><li key={event.key}><span>{formatDate(event.date,locale)} · {event.name}{event.overdue&&` · ${t('Overdue')}`}</span><span>{formatMoney(event.amount,item.account.currency,locale)} → {formatMoney(event.balance,item.account.currency,locale)}</span></li>)}</ol></details></article>)}</div>
 {!!forecast.unassigned.length&&<p className="partial-total" role="status">{t('{count} payments are not assigned to an account and are excluded.',{count:formatNumber(forecast.unassigned.length,locale,0)})}</p>}
 <details open={forecast.unassigned.length>0}><summary>{t('Assign schedules to cash accounts')}</summary><p className="muted">{t('Choose an account in the same currency. This assignment is only for forecasts; recording a payment still requires confirmation.')}</p><div className="review-grid">{schedules.map(record=><label key={record.id}>{record.name} · {record.currency}<NativeSelect disabled={busy} value={tools.data.assignments.find(item=>item.record_id===record.id)?.account_id??''} onChange={async event=>{setBusy(true);setError('');try{await tools.save('forecast',{record_id:record.id,account_id:event.target.value||null});}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}><option value="">{t('Unassigned')}</option>{data.records.filter(account=>account.kind==='Cash'&&account.currency===record.currency).map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</NativeSelect></label>)}</div></details></>}
 {!forecast.accounts.length&&<Link href="/accounts">{t('Add account')}</Link>}{error&&<p className="error" role="alert">{t(error)}</p>}
 </section>;
}
export function MonthlyReview({data,tools,snapshots,historyError,currency,onAddExpense}:{data:PlanningData;tools:ToolsController;snapshots:PortfolioSnapshot[];historyError:string;currency:string;onAddExpense?:()=>void}){
 const {t,locale}=useLanguage();
 const today=depositToday();
 const [date,setDate]=useState(today);
 const month=date.slice(0,7);
 const result=monthlyReview(data.records,tools.data.splits,snapshots,month,currency,today);
 const priorDate=new Date(month+'-01T00:00:00Z');priorDate.setUTCMonth(priorDate.getUTCMonth()-1);
 const previous=monthlyReview(data.records,tools.data.splits,snapshots,priorDate.toISOString().slice(0,7),currency,today);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 const categories=result.categories.filter(category=>category.amount>0);
 return <section className="panel tools-panel monthly-review">
  <header className="monthly-review-heading">
   <div><h2>{t('Monthly review')} · {formatMonthYear(month,locale)}</h2><p className="muted">{t('Recorded income and expenses in {currency}. Recurring plans are shown separately.',{currency})}</p></div>
   <label>{t('Month')}<DatePicker value={date} max={today} onChange={setDate}/></label>
  </header>
  <div className="review-grid monthly-review-metrics">{[
   {label:'Income received',value:result.received,previous:previous.received},
   {label:'Actual spending',value:result.spent,previous:previous.spent},
   {label:'Income minus expenses',value:result.saved,previous:previous.saved},
  ].map(item=><article key={item.label}><h3>{t(item.label)}</h3><strong className={item.value<0?'negative':undefined}>{money(item.value)}</strong><p className="muted">{t('Previous month')}: {money(item.previous)}</p></article>)}</div>
  <section className="monthly-review-categories" aria-label={t('Spending by category')}>
   <h3>{t('Spending by category')}</h3>
   {tools.error ? <div className="error" role="alert"><p>{t('Category breakdown could not be loaded. Please try again.')}</p><p>{t(tools.error)}</p><Button type="button" variant="outline" onClick={tools.retry}>{t('Retry')}</Button></div>
    : tools.loading ? <p className="muted" role="status">{t('Loading spending categories…')}</p>
    : categories.length>0 ? <ul className="monthly-category-list">{categories.map(category=><li key={category.id}>
      <div><CategoryBadge kind={category.id} label={data.categories.find(item=>item.id===category.id)?.name??t(category.id)}/><strong>{money(category.amount)}</strong></div>
      <div className="monthly-category-track" aria-hidden="true"><span style={{width:`${Math.min(100,category.amount/result.spent*100)}%`,background:categoryColor(category.id)}}/></div>
     </li>)}</ul>
    : <div className="monthly-review-empty"><ChartNoAxesCombined size={24} aria-hidden="true"/><div><strong>{t('No recorded spending this month')}</strong><p>{t('No expense transactions were recorded in {currency} for {month}. Recurring plans appear here only after a payment is recorded.',{currency,month:formatMonthYear(month,locale)})}</p>{onAddExpense&&<Button type="button" variant="outline" onClick={onAddExpense}><Plus size={16} aria-hidden="true"/>{t('Add expense')}</Button>}</div></div>}
  </section>
  <div className="monthly-review-net-worth"><strong>{t('Net-worth change')}: {historyError||result.netWorthChange===null?'—':money(result.netWorthChange)}</strong><p className="muted">{historyError?t('Net-worth history could not be loaded.'):result.netWorthChange!==null?t('Observed between {from} and {to}',{from:formatDate(result.from!,locale),to:formatDate(result.to!,locale)}):t('Two recorded balances are needed to show a change.')}</p></div>
  <details className="monthly-review-method"><summary><span>{t('How this review is calculated')}</span><ChevronDown size={16} aria-hidden="true"/></summary><p className="muted">{t('Actual transactions in the selected currency only. Recurring plans are excluded. Savings means income minus expenses; principal repayments are not expenses.')}</p><p className="muted">{t('The current month includes transactions through today; the previous month is a full month. Net-worth observations may not fall on month boundaries.')}</p></details>
 </section>;
}
