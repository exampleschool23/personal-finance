"use client";
import {FormFooter} from '@/components/presentation-foundation/form-footer';
import { ExchangeRatePreview } from '@/components/presentation-foundation/exchange-rate-preview';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { useDiscardChanges } from '@/components/discard-changes';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatAccountOption,formatMoney,formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
export type Operation = {action:'transfer'|'reconcile'|'repayment'|'mortgage'|'occurrence';account_id?:string;target_id?:string;date?:string;amount?:number;/** Another payment for an occurrence that is already recorded. */extra?:boolean};
export function AccountOperation({operation,records,save,onClose}:{operation:Operation;records:Entry[];save:(action:string,data:unknown)=>Promise<void>;onClose:()=>void}){
 const {t,locale}=useLanguage();
 // A scheduled payment starts at its scheduled amount; the person edits it when the actual differs.
 const [draft,setDraft]=useState(()=>({id:crypto.randomUUID(),account_id:operation.account_id??'',target_id:operation.target_id??'',date:operation.date??depositToday(),paid_on:operation.action==='occurrence'?[operation.date??depositToday(),depositToday()].sort()[0]:undefined as string|undefined,amount:operation.amount??(operation.action==='occurrence'?Number(records.find(r=>r.id===operation.target_id)?.amount??0):0),received:0,fee:0,notes:''}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState(false);
 // A statement balance must be typed: a blank field reads as zero and would empty the account.
 const [balanceBlank,setBalanceBlank]=useState(!(operation.amount&&operation.amount>0));
 const target=records.find(r=>r.id===draft.target_id),account=records.find(r=>r.id===draft.account_id);
 const accounts=records.filter(r=>r.kind==='Cash');
 const targets=records.filter(r=>r.id!==draft.account_id&&(operation.action==='transfer'?r.kind==='Cash':['Loan','Debt','Money lent','Mortgage'].includes(r.kind)));
 const title={transfer:'Transfer money',reconcile:'Adjust balance',repayment:'Record repayment',mortgage:'Record mortgage payment',occurrence:'Record scheduled payment'}[operation.action];
 const crossCurrency=operation.action==='transfer'&&account&&target&&account.currency!==target.currency;
 const convertedPayment=['repayment','mortgage','occurrence'].includes(operation.action)&&!!account&&!!target&&account.currency!==target.currency;
 const fx=useDatedExchangeRate(convertedPayment?account?.currency:undefined,target?.currency,draft.paid_on??draft.date);
 const [initialDraft]=useState(()=>JSON.stringify(draft));
 const guard=useDiscardChanges(JSON.stringify(draft)!==initialDraft,onClose,busy);
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t(title)}{operation.action==='reconcile'&&<InfoHint>{t('This records a balance correction today. It is not income or spending.')}</InfoHint>}</DialogTitle><DialogDescription className="sr-only">{t('Review the amounts before saving. Both balances update together.')}</DialogDescription>
 <form className="record-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setSubmitted(true);setError('');try{await save(operation.action,{...draft,...(convertedPayment?{exchange_rate:fx.rate}:{}),...(operation.extra?{extra:true}:{}),target_id:draft.target_id||null,received:operation.action==='transfer'?(crossCurrency?draft.received:draft.amount):0});onClose();}catch(e){setError((e as Error).message);if((e as Error & {confirmedFailure?:boolean}).confirmedFailure)setSubmitted(false);}finally{setBusy(false);}}}>
 <fieldset disabled={busy||submitted} className="tracker-fields">
 <label>{t('Cash account')}<NativeSelect required value={draft.account_id} onChange={e=>{
  // A statement balance belongs to one account: never carry it over to another.
  const balance=Number(records.find(r=>r.id===e.target.value)?.amount??0);
  if(operation.action==='reconcile')setBalanceBlank(!(balance>0));
  setDraft({...draft,account_id:e.target.value,...(operation.action==='reconcile'?{amount:balance}:{})});
 }}><option value="">{t('Select account')}</option>{accounts.map(a=><option key={a.id} value={a.id}>{formatAccountOption(a,locale)}</option>)}</NativeSelect></label>
 {operation.action==='transfer'&&<label>{t('Destination account')}<NativeSelect required value={draft.target_id} onChange={e=>setDraft({...draft,target_id:e.target.value})}><option value="">{t('Select account')}</option>{targets.map(a=><option key={a.id} value={a.id}>{formatAccountOption(a,locale)}</option>)}</NativeSelect></label>}
 {target&&operation.action!=='transfer'&&<p>{target.name} · {formatMoney(target.amount,target.currency,locale)}</p>}
 {operation.action==='occurrence'&&<label>{t(target&&['Salary','Rent income','Business income','Other income'].includes(target.kind)?'Amount received':'Amount paid')} {target?.currency}<FormattedNumberInput value={draft.amount} max={1e15} onValueChange={amount=>setDraft({...draft,amount})}/></label>}
 {operation.action!=='occurrence'&&<label>{t(operation.action==='reconcile'?'Statement balance':operation.action==='transfer'?'Amount sent':'Principal repayment')} {operation.action==='repayment'||operation.action==='mortgage'?target?.currency:account?.currency}<FormattedNumberInput value={draft.amount} required={operation.action!=='mortgage'} requireEntry={operation.action==='reconcile'} onValueChange={(amount,blank)=>{setBalanceBlank(blank);setDraft({...draft,amount});}}/></label>}
 {crossCurrency&&<><label>{t('Amount received')} {target.currency}<FormattedNumberInput value={draft.received} onValueChange={received=>setDraft({...draft,received})}/></label>{draft.amount>0&&draft.received>0&&<p>{t('Exchange rate')}: {formatNumber(draft.received/draft.amount,locale,8)} {target.currency}/{account.currency}</p>}</>}
 {['transfer','repayment','mortgage'].includes(operation.action)&&<label>{t(operation.action==='transfer'?'Transfer fee':target?.kind==='Money lent'?'Interest received':'Interest paid')} {operation.action==='repayment'||operation.action==='mortgage'?target?.currency:account?.currency}<FormattedNumberInput required={false} value={draft.fee} onValueChange={fee=>setDraft({...draft,fee})}/></label>}
 {/* The day it was actually received or paid: the due date by default, never a day ahead. */}
 {operation.action==='occurrence'&&<label>{t('Payment date')}<DatePicker value={draft.paid_on??''} max={depositToday()} onChange={paid_on=>setDraft({...draft,paid_on:paid_on||depositToday()})}/></label>}
 {operation.action!=='occurrence'&&operation.action!=='reconcile'&&<label>{t('Date')}<DatePicker value={draft.date} max={depositToday()} onChange={date=>setDraft({...draft,date})}/></label>}
 <label>{t('Notes (optional)')}<Input value={draft.notes} maxLength={2000} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
 </fieldset>
 {convertedPayment&&<><ExchangeRatePreview fx={fx}/>{fx.rate&&account&&<p className="muted">{t('Account amount')}: {formatMoney((operation.action==='occurrence'?draft.amount:draft.amount+draft.fee)/fx.rate,account.currency,locale)}</p>}</>}
 <ErrorPopup message={error}/>
 <FormFooter busy={busy} onCancel={guard.close}><Button title={busy?undefined:!draft.account_id?t('Choose a cash account.'):(['transfer','repayment'].includes(operation.action)&&draft.amount<=0)||(operation.action==='mortgage'&&draft.amount+draft.fee<=0)?t('Enter an amount greater than zero.'):undefined} disabled={busy||!draft.account_id||(['transfer','repayment'].includes(operation.action)&&draft.amount<=0)||(operation.action==='mortgage'&&draft.amount+draft.fee<=0)||(operation.action==='reconcile'&&balanceBlank)||(convertedPayment&&!fx.rate)}>{t(busy?'Saving…':submitted?'Retry':'Save')}</Button></FormFooter>
 </form></DialogContent></Dialog>{guard.confirmation}</>;
}
