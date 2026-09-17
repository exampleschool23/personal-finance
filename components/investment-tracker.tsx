"use client";
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatDate, formatMonthYear } from '@/lib/format';
import { historySeries, historyChartDate, historyLabels, type HistoryEvent } from '@/lib/investment-history';
import { depositInterest, depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';

type Draft={id:string;record_id:string;type:'valuation'|'contribution'|'withdrawal'|'income'|'expense';date:string;amount:number;balance:number|null;notes:string};
export function InvestmentTracker({record,onClose,onSaved,onPayment}:{record:Entry;onClose:()=>void;onSaved:()=>void;onPayment:()=>void}){
 const {t,locale}=useLanguage();
 const [events,setEvents]=useState<HistoryEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[reload,setReload]=useState(0);
 const makeDraft=():Draft=>({id:crypto.randomUUID(),record_id:record.id,type:'valuation',date:depositToday(),amount:0,balance:0,notes:''});
 const [draft,setDraft]=useState<Draft>(makeDraft);
 const mortgage=record.kind==='Mortgage';
 const deposit=record.kind==='Deposit';
 const money=(n:number)=>formatMoney(n,record.currency,locale);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/investment-history?record='+record.id,{signal:controller.signal}).then(async r=>{const data=await r.json() as HistoryEvent[] & {error?:string};if(!r.ok)throw Error(data.error);if(!controller.signal.aborted){setEvents(data);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
  return ()=>controller.abort();
 },[record.id,reload]);
 const stats=historySeries(events);
 const hasBalance=['valuation','contribution','withdrawal'].includes(draft.type);
 const canSave=!loading&&!busy&&!!draft.date&&draft.date<=depositToday()&&(draft.type==='valuation'||draft.amount>0);
 async function save(event:React.FormEvent){
  event.preventDefault();if(!canSave)return;setBusy(true);setSubmitted(true);setError('');
  try{
   const response=await fetch('/api/investment-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
   const result=await response.json() as {error?:string};if(!response.ok){if(response.status>=400&&response.status<500)setSubmitted(false);throw Error(result.error);}
   setDraft(makeDraft());setSubmitted(false);setLoading(true);setReload(n=>n+1);onSaved();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="record-dialog investment-tracker" showCloseButton={!busy}>
  <DialogTitle>{record.name} · {t('Tracker')}</DialogTitle>
  <DialogDescription>{t('Dated values and actual cash movements. Estimates stay separate.')}</DialogDescription>
  {loading?<LoadingPlaceholder label={t('Loading history…')}/>:<>
   {deposit&&<div className="ownership-summary"><p>{t('Estimated interest for {month}: {amount}', {month:formatMonthYear(depositToday().slice(0,7),locale),amount:money(depositInterest(events,record.rate))})}</p><p className="muted">{t('Annual rate divided by twelve, weighted by days at each recorded balance. The latest balance continues to month-end. No compounding; changing the rate recalculates the whole month.')}</p><p className="muted">{t('Estimates start at the first dated balance. Add an earlier Value update if this account was already open. Interest is not automatically added to your balance.')}</p></div>}
   <div className="tracker-metrics">
    <div><small>{t(mortgage?'Outstanding balance':'Latest tracked value (your share)')}</small><strong>{stats.balance===null?'—':money(stats.balance)}</strong></div>
    <div><small>{t(mortgage?'Principal repaid':'Income received')}</small><strong>{money(mortgage?stats.principal:stats.receipts)}</strong></div>
    <div><small>{t(mortgage?'Interest paid':'Expense paid')}</small><strong>{money(mortgage?stats.interest:stats.expenses)}</strong></div>
   </div>
   {stats.points.length>0&&<div className="tracker-chart" aria-label={t('Investment history chart')}>
    <ResponsiveContainer width="100%" height={270}><LineChart data={stats.points} margin={{top:12,right:18,bottom:12,left:18}} accessibilityLayer>
     <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
     <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={60} tick={{fontSize:11}}/>
     <YAxis width={105} tickFormatter={money} tick={{fontSize:11}}/>
     <Tooltip labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={v=>money(Number(v))} contentStyle={{background:'var(--background)',borderColor:'var(--border)',borderRadius:10}}/>
     <Legend/>
     <Line type="linear" dataKey="balance" name={t(mortgage?'Outstanding balance':'Value (your share)')} stroke="var(--primary)" strokeWidth={2} dot={{r:3}} connectNulls={false}/>
     {!mortgage&&<Line type="stepAfter" dataKey="contributions" name={t('Net contributions recorded')} stroke="#8b5cf6" strokeDasharray="5 4" dot={false}/>}
     {!mortgage&&<Line type="stepAfter" dataKey="receipts" name={t('Income received')} stroke="#0d9488" dot={false}/>}
    </LineChart></ResponsiveContainer>
   </div>}
   <p className="muted tracker-help">{t('History starts with a current snapshot. Add older values and contributions if known. Recorded contributions are not a complete purchase cost unless you enter them all.')}</p>
  </>}
  {mortgage&&<Button type="button" variant="outline" disabled={busy} onClick={onPayment}>{t('Record payment')}</Button>}
  <form className="record-form" onSubmit={save}>
   <h3>{t('Add a dated update')}</h3>
   <fieldset disabled={busy||submitted||loading} className="tracker-fields">
    <div className="form-grid"><label>{t('Update type')}<NativeSelect value={draft.type} onChange={e=>{const type=e.target.value as Draft['type'];setDraft({...draft,type,amount:0,balance:['valuation','contribution','withdrawal'].includes(type)?0:null});}}>
     {(['valuation',...(!mortgage?['contribution','withdrawal','income','expense']:[])] as Draft['type'][]).map(type=><option key={type} value={type}>{t(historyLabels[type])}</option>)}
    </NativeSelect></label><label>{t('Date')}<DatePicker value={draft.date} onChange={date=>setDraft({...draft,date})}/></label></div>
    {hasBalance&&<label>{t(deposit?'Account balance after update':mortgage?'Outstanding balance after update':'Full asset value after update')}<FormattedNumberInput value={draft.balance??0} required={false} onValueChange={balance=>setDraft({...draft,balance})}/></label>}
    {draft.type!=='valuation'&&<label>{t('Cash amount (your share)')}<FormattedNumberInput value={draft.amount} onValueChange={amount=>setDraft({...draft,amount})}/></label>}
    <label>{t('Notes (optional)')}<textarea rows={2} maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
   </fieldset>
   {deposit&&<p className="muted tracker-help">{t('For a withdrawal or top-up, enter the date, cash amount and remaining account balance. The estimate changes from that date. Do not add the same interest estimate as recurring income.')}</p>}
   <p className="muted tracker-help">{t('For births or market changes, use Value update. For purchases or sales, enter the cash amount and the new total value. Income and expenses also appear as one-time records. Cash balances are not changed automatically.')}</p>
   <p className="muted tracker-help">{t('Past valuations do not replace a newer balance. Business valuations use the current ownership share. Saved history is permanent.')}</p>
   {error&&<p className="error" role="alert">{t(error)}</p>}
   {submitted&&<p className="muted tracker-help">{t('Retry with the same details to avoid duplicates.')}</p>}
   <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('Close')}</Button><Button type="submit" disabled={!canSave}>{t(busy?'Saving…':submitted?'Retry update':'Save update')}</Button></div>
  </form>
  <div className="tracker-history"><h3>{t('History')}</h3>{!events.length&&!loading&&<p>{t('No history yet.')}</p>}
   <ul>{[...events].reverse().map(e=><li key={e.id}><div><strong>{t(historyLabels[e.event_type])}</strong><time>{formatDate(e.occurred_on,locale)}</time>{e.notes&&<p>{e.notes}</p>}</div><div>{e.balance!==null&&<strong>{money(Number(e.balance)*Number(e.ownership_percentage)/100)}</strong>}{e.amount>0&&<span>{t('Cash amount (your share)')}: {money(Number(e.amount))}</span>}{e.event_type==='mortgage_payment'&&<small>{t('Principal repayment')}: {money(Number(e.principal))} · {t('Interest paid')}: {money(Number(e.interest))}</small>}</div></li>)}</ul>
  </div>
 </DialogContent></Dialog>;
}
