"use client";
import { showDeleted } from '@/lib/feedback';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useLanguage } from '@/components/language-provider';
import { formatNumber } from '@/lib/format';
import { requestJson } from '@/lib/api-client';
import type { Category } from '@/lib/planning';

type Usage={records:number;deleted:number;watchlists:number};
export function DeleteCategoryDialog({category,categories,onClose,onDeleted}:{category:Category;categories:Category[];onClose:()=>void;onDeleted:()=>void}){
 const {t,locale}=useLanguage();
 const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[replacement,setReplacement]=useState(''),[name,setName]=useState('');
 const submitting=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/categories?id='+encodeURIComponent(category.id),{signal:controller.signal}).then(async response=>{
   const data=await response.json() as Usage & {error?:string};if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setUsage(data);
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
  return()=>controller.abort();
 },[category.id,retry]);
 const inUse=!!usage&&(usage.records+usage.deleted+usage.watchlists>0);
 const targets=categories.filter(item=>item.id!==category.id&&item.direction===category.direction);
 const valid=!!usage&&(!inUse||(replacement==='new'?!!name.trim():targets.some(item=>item.id===replacement)));
 async function remove(){
  if(!valid||submitting.current)return;
  submitting.current=true;setBusy(true);setError('');
  try{
   await requestJson('/api/categories',{method:'DELETE',body:{id:category.id,...(inUse?(replacement==='new'?{new_name:name.trim()}:{replacement_id:replacement}):{})}});
   onDeleted();onClose();showDeleted();
  }catch(reason){
   const message=(reason as Error).message;
   // The category gained records since the preview: read its usage again so a replacement can be chosen.
   if(message==='This category is in use. Choose a replacement category.'){setUsage(null);setRetry(value=>value+1);}
   setError(message);
  }finally{submitting.current=false;setBusy(false);}
 }
 return <AlertDialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><AlertDialogContent onEscapeKeyDown={event=>{if(busy)event.preventDefault();}}>
  <AlertDialogTitle>{t('Delete {name}?',{name:category.name})}</AlertDialogTitle>
  <AlertDialogDescription>{t(inUse?'This category has linked records. Choose where to move them before deleting the category. Amounts, dates and account balances stay unchanged.':'Delete this category from your available categories?')}</AlertDialogDescription>
  {!usage&&!error&&<p role="status">{t('Checking linked records…')}</p>}
  {usage&&inUse&&<><ul className="list-disc pl-5">
   {usage.records>0&&<li>{t('Transactions and schedules: {count}',{count:formatNumber(usage.records,locale,0)})}</li>}
   {usage.deleted>0&&<li>{t('Recently deleted records: {count}',{count:formatNumber(usage.deleted,locale,0)})}</li>}
   {usage.watchlists>0&&<li>{t('Spending watchlists: {count}',{count:formatNumber(usage.watchlists,locale,0)})}</li>}
  </ul><label>{t('Move to category')}<NativeSelect value={replacement} disabled={busy} onChange={event=>setReplacement(event.target.value)}><option value="">{t('Select category')}</option>{targets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">{t('Create a replacement category')}</option></NativeSelect></label>
  {replacement==='new'&&<label>{t('New category')}<Input value={name} disabled={busy} required maxLength={80} onChange={event=>setName(event.target.value)}/></label>}
  <p className="muted">{t('Only categories of the same type can receive these records. Split allocations and Recently deleted records are moved too.')}</p></>}
  {usage&&!inUse&&<p>{t('No linked records. Your transactions will not be changed.')}</p>}
  {error&&!usage&&<InlineError message={t(error)} onRetry={()=>{setError('');setUsage(null);setRetry(value=>value+1);}}/>}<ErrorPopup message={usage?error:''}/>
  <AlertDialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('Cancel')}</Button><Button type="button" variant="destructive" disabled={!valid||busy} onClick={()=>void remove()}><Trash2 aria-hidden="true"/>{t(busy?'Saving…':inUse?'Move records and delete':'Delete category')}</Button></AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}
