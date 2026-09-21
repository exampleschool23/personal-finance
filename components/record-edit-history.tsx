"use client";
import {useState} from 'react';
import {useOwnerResource} from '@/hooks/use-owner-resource';
import {useLanguage} from '@/components/language-provider';
import {Button} from '@/components/ui/button';
import {formatDateTime,formatDate,formatMoney,formatNumber} from '@/lib/format';
import {recordChanges,recordChangeFields,type RecordEdit} from '@/lib/record-edit-history';
import type {Entry} from '@/lib/finance';
const empty={items:[] as RecordEdit[],hasMore:false};
export function RecordEditHistory({record}:{record:Entry}){
 const {t,locale}=useLanguage();const [open,setOpen]=useState(false),[page,setPage]=useState(1);
 const resource=useOwnerResource('/api/record-history?'+new URLSearchParams({id:record.id,page:String(page)}),record.id,open,record.revision??0,empty);
 function display(entry:Entry|null,key:keyof typeof recordChangeFields){
  const value=entry?.[key];if(value===null||value===undefined||value==='')return '—';
  if(['date','lent_date','end_date'].includes(key))return formatDate(String(value),locale);
  if(typeof value==='number')return ['amount','cost','estimated_monthly_income','estimated_monthly_payment'].includes(key)?formatMoney(value,entry!.currency,locale,['Stock','Crypto'].includes(entry!.kind)&&['amount','cost'].includes(key)):formatNumber(value,locale);
  return ['kind','frequency'].includes(key)?t(String(value)):String(value);
 }
 return <section><Button type="button" variant="ghost" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t('Record history')}</Button>{open&&<>
  {resource.loading?<p>{t('Loading records…')}</p>:resource.error?<p role="alert" className="error">{t(resource.error)} <Button type="button" variant="outline" onClick={resource.retry}>{t('Retry')}</Button></p>:!resource.data.items.length?<p className="muted">{t('No recorded edits yet. History starts when this feature is enabled.')}</p>:<ul>{resource.data.items.map(edit=><li key={edit.id}><strong>{formatDateTime(edit.changed_at,locale)}</strong>{!edit.after_record?<p>{t('Deleted')}</p>:recordChanges(edit).length?recordChanges(edit).map(key=><p key={key}>{t(recordChangeFields[key])}: {display(edit.before_record,key)} → {display(edit.after_record,key)}</p>):<p>{t('Record details updated')}</p>}</li>)}</ul>}
  <div className="record-form-footer"><Button type="button" variant="outline" disabled={page<=1||resource.loading} onClick={()=>setPage(value=>value-1)}>{t('Previous')}</Button><span>{t('Page {page}',{page:formatNumber(page,locale,0)})}</span><Button type="button" variant="outline" disabled={!resource.data.hasMore||resource.loading} onClick={()=>setPage(value=>value+1)}>{t('Next')}</Button></div>
 </>}</section>;
}
