"use client";
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { ExchangeRatePreview } from '@/components/exchange-rate-preview';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { isHolding, movementSources, movementTargets, type AssetMovement, type MovementKind } from '@/lib/asset-movements';
import type { Entry } from '@/lib/finance';
import type { HoldingAccount } from '@/lib/holding-accounts';

export type MovementDraft = { kind:MovementKind; source_id?:string; target_id?:string };
export function AssetMovementDialog({initial,records,accounts=[],save,onClose}:{initial:MovementDraft;records:Entry[];accounts?:HoldingAccount[];save:(movement:AssetMovement)=>Promise<void>;onClose:()=>void}){
 const {t,locale}=useLanguage();
 const [draft,setDraft]=useState(()=>({exchange_rate:undefined as number|undefined,id:crypto.randomUUID(),kind:initial.kind,source_id:initial.source_id??'',target_id:initial.target_id??'',sent:0,received:0,source_value:0,target_value:0,fee:0,date:depositToday(),notes:''}));
 const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[error,setError]=useState('');
 const source=records.find(record=>record.id===draft.source_id);
 const target=draft.kind==='interest'?source:records.find(record=>record.id===draft.target_id);
 const trade=draft.kind==='buy'||draft.kind==='sell', interest=draft.kind==='interest';
 const sameCurrency=!!source&&!!target&&source.currency===target.currency;
 const fx=useDatedExchangeRate(draft.kind==='transfer'?source?.currency:undefined,target?.currency,draft.date);
 const crossTransfer=draft.kind==='transfer'&&!!source&&!!target&&!sameCurrency;
 const rate=submitted?draft.exchange_rate??fx.rate:fx.rate;
 const received=draft.kind==='transfer'?(sameCurrency?Math.max(0,draft.sent-draft.fee):rate?Math.max(0,draft.sent-draft.fee)*rate:0):draft.received;
 let sourceValue=source&&!isHolding(source)?draft.sent:draft.source_value;
 let targetValue=target&&!isHolding(target)?received:draft.target_value;
 if(trade&&sameCurrency){
  const common=source&&!isHolding(source)?draft.sent:target&&!isHolding(target)?received:draft.source_value;
  sourceValue=common;targetValue=common;
 }
 if(interest){sourceValue=0;targetValue=received;}
 const available=source?(isHolding(source)?source.quantity:source.amount):0;
 const valid=!!source&&!!target&&(interest||(source.id!==target.id&&draft.sent>0&&draft.sent<=available&&sourceValue>0))&&received>0&&targetValue>0&&!!draft.date&&draft.date<=depositToday()&&(draft.kind!=='transfer'||draft.fee<draft.sent);
 const title={transfer:'Transfer money',buy:'Buy holding',sell:'Sell / convert holding',interest:'Record capitalized interest'}[draft.kind];
 const accountName=(record:Entry)=>{const parent=accounts.find(account=>account.id===record.holding_account_id);return `${parent?parent.name+' · ':''}${record.name} · ${record.currency}`;};
 const units=(record:Entry,amount:number)=>isHolding(record)?t('{quantity} units',{quantity:formatNumber(amount,locale,8)}):formatMoney(amount,record.currency,locale);
 const change=(name:keyof typeof draft,value:string|number)=>setDraft({...draft,[name]:value});
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="record-dialog" showCloseButton={!busy}>
  <DialogTitle>{t(title)}</DialogTitle><DialogDescription>{t(interest?'Record interest your bank has added to this deposit. It will earn interest from this date.':'Both sides are saved together. Enter the actual amounts from your transaction.')}</DialogDescription>
  <form className="record-form" onSubmit={async event=>{
   event.preventDefault();if((!valid&&!submitted)||busy)return;setBusy(true);setSubmitted(true);setError('');
   try{const payload={...draft,...(crossTransfer?{exchange_rate:rate!}:{})};setDraft(payload);await save({...payload,target_id:target!.id,sent:interest?0:draft.sent,received,source_value:sourceValue,target_value:targetValue,fee:interest?0:draft.fee});onClose();}
   catch(reason){setError((reason as Error).message);if((reason as Error & {confirmedFailure?:boolean}).confirmedFailure){setSubmitted(false);if(crossTransfer)fx.retry();}}
   finally{setBusy(false);}
  }}>
   <fieldset className="tracker-fields" disabled={busy||submitted}>
    <label>{t(interest?'Deposit':'From')}<NativeSelect required value={draft.source_id} onChange={event=>setDraft({...draft,source_id:event.target.value,target_id:draft.target_id===event.target.value?'':draft.target_id,sent:0,received:0,source_value:0,target_value:0})}><option value="">{t('Select account')}</option>{movementSources(draft.kind,records).map(record=><option key={record.id} value={record.id}>{accountName(record)}</option>)}</NativeSelect></label>
    {!interest&&<label>{t('To')}<NativeSelect required value={draft.target_id} onChange={event=>setDraft({...draft,target_id:event.target.value,received:0,source_value:0,target_value:0})}><option value="">{t('Select account')}</option>{movementTargets(draft.kind,source,records).map(record=><option key={record.id} value={record.id}>{accountName(record)}</option>)}</NativeSelect></label>}
    {source&&!interest&&<><p className="muted">{t('Available')}: {units(source,available)}</p><label>{t(isHolding(source)?'Quantity sent':'Total amount debited')} {isHolding(source)?source.name:source.currency}<FormattedNumberInput value={draft.sent} max={available} onValueChange={amount=>change('sent',amount)}/></label></>}
    {target&&draft.kind!=='transfer'&&<label>{t(interest?'Interest credited':isHolding(target)?'Quantity received':'Net amount received')} {isHolding(target)?target.name:target.currency}<FormattedNumberInput value={draft.received} onValueChange={amount=>change('received',amount)}/></label>}
    {trade&&source&&target&&<>
     {isHolding(source)&&(!sameCurrency||isHolding(target))&&<label>{t(draft.kind==='buy'?'Total purchase cost (including fees)':'Net sale proceeds (after fees)')} {source.currency}<FormattedNumberInput value={draft.source_value} onValueChange={amount=>change('source_value',amount)}/></label>}
     {isHolding(target)&&!sameCurrency&&<label>{t('Total purchase cost (including fees)')} {target.currency}<FormattedNumberInput value={draft.target_value} onValueChange={amount=>change('target_value',amount)}/></label>}
     <p className="muted">{t('USDT and USDC are crypto holdings. Enter the actual quantity and fiat value; no exchange rate is assumed.')}</p>
    </>}
    {!interest&&<label>{t('Fee included in these amounts')} {draft.kind==='buy'?target?.currency:source?.currency}<FormattedNumberInput value={draft.fee} required={false} onValueChange={amount=>change('fee',amount)}/><small className="muted">{t('This records the fee as an expense without deducting it again.')}</small></label>}
    {crossTransfer&&<ExchangeRatePreview fx={fx}/>}
    {draft.kind==='transfer'&&target&&rate&&<p>{t('Net amount received')}: {formatMoney(received,target.currency,locale)}</p>}
    <label>{t('Date')}<DatePicker value={draft.date} onChange={date=>change('date',date)}/></label>
    <label>{t('Notes (optional)')}<textarea rows={2} maxLength={2000} value={draft.notes} onChange={event=>change('notes',event.target.value)}/></label>
   </fieldset>
   {source&&target&&valid&&<div className="ownership-summary">{!interest&&<p>{source.name}: {units(source,available-draft.sent)}</p>}<p>{target.name}: {units(target,(isHolding(target)?target.quantity:target.amount)+received)}</p><small>{t('Balances after this transaction')}</small></div>}
   {!interest&&(!movementSources(draft.kind,records).length||!movementTargets(draft.kind,source,records).length)&&<p className="muted">{t('Add the source and destination first. For a new holding or proceeds balance, start at zero.')}</p>}
   {error&&<p role="alert" className="error">{t(error)}</p>}
   <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('Cancel')}</Button><Button disabled={busy||(!valid&&!submitted)}>{t(busy?'Saving…':submitted?'Retry':'Save')}</Button></div>
  </form>
 </DialogContent></Dialog>;
}
