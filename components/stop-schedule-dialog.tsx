"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/date-picker';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLanguage } from '@/components/language-provider';
import { depositToday } from '@/lib/deposit-interest';

export function StopScheduleDialog({name,start,onSave,onClose}:{name:string;start:string;onSave:(date:string)=>Promise<void>;onClose:()=>void}) {
 const {t}=useLanguage();
 const [date,setDate]=useState(()=>depositToday()<start?start:depositToday());
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent showCloseButton={!busy}><DialogTitle>{t('Stop {name}',{name})}</DialogTitle><DialogDescription>{t('Keep this record and past planning. The selected month is the last active month; later months exclude this recurring amount. Recorded transactions are kept.')}</DialogDescription><form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await onSave(date);onClose();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><fieldset disabled={busy} className="tracker-fields"><label>{t('Last active date')}<DatePicker value={date} min={start} onChange={setDate}/></label></fieldset>{error&&<p className="error" role="alert">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('Cancel')}</Button><Button disabled={busy||!date||date<start}>{t(busy?'Saving…':'Stop')}</Button></div></form></DialogContent></Dialog>;
}
