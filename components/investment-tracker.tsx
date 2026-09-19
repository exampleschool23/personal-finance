"use client";
import { useDraftDialog } from '@/components/discard-changes';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { ExchangeRatePreview } from '@/components/exchange-rate-preview';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatDate, formatMonthYear } from '@/lib/format';
import { historyCashDelta, historySeries, historyChartDate, historyEventLabel, historyUpdateTypes, isLendingKind, type HistoryUpdateType, type HistoryEvent } from '@/lib/investment-history';
import { depositInterest, depositProjection, depositToday } from '@/lib/deposit-interest';
import { AssetMovementDialog, type MovementDraft } from '@/components/planning/asset-movement-dialog';
import type { AssetMovement } from '@/lib/asset-movements';
import type { Entry } from '@/lib/finance';

type Draft={exchange_rate?:number;account_id?:string;id:string;record_id:string;type:HistoryUpdateType;date:string;amount:number;balance:number|null;notes:string};
export function InvestmentTracker({inline=false,onDraftState,initialType,record,accounts=[],accountsReady=true,onClose,onSaved,onPayment}:{inline?:boolean;onDraftState?:(dirty:boolean,busy:boolean)=>void;initialType?:HistoryUpdateType;accounts?:Entry[];accountsReady?:boolean;record:Entry;onClose:()=>void;onSaved:()=>void;onPayment:()=>void}){
 const {t,locale}=useLanguage();
 const [events,setEvents]=useState<HistoryEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[reload,setReload]=useState(0);
 const [deleting,setDeleting]=useState<HistoryEvent|null>(null);
 async function deleteUpdate(){
  if(!deleting||busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/investment-history',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:deleting.id,record_id:record.id})});
   const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);
   setDeleting(null);setLoading(true);setReload(n=>n+1);onSaved();
  }catch(reason){setError((reason as Error).message);setDeleting(null);}finally{setBusy(false);}
 }
 const lending=isLendingKind(record.kind);
 const cash=record.kind==='Cash';
 const updateTypes=historyUpdateTypes(record.kind);
 const makeDraft=():Draft=>({id:crypto.randomUUID(),record_id:record.id,type:initialType&&updateTypes.includes(initialType)?initialType:updateTypes[0],date:depositToday(),amount:0,balance:lending?null:0,notes:''});
 const [draft,setDraft]=useState<Draft>(makeDraft);
 const guard=useDraftDialog(draft,onClose,busy);
 const [initialDraft]=useState(()=>JSON.stringify(draft));
 const dirty=JSON.stringify(draft)!==initialDraft;
 useEffect(()=>{onDraftState?.(dirty,busy);},[dirty,busy,onDraftState]);
 const [movement,setMovement]=useState<MovementDraft|null>(null);
 const mortgage=record.kind==='Mortgage';
 const deposit=record.kind==='Deposit';
 const security=record.kind==='Stock'||record.kind==='Crypto';
 const projection=depositProjection(events,record.rate,undefined,record.deposit_compounding);
 const movementRecords=accounts.some(account=>account.id===record.id)?accounts:[...accounts,record];
 async function saveMovement(payload:AssetMovement){
  const response=await fetch('/api/asset-movements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json() as {error?:string};
  if(!response.ok)throw Object.assign(Error(result.error),{confirmedFailure:response.status<500});
  onSaved();onClose();
 }
 const eventLabel=(type:HistoryEvent['event_type'])=>historyEventLabel(record.kind,type);
 const money=(n:number)=>formatMoney(n,record.currency,locale);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/investment-history?record='+record.id,{signal:controller.signal}).then(async r=>{const data=await r.json() as HistoryEvent[] & {error?:string};if(!r.ok)throw Error(data.error);if(!controller.signal.aborted){setEvents(data);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
  return ()=>controller.abort();
 },[record.id,reload]);
 const stats=historySeries(events);
 const hasBalance=!lending&&['valuation','contribution','withdrawal'].includes(draft.type);
 const latestBalanceDate=events.filter(event=>event.balance!==null).reduce((latest,event)=>event.occurred_on>latest?event.occurred_on:latest,'');
 const currentBalance=stats.balance??Number(record.amount);
 const remainingBalance=currentBalance+(draft.type==='withdrawal'?-draft.amount:draft.amount);
 const cashAccounts=accounts.filter(account=>account.kind==='Cash');
 const selectedAccount=cashAccounts.find(account=>account.id===draft.account_id);
 const fx=useDatedExchangeRate(selectedAccount?.currency,record.currency,draft.date);
 const crossCurrency=!!selectedAccount&&selectedAccount.currency!==record.currency;
 const cashAmount=fx.rate?draft.amount/fx.rate:null;
 const cashDelta=cashAmount===null?null:historyCashDelta(record.kind,draft.type,cashAmount);
 const accountMoney=(amount:number)=>formatMoney(amount,selectedAccount?.currency??record.currency,locale);
 const cashOutgoing=historyCashDelta(record.kind,draft.type,1)<0;
 const cashAfter=selectedAccount&&cashDelta!==null?Number(selectedAccount.amount)+cashDelta:null;
 const canSave=!busy&&(submitted||(!loading&&!!draft.date&&draft.date<=depositToday()&&updateTypes.includes(draft.type)&&(draft.type==='valuation'||draft.amount>0)&&(!draft.account_id||(accountsReady&&cashAfter!==null&&cashAfter>=0&&cashAfter<=1e15))&&(!lending||(accountsReady&&!!selectedAccount&&draft.date>=latestBalanceDate&&remainingBalance>=0&&remainingBalance<=1e15))));
 async function save(event?:React.FormEvent){
  event?.preventDefault();if(!canSave)return;setBusy(true);setSubmitted(true);setError('');
  try{
   const payload=submitted?draft:{...draft,...(crossCurrency?{exchange_rate:fx.rate!}:{})};
   setDraft(payload);
   const response=await fetch(payload.exchange_rate!==undefined?'/api/investment-history/exchange':'/api/investment-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const result=await response.json() as {error?:string};if(!response.ok){if(response.status>=400&&response.status<500){setSubmitted(false);if(crossCurrency)fx.retry();}throw Error(result.error);}
   setDraft(makeDraft());setSubmitted(false);setLoading(true);setReload(n=>n+1);onSaved();if(inline)onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const paymentFields=<div className="record-form">
   {!inline&&<h3>{t('Add a dated update')}</h3>}{inline&&<p className="muted">{t('Enter any amount up to the outstanding balance. You can repay the rest later.')}</p>}
   <fieldset disabled={busy||submitted||loading} className="tracker-fields">
    <div className="form-grid">{!inline&&<label>{t('Update type')}<NativeSelect value={draft.type} onChange={e=>{const type=e.target.value as Draft['type'];setDraft({...draft,type,account_id:undefined,exchange_rate:undefined,amount:0,balance:!lending&&['valuation','contribution','withdrawal'].includes(type)?0:null});}}>
     {updateTypes.map(type=><option key={type} value={type}>{t(eventLabel(type))}</option>)}
    </NativeSelect></label>}<label>{t(inline?'Payment date':'Date')}<DatePicker value={draft.date} min={lending?latestBalanceDate:undefined} max={depositToday()} onChange={date=>setDraft({...draft,date,exchange_rate:undefined})}/></label></div>
    {hasBalance&&<label>{t(deposit||cash?'Account balance after update':'Full asset value after update')}<FormattedNumberInput value={draft.balance??0} required={false} onValueChange={balance=>setDraft({...draft,balance})}/></label>}
    {draft.type!=='valuation'&&<label>{t(lending?(cashOutgoing?'Pay from cash account':'Receive into cash account'):'Cash account')}<NativeSelect required={lending} disabled={!accountsReady} value={draft.account_id??''} onChange={e=>setDraft({...draft,account_id:e.target.value||undefined,exchange_rate:undefined})}><option value="">{t(lending?'Select account':'No account balance change')}</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{a.name} · {formatMoney(Number(a.amount),a.currency,locale)}</option>)}</NativeSelect>{lending&&accountsReady&&!cashAccounts.length&&<small>{t('Add a cash account to record this transaction.')}</small>}{!accountsReady&&<small>{t('Waiting for current cash account balances.')}</small>}</label>}{draft.type!=='valuation'&&<label>{t(lending?'Principal amount':'Cash amount (your share)')} · {record.currency}<FormattedNumberInput value={draft.amount} max={lending&&draft.type==='withdrawal'?currentBalance:1e15} onValueChange={amount=>setDraft({...draft,amount})}/></label>}
    {crossCurrency&&<ExchangeRatePreview fx={fx}/>}
    {selectedAccount&&cashOutgoing&&fx.rate&&<p className="muted">{t('Available for this payment')}: {money(Number(selectedAccount.amount)*fx.rate)}</p>}
    {lending&&<p aria-live="polite">{t('Outstanding balance after update')}: {money(remainingBalance)}</p>}
    {selectedAccount&&cashAfter!==null&&cashDelta!==null&&draft.type!=='valuation'&&<div className="ownership-summary" aria-live="polite"><p>{t(cashOutgoing?'Cash deducted from {account}: {amount}':'Cash added to {account}: {amount}',{account:selectedAccount.name,amount:accountMoney(Math.abs(cashDelta))})}</p><p>{t('Cash balance after update')}: {accountMoney(cashAfter!)}</p>{cashAfter!<0&&<p className="error" role="alert">{t('Not enough money in the selected cash account.')}</p>}</div>}
    <label>{t('Notes (optional)')}<textarea rows={2} maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
   </fieldset>
   {deposit&&<p className="muted tracker-help">{t('Use Top-up or Withdraw to move money between accounts. Use Record capitalized interest when interest stays in the deposit; Income received is for interest paid out.')}</p>}
   <p className="muted tracker-help">{t(lending?'Select the cash account used for this transaction. The cash balance and outstanding principal change together; principal is not income or an expense.':cash?'Use Balance update to confirm a cash balance, or Transfer money to move funds between accounts.':security?'Use Value update for a valuation, Buy or Sell / convert for trades, and income or expenses for actual cash payments.':deposit?'Use Balance update for a confirmed bank balance. Record paid-out interest and fees separately.':'Use Value update for a valuation. Record invested money, sale proceeds, income and expenses separately.')}</p>
   <p className="muted tracker-help">{t(lending?'Enter updates on or after the latest balance date. Repayments cannot exceed the outstanding balance.':record.kind==='Business'?'Past valuations do not replace a newer balance. Business valuations use the current ownership share.':'Past valuations do not replace a newer balance.')}</p>
   {error&&<p className="error" role="alert">{t(error)}</p>}
   {submitted&&<p className="muted tracker-help">{t('Retry with the same details to avoid duplicates.')}</p>}
   <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Close')}</Button><Button type="button" onClick={()=>void save()} disabled={!canSave}>{t(busy?'Saving…':submitted?'Retry update':inline?'Save payment':'Save update')}</Button></div>
  </div>;
 if(inline)return <>{paymentFields}{guard.confirmation}</>;
 if(movement)return <AssetMovementDialog initial={movement} records={movementRecords} save={saveMovement} onClose={()=>setMovement(null)}/>;
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog investment-tracker" showCloseButton={!busy}>
  <DialogTitle>{record.name} · {t('Tracker')}</DialogTitle>
  <DialogDescription>{t(lending?'Track additions and repayments against the outstanding balance.':cash?'Track your cash balance and transfers between accounts.':'Dated values and actual cash movements. Estimates stay separate.')}</DialogDescription>
  {loading?<LoadingPlaceholder label={t('Loading history…')}/>:<>
   {deposit&&<div className="ownership-summary"><p>{t('Estimated interest for {month}: {amount}', {month:formatMonthYear(depositToday().slice(0,7),locale),amount:money(depositInterest(events,record.rate,undefined,record.deposit_compounding))})}</p><p>{t('Estimated balance including interest')}: {money(projection.total)}</p><p className="muted">{t(({monthly:'Monthly compounding',daily:'Daily compounding',none:'No compounding'})[record.deposit_compounding??'monthly'])}. {t('Top-ups and withdrawals affect interest from their recorded date. Estimates use the current annual rate. A confirmed balance or interest credit replaces the projection.')}</p><p className="muted">{t('Estimates start at the first dated balance. Record confirmed capitalized interest to update the available balance. Projections are not spendable cash.')}</p></div>}
   <div className="tracker-metrics">
    <div><small>{t(lending?(record.kind==='Money lent'?'Amount owed to you':'Outstanding balance'):cash||deposit?'Account balance':'Latest tracked value (your share)')}</small><strong>{stats.balance===null?'—':money(stats.balance)}</strong></div>
    {!cash&&<div><small>{t(mortgage?'Principal repaid':lending?'Repayments recorded':'Income received')}</small><strong>{money(mortgage?stats.principal:lending?stats.repayments:stats.receipts)}</strong></div>}
    {!cash&&<div><small>{t(mortgage?'Interest paid':lending?'Additions recorded':'Expense paid')}</small><strong>{money(mortgage?stats.interest:lending?stats.additions:stats.expenses)}</strong></div>}
   </div>
   {stats.points.length>0&&<div className="tracker-chart" aria-label={t('Investment history chart')}>
    <ResponsiveContainer width="100%" height={270}><LineChart data={stats.points} margin={{top:12,right:18,bottom:12,left:18}} accessibilityLayer>
     <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
     <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={80}/>
     <YAxis width={120} tickFormatter={money}/>
     <Tooltip labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={v=>money(Number(v))} contentStyle={{background:'var(--background)',borderColor:'var(--border)',borderRadius:10}}/>
     <Legend/>
     <Line type="linear" dataKey="balance" name={t(lending?(record.kind==='Money lent'?'Amount owed to you':'Outstanding balance'):cash||deposit?'Account balance':'Value (your share)')} stroke="var(--primary)" strokeWidth={2} dot={{r:3}} connectNulls={false}/>
     {!lending&&!cash&&<Line type="stepAfter" dataKey="contributions" name={t('Net contributions recorded')} stroke="#8b5cf6" strokeDasharray="5 4" dot={false}/>}
     {!lending&&!cash&&<Line type="stepAfter" dataKey="receipts" name={t('Income received')} stroke="#0d9488" dot={false}/>}
    </LineChart></ResponsiveContainer>
   </div>}
   <p className="muted tracker-help">{t(lending?'History starts with a balance snapshot. Additions increase the balance; principal repayments reduce it.':cash?'History shows confirmed balances and account movements.':'History starts with a current snapshot. Add older values and contributions if known. Recorded contributions are not a complete purchase cost unless you enter them all.')}</p>
  </>}
  {cash&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setMovement({kind:'transfer',source_id:record.id})}>{t('Transfer money')}</Button>}
  {(deposit||security)&&<div className="entry-actions"><Button variant="outline" onClick={()=>setMovement({kind:deposit?'transfer':'buy',target_id:record.id})}>{t(deposit?'Top-up':'Buy')}</Button><Button variant="outline" onClick={()=>setMovement({kind:deposit?'transfer':'sell',source_id:record.id})}>{t(deposit?'Withdraw':'Sell / convert')}</Button>{deposit&&<Button variant="outline" onClick={()=>setMovement({kind:'interest',source_id:record.id})}>{t('Record capitalized interest')}</Button>}</div>}
  {mortgage&&<Button type="button" variant="outline" disabled={busy} onClick={onPayment}>{t('Record payment')}</Button>}
  {paymentFields}
  <div className="tracker-history"><h3>{t('History')}</h3>{['Business','Property'].includes(record.kind)&&<p className="muted">{t('Delete newer balance updates first. Starting snapshots and other transaction types are protected.')}</p>}{!events.length&&!loading&&<p>{t('No history yet.')}</p>}
   <ul>{[...events].reverse().map(e=><li key={e.id}><div><strong>{t(eventLabel(e.event_type))}</strong><time>{formatDate(e.occurred_on,locale)}</time>{e.notes&&<p>{e.notes}</p>}{e.account_link&&<small>{t(Number(e.account_link.amount)<0?'Cash deducted from {account}: {amount}':'Cash added to {account}: {amount}',{account:accounts.find(account=>account.id===e.account_link?.account_id)?.name??t('Cash account'),amount:formatMoney(Math.abs(Number(e.account_link.amount)),e.account_link.account_currency??record.currency,locale)})}</small>}</div><div>{e.balance!==null&&<strong>{money(Number(e.balance)*Number(e.ownership_percentage)/100)}</strong>}{e.amount>0&&<span>{t(lending&&['contribution','withdrawal'].includes(e.event_type)?'Principal amount':'Cash amount (your share)')}: {money(Number(e.amount))}</span>}{e.event_type==='mortgage_payment'&&<small>{t('Principal repayment')}: {money(Number(e.principal))} · {t('Interest paid')}: {money(Number(e.interest))}</small>}{['Business','Property'].includes(record.kind)&&['valuation','contribution','withdrawal'].includes(e.event_type)&&<Button type="button" variant="outline" disabled={busy||loading||submitted||dirty} onClick={()=>setDeleting(e)}>{t('Delete update')}</Button>}</div></li>)}</ul>
  </div>
 </DialogContent></Dialog>{guard.confirmation}<AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!busy)setDeleting(null);}}><AlertDialogContent><AlertDialogTitle>{t('Delete this tracker update?')}</AlertDialogTitle><AlertDialogDescription>{t('This removes the update and restores the previous recorded value and ownership. Any linked cash movement is reversed using its original amount. This cannot be undone from the app.')}{deleting&&<> {t(eventLabel(deleting.event_type))} · {formatDate(deleting.occurred_on,locale)}{deleting.amount>0&&<> · {money(Number(deleting.amount))}</>}</>}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void deleteUpdate();}}>{t(busy?'Deleting…':'Delete update')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
