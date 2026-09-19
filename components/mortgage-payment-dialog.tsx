"use client";
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { ExchangeRatePreview } from '@/components/exchange-rate-preview';
import { NativeSelect } from '@/components/ui/native-select';
import { depositToday } from '@/lib/deposit-interest';
import { useDiscardChanges } from '@/components/discard-changes';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { formatMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';
export type MortgagePayment = { id: string; mortgage_id: string; principal: number; interest: number; date: string; notes: string; account_id?:string;exchange_rate?:number };
export function MortgagePaymentDialog({ mortgage, accounts = [], onClose, onSave, inline=false, onDraftState }: { inline?:boolean;onDraftState?:(dirty:boolean,busy:boolean)=>void; accounts?:Entry[]; mortgage: Entry; onClose: () => void; onSave: (payment: MortgagePayment) => Promise<void> }) {
 const { t, locale } = useLanguage();
 const [payment, setPayment] = useState<MortgagePayment>(() => ({ id: crypto.randomUUID(), mortgage_id: mortgage.id, principal: 0, interest: 0, date: depositToday(), notes: '' }));
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [submitted, setSubmitted] = useState(false);
 const money = (amount: number) => formatMoney(amount, mortgage.currency, locale);
 const selectedAccount=accounts.find(account=>account.id===payment.account_id&&account.kind==='Cash');
 const fx=useDatedExchangeRate(selectedAccount?.currency,mortgage.currency,payment.date);
 const crossCurrency=!!selectedAccount&&selectedAccount.currency!==mortgage.currency;
 const debit=fx.rate?(payment.principal+payment.interest)/fx.rate:null;
 const valid = submitted||( payment.principal <= mortgage.amount && payment.principal + payment.interest > 0 && !!payment.date && (!mortgage.opened_on||payment.date>=mortgage.opened_on)&&(!!selectedAccount&&debit!==null&&debit<=selectedAccount.amount));
 const [initialDraft]=useState(()=>JSON.stringify(payment));
 const dirty=JSON.stringify(payment)!==initialDraft;
 useEffect(()=>{onDraftState?.(dirty,busy);},[dirty,busy,onDraftState]);
 const guard=useDiscardChanges(dirty,onClose,busy);
 const submit=async () => { if (!valid || busy) return;
   setBusy(true); setSubmitted(true); setError('');
   try { const payload=submitted?payment:{...payment,...(crossCurrency?{exchange_rate:fx.rate!}:{})};setPayment(payload);await onSave(payload); onClose(); } catch (error) { setError((error as Error).message);if((error as Error & {confirmedFailure?:boolean}).confirmedFailure){setSubmitted(false);fx.retry();} } finally { setBusy(false); }
  };

 const content=<div className="record-form">
   <p className="muted">{t('Enter principal and interest from your bank statement. Only principal reduces your mortgage.')}</p>
   <fieldset disabled={busy || submitted} className="grid gap-5 border-0 p-0 m-0 min-w-0">
    <div className="form-grid"><label>{t('Principal repayment')}<FormattedNumberInput value={payment.principal} required={false} max={mortgage.amount} onValueChange={principal => setPayment({ ...payment, principal })}/></label>
    <label>{t('Interest paid')}<FormattedNumberInput value={payment.interest} required={false} onValueChange={interest => setPayment({ ...payment, interest })}/></label></div>
    <label>{t('Cash account')}<NativeSelect required value={payment.account_id??''} onChange={e=>setPayment({...payment,account_id:e.target.value||undefined,exchange_rate:undefined})}><option value="" disabled>{t('Choose a cash account')}</option>{accounts.filter(a=>a.kind==='Cash').map(a=><option key={a.id} value={a.id}>{a.name} · {formatMoney(a.amount,a.currency,locale)}</option>)}</NativeSelect></label><label>{t('Payment date')}<DatePicker value={payment.date} min={mortgage.opened_on??undefined} onChange={date => setPayment({ ...payment, date,exchange_rate:undefined })}/></label>
    {!accounts.some(account=>account.kind==='Cash')&&<p className="muted">{t('Add a cash account to record this transaction.')}</p>}
    {crossCurrency&&<ExchangeRatePreview fx={fx}/>}
    {selectedAccount&&debit!==null&&<div className="ownership-summary"><p>{t('Cash deducted from {account}: {amount}',{account:selectedAccount.name,amount:formatMoney(debit,selectedAccount.currency,locale)})}</p><p>{t('Cash balance after update')}: {formatMoney(selectedAccount.amount-debit,selectedAccount.currency,locale)}</p>{debit>selectedAccount.amount&&<p className="error">{t('Not enough money in the selected cash account.')}</p>}</div>}
    <label>{t('Notes (optional)')}<textarea rows={2} maxLength={2000} value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })}/></label>
   </fieldset>
   <div className="ownership-summary"><p>{t('Total payment: {amount}', { amount: money(payment.principal + payment.interest) })}</p><p>{t('Remaining balance: {amount}', { amount: money(mortgage.amount - payment.principal) })}</p></div>
   <p className="muted">{t('Saved once in Income & expenses. The selected cash account pays the total. Saved payments cannot be edited or deleted.')}</p>
   {error && <p className="error" role="alert">{t(error)} {t('Retry the same payment to avoid duplicates.')}</p>}
   <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy || !valid} type="button" onClick={()=>void submit()}>{t(busy ? 'Saving…' : 'Save payment')}</Button></div>
  </div>;
 if(inline)return <>{content}{guard.confirmation}</>;
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}>
  <DialogTitle>{t('Record mortgage payment')}</DialogTitle>
  <DialogDescription>{mortgage.name} · {t('Outstanding balance: {amount}',{amount:money(mortgage.amount)})}</DialogDescription>
  {content}
 </DialogContent></Dialog>{guard.confirmation}</>;
}
