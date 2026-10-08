"use client";
import {ResourceState} from '@/components/presentation-foundation/resource-state';
import {Pagination} from '@/components/presentation-foundation/pagination';
import {useState} from 'react';
import {useOwnerResource} from '@/hooks/use-owner-resource';
import {useLanguage} from '@/components/language-provider';
import {formatDateTime,formatDate,formatMoney,formatNumber} from '@/lib/format';
import {recordChanges,recordChangeFields,recordDateFields,type RecordEdit} from '@/lib/record-edit-history';
import type {Entry} from '@/lib/finance';
import { unitPricedKinds } from '@/lib/finance';
const empty={items:[] as RecordEdit[],hasMore:false};
type Field=keyof typeof recordChangeFields;

/** A saved record's change history at the foot of its dialog: closed until opened, then each save, newest first, with what
 * changed from → to, paged. */
export function RecordEditHistory({record}:{record:Entry}){
 const {t,locale}=useLanguage();const [open,setOpen]=useState(false),[page,setPage]=useState(1);
 const resource=useOwnerResource('/api/record-history?'+new URLSearchParams({id:record.id,page:String(page)}),record.id,open,record.revision??0,empty);
 function display(entry:Entry|null,key:Field){
  const value=entry?.[key];if(value===null||value===undefined||value==='')return '—';
  if((recordDateFields as readonly string[]).includes(key))return formatDate(String(value),locale);
  if(typeof value==='number')return ['amount','cost','estimated_monthly_income','estimated_monthly_payment'].includes(key)?formatMoney(value,entry!.currency,locale,unitPricedKinds.includes(entry!.kind)&&['amount','cost'].includes(key)):formatNumber(value,locale);
  return ['kind','frequency'].includes(key)?t(String(value)):String(value);
 }
 return <details className="change-history" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{t('Change history')}</summary>
  {open&&<ResourceState loading={resource.loading} error={resource.error} onRetry={resource.retry}>{!resource.data.items.length?<p className="muted">{t('No changes yet.')}</p>:<ol>{resource.data.items.map(edit=>{
   const changes=edit.after_record?recordChanges(edit):[];
   return <li key={edit.id}><time dateTime={edit.changed_at}>{formatDateTime(edit.changed_at,locale)}</time>
    {!edit.after_record?<p>{t('Deleted')}</p>:changes.length?<dl>{changes.map(key=><div key={key}><dt>{t(recordChangeFields[key])}</dt><dd><span>{display(edit.before_record,key)}</span><span aria-hidden="true">→</span><strong>{display(edit.after_record,key)}</strong></dd></div>)}</dl>:<p>{t('Record details updated')}</p>}
   </li>;
  })}</ol>}</ResourceState>}
  {open&&<Pagination label={t('Change history')} summary={t('Page {page}',{page:formatNumber(page,locale,0)})} page={page} hasNext={resource.data.hasMore} disabled={resource.loading} onPage={setPage}/>}
 </details>;
}
