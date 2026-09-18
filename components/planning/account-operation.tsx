"use client";
import { ExchangeRatePreview } from '@/components/exchange-rate-preview';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { useDiscardChanges } from '@/components/discard-changes';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatMoney,formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
export type Operation = {action:'transfer'|'reconcile'|'repayment'|'mortgage'|'occurrence';account_id?:string;target_id?:string;date?:string;amount?:number};
export function AccountOperation({operation,records,save,onClose}:{operation:Operation;records:Entry[];save:(action:string,data:unknown)=>Promise<void>;onClose:()=>void}){
 const {t,locale}=useLanguage();
 const [draft,setDraft]=useState(()=>({id:crypto.randomUUID(),account_id:operation.account_id??'',target_id:operation.target_id??'',date:operation.date??depositToday(),amount:operation.action==='occurrence'?0:operation.amount??0,received:0,fee:0,notes:''}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState(false);
 const target=records.find(r=>r.id===draft.target_id),account=records.find(r=>r.id===draft.account_id);
 const accounts=records.filter(r=>r.kind==='Cash');
 const targets=records.filter(r=>r.id!==draft.account_id&&(operation.action==='transfer'?r.kind==='Cash':['Loan','Debt','Money lent','Mortgage'].includes(r.kind)));
 const title={transfer:'Transfer money',reconcile:'Reconcile balance',repayment:'Record repayment',mortgage:'Record mortgage payment',occurrence:'Record scheduled payment'}[operation.action];
 const crossCurrency=operation.action==='transfer'&&account&&target&&account.currency!==target.currency;
 const convertedPayment=['repayment','mortgage','occurrence'].includes(operation.action)&&!!account&&!!target&&account.currency!==target.currency;
 const fx=useDatedExchangeRate(convertedPayment?account?.currency:undefined,target?.currency,draft.date);
 const [initialDraft]=useState(()=>JSON.stringify(draft));
 const guard=useDiscardChanges(JSON.stringify(draft)!==initialDraft,onClose,busy);
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t(title)}</DialogTitle><DialogDescription>{t('Review the amounts before saving. Both balances update together.')}</DialogDescription>
 <form className="record-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setSubmitted(true);setError('');try{await save(operation.action,{...draft,...(convertedPayment?{exchange_rate:fx.rate}:{}),target_id:draft.target_id||null,received:operation.action==='transfer'?(crossCurrency?draft.received:draft.amount):0});onClose();}catch(e){setError((e as Error).message);if((e as Error & {confirmedFailure?:boolean}).confirmedFailure)setSubmitted(false);}finally{setBusy(false);}}}>
 <fieldset disabled={busy||submitted} className="tracker-fields">
 <label>{t('Cash account')}<NativeSelect required value={draft.account_id} onChange={e=>setDraft({...draft,account_id:e.target.value})}><option value="">{t('Select account')}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {formatMoney(a.amount,a.currency,locale)}</option>)}</NativeSelect></label>
 {operation.action==='transfer'&&<label>{t('Destination account')}<NativeSelect required value={draft.target_id} onChange={e=>setDraft({...draft,target_id:e.target.value})}><option value="">{t('Select account')}</option>{targets.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</NativeSelect></label>}
 {target&&operation.action!=='transfer'&&<p>{target.name} · {formatMoney(target.amount,target.currency,locale)}</p>}
 {operation.action==='occurrence'&&<label>{t(target&&['Salary','Rent income','Business income','Other income'].includes(target.kind)?'Amount received':'Amount paid')} {target?.currency}<FormattedNumberInput value={draft.amount} placeholder={formatNumber(target?.amount??0,locale,0)} max={1e15} onValueChange={amount=>setDraft({...draft,amount})}/></label>}
 {operation.action!=='occurrence'&&<label>{t(operation.action==='reconcile'?'Statement balance':operation.action==='transfer'?'Amount sent':'Principal repayment')} {operation.action==='repayment'||operation.action==='mortgage'?target?.currency:account?.currency}<FormattedNumberInput value={draft.amount} required={operation.action!=='reconcile'&&operation.action!=='mortgage'} onValueChange={amount=>setDraft({...draft,amount})}/></label>}
 {crossCurrency&&<><label>{t('Amount received')} {target.currency}<FormattedNumberInput value={draft.received} onValueChange={received=>setDraft({...draft,received})}/></label>{draft.amount>0&&draft.received>0&&<p>{t('Exchange rate')}: {formatNumber(draft.received/draft.amount,locale,8)} {target.currency}/{account.currency}</p>}</>}
 {['transfer','repayment','mortgage'].includes(operation.action)&&<label>{t(operation.action==='transfer'?'Transfer fee':target?.kind==='Money lent'?'Interest received':'Interest paid')} {operation.action==='repayment'||operation.action==='mortgage'?target?.currency:account?.currency}<FormattedNumberInput required={false} value={draft.fee} onValueChange={fee=>setDraft({...draft,fee})}/></label>}
 {operation.action!=='occurrence'&&operation.action!=='reconcile'&&<label>{t('Date')}<DatePicker value={draft.date} onChange={date=>setDraft({...draft,date})}/></label>}
 <label>{t('Notes (optional)')}<Input value={draft.notes} maxLength={2000} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
 </fieldset>
 {convertedPayment&&<><ExchangeRatePreview fx={fx}/>{fx.rate&&account&&<p className="muted">{t('Account amount')}: {formatMoney((operation.action==='occurrence'?draft.amount:draft.amount+draft.fee)/fx.rate,account.currency,locale)}</p>}</>}
 {operation.action==='reconcile'&&<p className="muted">{t('This records a balance correction today. It is not income or spending.')}</p>}
 {error&&<p role="alert" className="error">{t(error)}</p>}
 <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||!draft.account_id||(operation.action==='occurrence'&&draft.amount<=0)||(convertedPayment&&!fx.rate)}>{t(busy?'Saving…':submitted?'Retry':'Save')}</Button></div>
 </form></DialogContent></Dialog>{guard.confirmation}</>;
}
