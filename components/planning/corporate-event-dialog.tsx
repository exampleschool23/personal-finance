"use client";
import { showSaved } from '@/lib/save-feedback';
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {DatePicker} from '@/components/date-picker';
import {FormattedNumberInput} from '@/components/formatted-number-input';
import {useDiscardChanges} from '@/components/discard-changes';
import {useOwnerResource} from '@/hooks/use-owner-resource';
import {depositToday} from '@/lib/deposit-interest';
import {formatDate,formatMoney,formatNumber} from '@/lib/format';
import {corporateEventSchema,type CorporateEvent} from '@/lib/corporate-events';
import type {Entry} from '@/lib/finance';
const emptyEvents:Array<{id:string;kind:string;occurred_on:string;result:Record<string,number>}> = [];
export function CorporateEventDialog({record,records,accounts,owner,onSaved,onClose}:{record:Entry;records:Entry[];accounts:{id:string;name:string}[];owner:string|null;onSaved:()=>void;onClose:()=>void}){
 const {t,locale}=useLanguage();const today=depositToday();
 const [draft,setDraft]=useState<CorporateEvent>({id:crypto.randomUUID(),record_id:record.id,revision:record.revision??1,target_id:null,target_revision:null,kind:record.kind==='Stock'?'dividend':'security_transfer',date:today,notes:'',gross:0,withholding:0,reinvest_amount:0,quantity:0,numerator:0,denominator:0});
 const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[error,setError]=useState('');
 const history=useOwnerResource('/api/corporate-events?record='+record.id,owner,true,0,emptyEvents);
 const guard=useDiscardChanges(draft.gross>0||draft.quantity>0||draft.numerator>0||!!draft.notes,onClose,busy);
 const targets=records.filter(r=>r.id!==record.id&&r.currency===record.currency&&(draft.kind==='dividend'?r.kind==='Cash':r.kind===record.kind&&r.name===record.name));
 const valid=corporateEventSchema.safeParse(draft).success;
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t('Investment events')} · {record.name}</DialogTitle><DialogDescription>{t('Use confirmed broker figures. Linked cash, shares and history are saved together. Recorded events cannot be edited here.')}</DialogDescription>
 <form className="record-form" onSubmit={async e=>{e.preventDefault();if(busy||!valid)return;setBusy(true);setSubmitted(true);setError('');try{const r=await fetch('/api/corporate-events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});const body=await r.json() as {error?:string};if(!r.ok){if(r.status<500)setSubmitted(false);throw Error(body.error);}showSaved();onSaved();onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <fieldset className="tracker-fields" disabled={busy||submitted}><label>{t('Event type')}<NativeSelect value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as CorporateEvent['kind'],target_id:null,target_revision:null,gross:0,withholding:0,reinvest_amount:0,quantity:0,numerator:0,denominator:0})}>{record.kind==='Stock'&&<><option value="dividend">{t('Dividend')}</option><option value="split">{t('Stock split')}</option></>}<option value="security_transfer">{t('Security transfer')}</option></NativeSelect></label>
 <p>{t('Quantity')}: {formatNumber(record.quantity,locale,8)} · {t('Purchase cost')}: {formatMoney(record.quantity*record.cost,record.currency,locale)}</p>
 {draft.kind!=='split'&&<label>{t(draft.kind==='dividend'?'Cash account':'Destination holding')}<NativeSelect required value={draft.target_id??''} onChange={e=>{const r=targets.find(r=>r.id===e.target.value);setDraft({...draft,target_id:r?.id??null,target_revision:r?.revision??null});}}><option value="">{t('Select account')}</option>{targets.map(r=><option key={r.id} value={r.id}>{r.name} · {r.currency} · {r.holding_account_id?accounts.find(a=>a.id===r.holding_account_id)?.name??t('Investment account'):t('Cash')}</option>)}</NativeSelect></label>}
 {draft.kind==='dividend'?<><label>{t('Gross dividend')}<FormattedNumberInput value={draft.gross} onValueChange={gross=>setDraft({...draft,gross})}/></label><label>{t('Withholding tax')}<FormattedNumberInput required={false} value={draft.withholding} onValueChange={withholding=>setDraft({...draft,withholding})}/></label><label>{t('Amount reinvested')}<FormattedNumberInput required={false} value={draft.reinvest_amount} onValueChange={reinvest_amount=>setDraft({...draft,reinvest_amount,quantity:reinvest_amount===0?0:draft.quantity})}/></label>{draft.reinvest_amount>0&&<label>{t('Shares received')}<FormattedNumberInput value={draft.quantity} max={1e12} onValueChange={quantity=>setDraft({...draft,quantity})}/></label>}<p>{t('Cash remaining')}: {formatMoney(draft.gross-draft.withholding-draft.reinvest_amount,record.currency,locale)}</p></>:draft.kind==='split'?<><label>{t('New shares in ratio')}<FormattedNumberInput value={draft.numerator} onValueChange={numerator=>setDraft({...draft,numerator})}/></label><label>{t('Old shares in ratio')}<FormattedNumberInput value={draft.denominator} onValueChange={denominator=>setDraft({...draft,denominator})}/></label>{draft.denominator>0&&<p>{t('Resulting quantity')}: {formatNumber(record.quantity*draft.numerator/draft.denominator,locale,8)}</p>}<p className="muted">{t('Total purchase cost and recorded value stay unchanged. Fractional shares are preserved.')}</p></>:<label>{t('Quantity transferred')}<FormattedNumberInput value={draft.quantity} max={record.quantity} onValueChange={quantity=>setDraft({...draft,quantity})}/></label>}
 <label>{t('Event date')}<DatePicker value={draft.date} max={today} onChange={date=>setDraft({...draft,date})}/></label><label>{t('Notes (optional)')}<textarea maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></fieldset>
 {error&&<p role="alert" className="error">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||!valid||!owner}>{t(busy?'Saving…':submitted?'Retry':'Save')}</Button></div></form>
 <details><summary>{t('Recent investment events')}</summary>{history.loading?<p>{t('Loading records…')}</p>:history.error?<p role="alert">{t(history.error)}</p>:<ul>{history.data.map(e=><li key={e.id}>{formatDate(e.occurred_on,locale)} · {t(e.kind==='dividend'?'Dividend':e.kind==='split'?'Stock split':'Security transfer')}{e.kind==='dividend'&&<> · {t('Gross dividend')}: {formatMoney(Number(e.result.gross),record.currency,locale)} · {t('Withholding tax')}: {formatMoney(Number(e.result.withholding),record.currency,locale)}</>}</li>)}</ul>}</details>
 </DialogContent></Dialog>{guard.confirmation}</>;
}
