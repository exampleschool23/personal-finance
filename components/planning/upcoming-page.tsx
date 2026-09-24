"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/date-picker';
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
 return <><div className="page-heading"><div><h1>{t('Upcoming payments')}</h1><p className="muted">{t('Unpaid schedules, debt due dates and deposit maturities. Reminders appear here when you open the app.')}</p></div><label>{t('Show through')}<DatePicker value={through} min={today} onChange={setThrough}/></label></div>
 {error&&<p className="error" role="alert">{t(error)}</p>}
 <div className="upcoming-sections">{sections.map(section=>{
  const totals=new Map<string,number>();
  for(const item of section.items)totals.set(item.record.currency,(totals.get(item.record.currency)??0)+Number(item.record.amount));
  return <section className="panel upcoming-section" key={section.key} aria-labelledby={`upcoming-${section.key}`}>
   <header className="upcoming-section-heading"><div><h2 id={`upcoming-${section.key}`}>{t(section.title)}</h2><p className="muted">{t('Overdue')}: {formatNumber(section.items.filter(item=>item.overdue).length,locale,0)}</p></div>
    {section.summarize&&totals.size>0&&<div className="upcoming-totals"><p className="muted">{t('Total unpaid through selected date')}</p><div>{[...totals].map(([currency,amount])=><strong key={currency}>{formatMoney(amount,currency,locale)} <small>{currency}</small></strong>)}</div></div>}
   </header>
 <div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Name')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead><tbody>{section.items.map(item=><tr key={item.key}><td>{formatDate(item.date,locale)}</td><td>{item.record.name}<small className="block">{t(item.record.kind)}</small></td><td>{formatMoney(item.record.amount,item.record.currency,locale)}</td><td className={item.overdue?'negative':''}>{t(item.overdue?'Overdue':'Upcoming')}</td><td>{item.type==='maturity'?<Button disabled={busy||item.date>today} variant="outline" onClick={async()=>{setBusy(true);try{await save('dismiss',{id:crypto.randomUUID(),target_id:item.record.id,date:item.date});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t('Dismiss reminder')}</Button>:<Button disabled={item.date>today} variant="outline" onClick={()=>setOperation({action:item.type==='scheduled'?'occurrence':item.record.kind==='Mortgage'?'mortgage':'repayment',target_id:item.record.id,date:item.type==='scheduled'?item.date:today,amount:item.type==='scheduled'?item.record.amount:0})}>{t('Record payment')}</Button>}{item.type==='scheduled'&&<Button disabled={busy} variant="ghost" onClick={async()=>{setBusy(true);setError('');try{await save('exception',{target_id:item.record.id,date:item.date,skip:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t('Skip this occurrence')}</Button>}</td></tr>)}</tbody></table></div>{!section.items.length&&<p className="muted">{t('No unpaid items in this period.')}</p>}
 </section>;
 })}</div>
 <details className="panel tools-panel"><summary>{t('Skipped occurrences')}</summary><ul className="tool-list">{data.occurrences.filter(o=>o.status==='dismissed'&&data.records.some(r=>r.id===o.record_id&&r.frequency!=='Once')).map(o=><li key={o.id}><span>{data.records.find(r=>r.id===o.record_id)?.name} · {formatDate(o.due_on,locale)}</span><Button disabled={busy} variant="outline" onClick={async()=>{setBusy(true);setError('');try{await save('exception',{target_id:o.record_id,date:o.due_on,skip:false});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t('Restore occurrence')}</Button></li>)}</ul></details>
 <p className="muted upcoming-note">{t('A reminder never moves money. Record a payment only after it happens. Debt amounts show the outstanding balance; enter the actual principal and interest when paying.')}</p>
 {operation&&<AccountOperation operation={operation} records={data.records} save={save} onClose={()=>setOperation(null)}/>}</>;
}
