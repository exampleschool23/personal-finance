"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/date-picker';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { upcomingPayments,type PlanningData } from '@/lib/planning';
import { AccountOperation,type Operation } from './account-operation';
export function UpcomingPage({data,save}:{data:PlanningData;save:(action:string,data:unknown)=>Promise<void>}){
 const {t,locale}=useLanguage(),today=depositToday();const [operation,setOperation]=useState<Operation|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [through,setThrough]=useState(()=>new Date(Date.parse(today+'T00:00:00Z')+31*86400000).toISOString().slice(0,10));
 const due=upcomingPayments(data.records,data.occurrences,today,through);
 return <><div className="page-heading"><div><h1>{t('Upcoming payments')}</h1><p className="muted">{t('Unpaid schedules, debt due dates and deposit maturities. Reminders appear here when you open the app.')}</p></div><label>{t('Show through')}<DatePicker value={through} min={today} onChange={setThrough}/></label></div>
 <div className="panel"><p role="status">{t('Overdue')}: {formatNumber(due.filter(d=>d.overdue).length,locale,0)}</p>{error&&<p className="error" role="alert">{t(error)}</p>}
 <div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Name')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead><tbody>{due.map(item=><tr key={item.key}><td>{formatDate(item.date,locale)}</td><td>{item.record.name}<small className="block">{t(item.record.kind)}</small></td><td>{formatMoney(item.record.amount,item.record.currency,locale)}</td><td className={item.overdue?'negative':''}>{t(item.overdue?'Overdue':'Upcoming')}</td><td>{item.type==='maturity'?<Button disabled={busy||item.date>today} variant="outline" onClick={async()=>{setBusy(true);try{await save('dismiss',{id:crypto.randomUUID(),target_id:item.record.id,date:item.date});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t('Dismiss reminder')}</Button>:<Button disabled={item.date>today} variant="outline" onClick={()=>setOperation({action:item.type==='scheduled'?'occurrence':item.record.kind==='Mortgage'?'mortgage':'repayment',target_id:item.record.id,date:item.type==='scheduled'?item.date:today,amount:item.type==='scheduled'?item.record.amount:0})}>{t('Record payment')}</Button>}</td></tr>)}</tbody></table></div>{!due.length&&<p className="muted">{t('No unpaid items in this period.')}</p>}
 <p className="muted">{t('A reminder never moves money. Record a payment only after it happens. Debt amounts show the outstanding balance; enter the actual principal and interest when paying.')}</p></div>
 {operation&&<AccountOperation operation={operation} records={data.records} save={save} onClose={()=>setOperation(null)}/>}</>;
}
