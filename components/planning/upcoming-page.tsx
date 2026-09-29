"use client";
import { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Count } from '@/components/presentation-foundation/count';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber } from '@/lib/format';
import { income,expenses } from '@/lib/finance';
import { depositToday } from '@/lib/deposit-interest';
import { upcomingPayments,type PlanningData } from '@/lib/planning';
import { AccountOperation,type Operation } from './account-operation';
export function UpcomingPage({data,save}:{data:PlanningData;save:(action:string,data:unknown)=>Promise<void>}){
 const {t,locale}=useLanguage(),today=depositToday();const [operation,setOperation]=useState<Operation|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [through,setThrough]=useState(()=>new Date(Date.parse(today+'T00:00:00Z')+31*86400000).toISOString().slice(0,10));
 const due=upcomingPayments(data.records,data.occurrences,today,through);
 const sections=[
  {key:'income',title:'Upcoming income',items:due.filter(item=>item.type==='scheduled'&&income.includes(item.record.kind)),summarize:true},
  {key:'expenses',title:'Upcoming expenses',items:due.filter(item=>item.type==='scheduled'&&expenses.includes(item.record.kind)),summarize:true},
  {key:'reminders',title:'Debt repayments and deposit maturities',items:due.filter(item=>item.type!=='scheduled'),summarize:false},
 ];
 const skipped=data.occurrences.filter(o=>o.status==='dismissed'&&data.records.some(r=>r.id===o.record_id&&r.frequency!=='Once'));
 return <><PageHeader title={t('Upcoming payments')} description={t('Unpaid schedules, debt due dates and deposit maturities. Reminders appear here when you open the app.')}><label>{t('Show through')}<DatePicker value={through} min={today} onChange={setThrough}/></label></PageHeader>
 <ErrorPopup message={error}/>
 <div className="upcoming-sections">{sections.map(section=>{
  const totals=new Map<string,number>();
  for(const item of section.items)totals.set(item.record.currency,(totals.get(item.record.currency)??0)+Number(item.record.amount));
  const overdue=section.items.filter(item=>item.overdue).length;
  return <section className="panel upcoming-section" key={section.key} aria-labelledby={`upcoming-${section.key}`}>
   <header className="upcoming-section-heading"><div><h2 id={`upcoming-${section.key}`}>{t(section.title)}<Count value={section.items.length}/></h2><p className={overdue?'status-badge is-overdue':'muted'}>{t('Overdue')}: {formatNumber(overdue,locale,0)}</p></div>
    {section.summarize&&totals.size>0&&<div className="upcoming-totals"><p className="muted">{t('Total unpaid through selected date')}</p><div>{[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([currency,amount])=><strong key={currency}>{formatMoney(amount,currency,locale)}</strong>)}</div></div>}
   </header>
 <div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Name')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead><tbody>{section.items.map(item=><tr key={item.key}><td>{formatDate(item.date,locale)}</td><td><div className="record-name"><div><strong>{item.record.name}</strong><small>{t(item.record.kind)}</small></div></div></td><td className="amount">{formatMoney(item.record.amount,item.record.currency,locale)}</td><td><span className={item.overdue?'status-badge is-overdue':'status-badge'}>{t(item.overdue?'Overdue':'Upcoming')}</span></td><td><div className="row-actions">{item.type==='maturity'?<Button size="sm" disabled={busy||item.date>today} variant="outline" onClick={async()=>{setBusy(true);setError('');try{await save('dismiss',{id:crypto.randomUUID(),target_id:item.record.id,date:item.date});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t('Dismiss reminder')}</Button>:<Button size="sm" disabled={item.date>today} variant="outline" onClick={()=>setOperation({action:item.type==='scheduled'?'occurrence':item.record.kind==='Mortgage'?'mortgage':'repayment',target_id:item.record.id,date:item.type==='scheduled'?item.date:today,amount:item.type==='scheduled'?item.record.amount:0})}>{t('Record payment')}</Button>}{item.type==='scheduled'&&<Button size="sm" disabled={busy} variant="ghost" onClick={async()=>{setBusy(true);setError('');try{await save('exception',{target_id:item.record.id,date:item.date,skip:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}} title={t('Skip this occurrence')} aria-label={t('Skip this occurrence')+': '+item.record.name}>{t('Skip')}</Button>}</div></td></tr>)}</tbody></table></div>{!section.items.length&&<EmptyState icon={<CalendarCheck aria-hidden="true"/>} description={t('No unpaid items in this period.')}/>}
 </section>;
 })}</div>
 <details className="panel tools-panel"><summary>{t('Skipped occurrences')}{skipped.length>0&&<Count value={skipped.length}/>}</summary><ul className="tool-list">{skipped.map(o=><li key={o.id}><span>{data.records.find(r=>r.id===o.record_id)?.name} · {formatDate(o.due_on,locale)}</span><Button size="sm" disabled={busy} variant="outline" onClick={async()=>{setBusy(true);setError('');try{await save('exception',{target_id:o.record_id,date:o.due_on,skip:false});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t('Restore occurrence')}</Button></li>)}</ul></details>
 <p className="muted upcoming-note">{t('A reminder never moves money. Record a payment only after it happens. Debt amounts show the outstanding balance; enter the actual principal and interest when paying.')}</p>
 {operation&&<AccountOperation operation={operation} records={data.records} save={save} onClose={()=>setOperation(null)}/>}</>;
}
