"use client";
import { useState } from 'react';
import Link from 'next/link';
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
export function MonthlyReview({data,tools,snapshots,historyError,currencies,currency}:{data:PlanningData;tools:ToolsController;snapshots:PortfolioSnapshot[];historyError:string;currencies:string[];currency:string}){
 const {t,locale}=useLanguage();const today=depositToday();const [date,setDate]=useState(today),[selected,setSelected]=useState(currency);const month=date.slice(0,7);const result=monthlyReview(data.records,tools.data.splits,snapshots,month,selected,today);
 const priorDate=new Date(month+'-01T00:00:00Z');priorDate.setUTCMonth(priorDate.getUTCMonth()-1);const previous=monthlyReview(data.records,tools.data.splits,snapshots,priorDate.toISOString().slice(0,7),selected,today);
 const money=(amount:number)=>formatMoney(amount,selected,locale);
 return <section className="panel tools-panel"><div className="review-heading"><div><h2>{t('Monthly review')} · {formatMonthYear(month,locale)}</h2><p className="muted">{t('Actual transactions in the selected currency only. Recurring plans are excluded. Savings means income minus expenses; principal repayments are not expenses.')}</p></div><div className="inline-tool-form"><label>{t('Month')}<DatePicker value={date} max={today} onChange={setDate}/></label><label>{t('Currency')}<NativeSelect value={selected} onChange={event=>setSelected(event.target.value)}>{[...new Set([...currencies,selected,...data.records.map(record=>record.currency)])].map(code=><option key={code}>{code}</option>)}</NativeSelect></label></div></div>
 <div className="review-grid">{[{label:'Income received',value:result.received,previous:previous.received},{label:'Actual spending',value:result.spent,previous:previous.spent},{label:'Income minus expenses',value:result.saved,previous:previous.saved}].map(item=><article key={item.label}><h3>{t(item.label)}</h3><strong>{money(item.value)}</strong><p>{t('Previous month')}: {money(item.previous)}</p></article>)}<article><h3>{t('Net-worth change')}</h3><strong>{historyError?'—':result.netWorthChange===null?'—':money(result.netWorthChange)}</strong><p>{!historyError&&result.netWorthChange!==null?t('Observed between {from} and {to}',{from:formatDate(result.from!,locale),to:formatDate(result.to!,locale)}):t('Two recorded balances are needed to show a change.')}</p></article></div>
 <p className="muted">{t('The current month includes transactions through today; the previous month is a full month. Net-worth observations may not fall on month boundaries.')}</p>
 <details><summary>{t('Spending by category')}</summary>{tools.error?<p className="error">{t(tools.error)} <Button onClick={tools.retry}>{t('Retry')}</Button></p>:<ul className="tool-list">{result.categories.map(category=><li key={category.id}><CategoryBadge kind={category.id} label={data.categories.find(item=>item.id===category.id)?.name??t(category.id)}/><strong>{money(category.amount)}</strong></li>)}</ul>}</details>
 </section>;
}
