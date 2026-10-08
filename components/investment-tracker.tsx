"use client";
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { showDeleted, showSaved } from '@/lib/feedback';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useDraftDialog } from '@/components/discard-changes';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { ExchangeRatePreview } from '@/components/presentation-foundation/exchange-rate-preview';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NativeSelect } from '@/components/ui/native-select';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatAccountOption, formatMoney, formatDate, formatMonthYear } from '@/lib/format';
import { chartAxis, chartDot, chartGrid, chartHeight, chartLegend, chartLine, chartMargin, chartTooltip, chartValueAxis, leadLine } from '@/components/presentation-foundation/chart';
import { historyCashDelta, historySeries, historyChartDate, historyEventLabel, historyUpdateTypes, isLendingKind, type HistoryUpdateType, type HistoryEvent } from '@/lib/investment-history';
import { depositInterest, depositProjection, depositToday } from '@/lib/deposit-interest';
import { AssetMovementDialog, type MovementDraft } from '@/components/planning/asset-movement-dialog';
import type { AssetMovement } from '@/lib/asset-movements';
import { interestCompounding, interestKinds, valuedKinds, type Entry } from '@/lib/finance';
import { categoryColor } from '@/lib/category-colors';
import { requestJson, type RequestError } from '@/lib/api-client';

type Draft={exchange_rate?:number;account_id?:string;id:string;record_id:string;type:HistoryUpdateType;date:string;amount:number;balance:number|null;notes:string};
export function InvestmentTracker({inline=false,onDraftState,initialType,record,accounts=[],accountsReady=true,onClose,onSaved,onPayment}:{inline?:boolean;onDraftState?:(dirty:boolean,busy:boolean)=>void;initialType?:HistoryUpdateType;accounts?:Entry[];accountsReady?:boolean;record:Entry;onClose:()=>void;onSaved:()=>void;onPayment:()=>void}){
 const {t,locale}=useLanguage();
 const [events,setEvents]=useState<HistoryEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[reload,setReload]=useState(0);
 const [deleting,setDeleting]=useState<HistoryEvent|null>(null);
 async function deleteUpdate(){
  if(!deleting||busy)return;setBusy(true);setError('');
  try{
   await requestJson('/api/investment-history',{method:'DELETE',body:{id:deleting.id,record_id:record.id}});
   setDeleting(null);setLoading(true);setReload(n=>n+1);onSaved();showDeleted();
  }catch(reason){setError((reason as Error).message);setDeleting(null);}finally{setBusy(false);}
 }
 const lending=isLendingKind(record.kind);
 const cash=record.kind==='Cash';
 const updateTypes=historyUpdateTypes(record.kind);
 const makeDraft=():Draft=>({id:crypto.randomUUID(),record_id:record.id,type:initialType&&updateTypes.includes(initialType)?initialType:updateTypes[0],date:depositToday(),amount:0,balance:lending||initialType==='contribution'||initialType==='withdrawal'?null:0,notes:''});
 const [draft,setDraft]=useState<Draft>(makeDraft);
 // A blank value field reads as zero; saving it would silently wipe the asset's value.
 const [balanceBlank,setBalanceBlank]=useState(true);
 const guard=useDraftDialog(draft,onClose,busy);
 // Each reset draws a new idempotency id; it is not a user edit.
 const draftContent=(value:Draft)=>JSON.stringify({...value,id:undefined});
 const [initialDraft]=useState(()=>draftContent(draft));
 const dirty=draftContent(draft)!==initialDraft;
 useEffect(()=>{onDraftState?.(dirty,busy);},[dirty,busy,onDraftState]);
 const [movement,setMovement]=useState<MovementDraft|null>(null);
 // Mirrors delete_tracker_update: asset value/cash updates, and lending additions or repayments.
 const deletableUpdate=(type:string)=>valuedKinds.includes(record.kind)?['valuation','contribution','withdrawal'].includes(type):['Money lent','Loan','Debt'].includes(record.kind)&&['contribution','withdrawal'].includes(type);
 const mortgage=record.kind==='Mortgage';
 const deposit=interestKinds.includes(record.kind);
 const security=record.kind==='Stock'||record.kind==='Crypto';
 const projection=depositProjection(events,record.rate,undefined,interestCompounding(record));
 const movementRecords=accounts.some(account=>account.id===record.id)?accounts:[...accounts,record];
 async function saveMovement(payload:AssetMovement){
  await requestJson('/api/asset-movements',{body:payload});
  showSaved();onSaved();onClose();
 }
 const eventLabel=(type:HistoryEvent['event_type'])=>historyEventLabel(record.kind,type);
 const money=(n:number)=>formatMoney(n,record.currency,locale);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/investment-history?record='+record.id,{signal:controller.signal}).then(async r=>{const data=await r.json() as HistoryEvent[] & {error?:string};if(!r.ok)throw Error(data.error);if(!controller.signal.aborted){setEvents(data);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
  return ()=>controller.abort();
 },[record.id,reload]);
 const stats=historySeries(events);
 const optionalValuation=valuedKinds.includes(record.kind)&&['contribution','withdrawal'].includes(draft.type);
 const hasBalance=!lending&&(draft.type==='valuation'||optionalValuation&&draft.balance!==null);
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
 const canSave=!busy&&(submitted||(!loading&&!!draft.date&&draft.date<=depositToday()&&updateTypes.includes(draft.type)&&(draft.type==='valuation'||draft.amount>0)&&(!hasBalance||!balanceBlank)&&(draft.type==='valuation'||(accountsReady&&!!selectedAccount&&cashAfter!==null&&cashAfter>=0&&cashAfter<=1e15))&&(!lending||(accountsReady&&!!selectedAccount&&draft.date>=latestBalanceDate&&remainingBalance>=0&&remainingBalance<=1e15))));
 async function save(event?:React.FormEvent){
  event?.preventDefault();if(!canSave)return;setBusy(true);setSubmitted(true);setError('');
  try{
   const payload=submitted?draft:{...draft,...(crossCurrency?{exchange_rate:fx.rate!}:{})};
   setDraft(payload);
   await requestJson(payload.exchange_rate!==undefined?'/api/investment-history/exchange':'/api/investment-history',{body:payload});
   showSaved();setDraft(makeDraft());setBalanceBlank(true);setSubmitted(false);setLoading(true);setReload(n=>n+1);onSaved();if(inline)onClose();
  }catch(e){if((e as RequestError).confirmedFailure){setSubmitted(false);if(crossCurrency)fx.retry();}setError((e as Error).message);}finally{setBusy(false);}
 }
 const paymentFields=<div className="record-form">
   {!inline&&<h3>{t('Add a dated update')}</h3>}{inline&&<p className="muted">{t('Enter any amount up to the outstanding balance. You can repay the rest later.')}</p>}
   <fieldset disabled={busy||submitted||loading} className="tracker-fields">
    <div className="form-grid">{!inline&&<label>{t('Update type')}<NativeSelect value={draft.type} onChange={e=>{const type=e.target.value as Draft['type'];setBalanceBlank(true);setDraft({...draft,type,account_id:undefined,exchange_rate:undefined,amount:0,balance:!lending&&type==='valuation'?0:null});}}>
     {updateTypes.map(type=><option key={type} value={type}>{t(eventLabel(type))}</option>)}
    </NativeSelect></label>}<label>{t(inline?'Payment date':'Date')}<DatePicker value={draft.date} min={lending?latestBalanceDate:undefined} max={depositToday()} onChange={date=>setDraft({...draft,date,exchange_rate:undefined})}/></label></div>
    {optionalValuation&&<div className="tracker-value-choice"><span className="tracker-value-label">{t('Asset value')}</span><ToggleGroup type="single" aria-label={t('Asset value')} value={draft.balance===null?'keep':'change'} disabled={busy||submitted||loading} onValueChange={choice=>{if(choice&&choice!==(draft.balance===null?'keep':'change')){setBalanceBlank(true);setDraft({...draft,balance:choice==='change'?0:null});}}}><ToggleGroupItem value="keep">{t('Keep current value')}</ToggleGroupItem><ToggleGroupItem value="change">{t('Enter new value')}</ToggleGroupItem></ToggleGroup>{draft.balance===null&&<small className="muted">{t('The asset value stays unchanged. Only the cash movement is recorded.')}</small>}</div>}
    {hasBalance&&<label>{t(deposit||cash?'Account balance after update':'Full asset value after update')}<FormattedNumberInput value={draft.balance??0} requireEntry onValueChange={(balance,blank)=>{setBalanceBlank(blank);setDraft({...draft,balance});}}/><small className="muted">{t('Enter 0 only when the asset is worth nothing.')}</small></label>}
    {draft.type!=='valuation'&&<label>{t(lending?(cashOutgoing?'Pay from cash account':'Receive into cash account'):'Cash account')}<NativeSelect required disabled={!accountsReady} value={draft.account_id??''} onChange={e=>setDraft({...draft,account_id:e.target.value||undefined,exchange_rate:undefined})}><option value="" disabled>{t('Choose a cash account')}</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{formatAccountOption(a,locale)}</option>)}</NativeSelect>{accountsReady&&!cashAccounts.length&&<small>{t('Add a cash account to record this transaction.')}</small>}{!accountsReady&&<small>{t('Waiting for current cash account balances.')}</small>}</label>}{draft.type!=='valuation'&&<label>{t(lending?'Principal amount':'Cash amount (your share)')} · {record.currency}<FormattedNumberInput value={draft.amount} max={lending&&draft.type==='withdrawal'?currentBalance:1e15} onValueChange={amount=>setDraft({...draft,amount})}/></label>}
    {crossCurrency&&<ExchangeRatePreview fx={fx}/>}
    {selectedAccount&&cashOutgoing&&fx.rate&&<p className="muted">{t('Available for this payment')}: {money(Number(selectedAccount.amount)*fx.rate)}</p>}
    {lending&&<p aria-live="polite">{t('Outstanding balance after update')}: {money(remainingBalance)}</p>}
    {selectedAccount&&cashAfter!==null&&cashDelta!==null&&draft.type!=='valuation'&&<div className="ownership-summary" aria-live="polite"><p>{t(cashOutgoing?'Cash deducted from {account}: {amount}':'Cash added to {account}: {amount}',{account:selectedAccount.name,amount:accountMoney(Math.abs(cashDelta))})}</p><p>{t('Cash balance after update')}: {accountMoney(cashAfter!)}</p>{cashAfter!<0&&<InlineError message={t('Not enough money in the selected cash account.')}/>}</div>}
    <label>{t('Notes (optional)')}<textarea rows={2} maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
   </fieldset>
   {deposit&&<p className="muted tracker-help">{t('Use Top-up or Withdraw to move money between accounts. Use Record capitalized interest when interest stays in the deposit; Income received is for interest paid out.')}</p>}
   <p className="muted tracker-help">{t(lending?'Select the cash account used for this transaction. The cash balance and outstanding principal change together; principal is not income or an expense.':cash?'Use Balance update to confirm a cash balance, or Transfer money to move funds between accounts.':security?'Use Value update for a valuation, Buy or Sell / convert for trades, and income or expenses for actual cash payments.':deposit?'Use Balance update for a confirmed bank balance. Record paid-out interest and fees separately.':'Use Value update for a valuation. Record invested money, sale proceeds, income and expenses separately.')}</p>
   <p className="muted tracker-help">{t(lending?'Enter updates on or after the latest balance date. Repayments cannot exceed the outstanding balance.':record.kind==='Business'?'Past valuations do not replace a newer balance. Business valuations use the current ownership share.':'Past valuations do not replace a newer balance.')}</p>
   <ErrorPopup message={error}/>
   {submitted&&<p className="muted tracker-help">{t('Retry with the same details to avoid duplicates.')}</p>}
   <FormFooter busy={busy} onCancel={guard.close} cancelLabel={t('Close')}><Button type="button" onClick={()=>void save()} disabled={!canSave}>{t(busy?'Saving…':submitted?'Retry update':inline?'Save payment':'Save update')}</Button></FormFooter>
  </div>;
 if(inline)return <>{paymentFields}{guard.confirmation}</>;
 if(movement)return <AssetMovementDialog initial={movement} records={movementRecords} save={saveMovement} onClose={()=>setMovement(null)}/>;
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog investment-tracker" showCloseButton={!busy}>
  <DialogTitle>{record.name} · {t('Tracker')}</DialogTitle>
  <DialogDescription>{t(lending?'Track additions and repayments against the outstanding balance.':cash?'Track your cash balance and transfers between accounts.':'Dated values and actual cash movements. Estimates stay separate.')}</DialogDescription>
  {loading?<LoadingPlaceholder label={t('Loading history…')}/>:<>
   {deposit&&<div className="ownership-summary"><p>{t('Estimated interest for {month}: {amount}', {month:formatMonthYear(depositToday().slice(0,7),locale),amount:money(depositInterest(events,record.rate,undefined,interestCompounding(record)))})}</p><p>{t('Estimated balance including interest')}: {money(projection.total)}</p><p className="muted">{t(({monthly:'Monthly compounding',daily:'Daily compounding',none:'No compounding'})[record.deposit_compounding??'monthly'])}. {t('Top-ups and withdrawals affect interest from their recorded date. Estimates use the current annual rate. A confirmed balance or interest credit replaces the projection.')}</p><p className="muted">{t('Estimates start at the first dated balance. Record confirmed capitalized interest to update the available balance. Projections are not spendable cash.')}</p></div>}
   <div className="tracker-metrics">
    <div><small>{t(lending?(record.kind==='Money lent'?'Amount owed to you':'Outstanding balance'):cash||deposit?'Account balance':'Latest tracked value (your share)')}</small><strong>{stats.balance===null?'—':money(stats.balance)}</strong></div>
    {!cash&&<div><small>{t(mortgage?'Principal repaid':lending?'Repayments recorded':'Income received')}</small><strong>{money(mortgage?stats.principal:lending?stats.repayments:stats.receipts)}</strong></div>}
    {!cash&&<div><small>{t(mortgage?'Interest paid':lending?'Additions recorded':'Expense paid')}</small><strong>{money(mortgage?stats.interest:lending?stats.additions:stats.expenses)}</strong></div>}
   </div>
   {stats.points.length>0&&<div className="tracker-chart" aria-label={t('Investment history chart')}>
    <ResponsiveContainer width="100%" height={chartHeight.regular}><LineChart data={stats.points} margin={chartMargin} accessibilityLayer>
     <CartesianGrid {...chartGrid}/>
     <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={80} {...chartAxis}/>
     <YAxis tickFormatter={money} {...chartValueAxis}/>
     <Tooltip {...chartTooltip} labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={v=>money(Number(v))}/>
     <Legend {...chartLegend}/>
     <Line type="linear" dataKey="balance" name={t(lending?(record.kind==='Money lent'?'Amount owed to you':'Outstanding balance'):cash||deposit?'Account balance':'Value (your share)')} {...leadLine} dot={chartDot} connectNulls={false}/>
     {!lending&&!cash&&<Line type="stepAfter" dataKey="contributions" name={t('Net contributions recorded')} {...chartLine} stroke={categoryColor('Property')} strokeDasharray="5 4"/>}
     {!lending&&!cash&&<Line type="stepAfter" dataKey="receipts" name={t('Income received')} {...chartLine} stroke={categoryColor('Deposit')}/>}
    </LineChart></ResponsiveContainer>
   </div>}
   <p className="muted tracker-help">{t(lending?'History starts with a balance snapshot. Additions increase the balance; principal repayments reduce it.':cash?'History shows confirmed balances and account movements.':'History starts with a current snapshot. Add older values and contributions if known. Recorded contributions are not a complete purchase cost unless you enter them all.')}</p>
  </>}
  {cash&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setMovement({kind:'transfer',source_id:record.id})}>{t('Transfer money')}</Button>}
  {(deposit||security)&&<div className="entry-actions"><Button variant="outline" onClick={()=>setMovement({kind:deposit?'transfer':'buy',target_id:record.id})}>{t(deposit?'Top-up':'Buy')}</Button><Button variant="outline" onClick={()=>setMovement({kind:deposit?'transfer':'sell',source_id:record.id})}>{t(deposit?'Withdraw':'Sell / convert')}</Button>{deposit&&<Button variant="outline" onClick={()=>setMovement({kind:'interest',source_id:record.id})}>{t('Record capitalized interest')}</Button>}</div>}
  {mortgage&&<Button type="button" variant="outline" disabled={busy} onClick={onPayment}>{t('Record payment')}</Button>}
  {paymentFields}
  <div className="tracker-history"><h3>{t('History')}</h3>{(valuedKinds.includes(record.kind)||lending)&&<p className="muted">{t('Delete newer balance updates first. Starting snapshots and other transaction types are protected.')}</p>}{!events.length&&!loading&&<p>{t('No history yet.')}</p>}
   <ul>{[...events].reverse().map(e=><li key={e.id}><div><strong>{t(eventLabel(e.event_type))}</strong><time>{formatDate(e.occurred_on,locale)}</time>{e.notes&&<p>{e.notes}</p>}{e.account_link&&<small>{t(Number(e.account_link.amount)<0?'Cash deducted from {account}: {amount}':'Cash added to {account}: {amount}',{account:accounts.find(account=>account.id===e.account_link?.account_id)?.name??t('Cash account'),amount:formatMoney(Math.abs(Number(e.account_link.amount)),e.account_link.account_currency??record.currency,locale)})}</small>}</div><div>{e.balance!==null&&<strong>{money(Number(e.balance)*Number(e.ownership_percentage)/100)}</strong>}{e.amount>0&&<span>{t(lending&&['contribution','withdrawal'].includes(e.event_type)?'Principal amount':'Cash amount (your share)')}: {money(Number(e.amount))}</span>}{e.event_type==='mortgage_payment'&&<small>{t('Principal repayment')}: {money(Number(e.principal))} · {t('Interest paid')}: {money(Number(e.interest))}</small>}{deletableUpdate(e.event_type)&&<DeleteButton disabled={busy||loading||submitted||dirty} label={t('Delete update')} onClick={()=>setDeleting(e)}/>}</div></li>)}</ul>
  </div>
 </DialogContent></Dialog>{guard.confirmation}<ConfirmDialog deletes open={!!deleting} onClose={()=>setDeleting(null)} busy={busy} title={t('Delete this tracker update?')} description={<>{t('This removes the update. If it changed the asset value, the previous value and ownership are restored. Any linked cash movement is reversed using its original amount. This cannot be undone from the app.')}{deleting&&<> {t(eventLabel(deleting.event_type))} · {formatDate(deleting.occurred_on,locale)}{deleting.amount>0&&<> · {money(Number(deleting.amount))}</>}</>}</>} confirmLabel={t(busy?'Deleting…':'Delete update')} onConfirm={()=>void deleteUpdate()}/></>;
}
