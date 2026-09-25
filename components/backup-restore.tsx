"use client";
import { showSaved } from '@/lib/save-feedback';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useRef,useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { formatDateTime,formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';

const emptyRecoveries={items:[] as Array<{id:string;created_at:string}>,hasMore:false};
type Preview={id:string;exported_at:string;counts:Record<string,number>;current_records:number;expected_state:string};
export function BackupRestore({demo,owner,onSaved}:{demo:boolean;owner:string|null;onSaved:()=>void}){
 const {t,locale}=useLanguage();
 const [backup,setBackup]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[recovery,setRecovery]=useState('');
 const fileRequest=useRef(0);
 const [historyOpen,setHistoryOpen]=useState(false),[historyPage,setHistoryPage]=useState(1),[revision,setRevision]=useState(0);
 const copies=useOwnerResource('/api/backup?recoveries=1&page='+historyPage,owner,!demo&&historyOpen,revision,emptyRecoveries);
 async function request<T>(action:'preview'|'restore',text=backup){
  const response=await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,backup:text,...(action==='restore'?{expected_state:preview?.expected_state,confirmed:true}:{})})});
  const data=await response.json() as T & {error?:string};if(!response.ok)throw Error(data.error);return data;
 }
 return <section className="data-backup-section"><h3>{t('Restore a backup')}</h3>
  <p className="muted">{t('Restore replaces this account’s data with the selected backup. A recovery copy is saved automatically. Only unchanged verified backups from this account are accepted.')}</p>
  <label>{t('Backup file')}<input type="file" accept=".json,application/json" disabled={demo||busy} onChange={async event=>{
   const file=event.target.files?.[0],generation=++fileRequest.current;setPreview(null);setBackup('');setError('');setRecovery('');if(!file)return;
   if(file.size>28_000_000){setError('File is too large.');return;}
   setBusy(true);try{const text=await file.text();const result=await request<Preview>('preview',text);if(fileRequest.current===generation){setBackup(text);setPreview(result);}}catch(reason){if(fileRequest.current===generation)setError((reason as Error).message);}finally{if(fileRequest.current===generation)setBusy(false);}
  }}/></label>
  {busy&&<p role="status">{t('Checking backup…')}</p>}
  {preview&&!recovery&&<div>
   <p>{t('Backup date')}: {formatDateTime(preview.exported_at,locale)}</p>
   <p>{t('Current records')}: {formatNumber(preview.current_records,locale,0)} · {t('Backup records')}: {formatNumber(preview.counts.finance_records??0,locale,0)}</p>
   <p>{t('History entries')}: {formatNumber((preview.counts.investment_history??0)+(preview.counts.record_edit_history??0),locale,0)} · {t('Savings goals')}: {formatNumber(preview.counts.savings_goals??0,locale,0)}</p>
   <Button type="button" variant="destructive" disabled={busy||demo} onClick={()=>setConfirm(true)}>{t('Restore this backup')}</Button>
   <Button type="button" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setPreview(await request<Preview>('preview'));}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>{t('Refresh preview')}</Button>
  </div>}
  {error&&<p className="error" role="alert">{t(error)}</p>}
  {recovery&&<div role="status"><p>{t('Backup restored. Reload the workspace to apply all restored settings.')}</p><Button variant="outline" asChild><a href={'/api/backup?recovery='+recovery}>{t('Download pre-restore backup')}</a></Button> <Button type="button" onClick={()=>window.location.reload()}>{t('Reload workspace')}</Button></div>}
  <Button type="button" variant="outline" disabled={demo} aria-expanded={historyOpen} onClick={()=>setHistoryOpen(value=>!value)}>{t('Previous recovery copies')}</Button>
  {historyOpen&&<div>{copies.loading?<p>{t('Loading records…')}</p>:copies.error?<p role="alert" className="error">{t(copies.error)} <Button type="button" onClick={copies.retry}>{t('Retry')}</Button></p>:<>{!copies.data.items.length?<p>{t('No recovery copies yet.')}</p>:<ul>{copies.data.items.map(item=><li key={item.id}><a href={'/api/backup?recovery='+item.id}>{t('Download pre-restore backup')} · {formatDateTime(item.created_at,locale)}</a></li>)}</ul>}<Button type="button" variant="outline" disabled={historyPage<=1} onClick={()=>setHistoryPage(value=>value-1)}>{t('Previous')}</Button><Button type="button" variant="outline" disabled={!copies.data.hasMore} onClick={()=>setHistoryPage(value=>value+1)}>{t('Next')}</Button></>}</div>}
  <AlertDialog open={confirm} onOpenChange={open=>{if(!busy)setConfirm(open);}}><AlertDialogContent><AlertDialogTitle>{t('Replace account data?')}</AlertDialogTitle><AlertDialogDescription>{t('Records, balances, history, goals and settings will return to this backup. Changes made after its date will be replaced. You can recover the current data using the automatically saved pre-restore backup.')}</AlertDialogDescription>{error&&<p role="alert" className="error">{t(error)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async event=>{event.preventDefault();setBusy(true);setError('');try{const result=await request<{recovery_id:string}>('restore');setRecovery(result.recovery_id);setRevision(value=>value+1);setConfirm(false);showSaved();onSaved();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>{t(busy?'Restoring…':'Restore this backup')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>;
}
