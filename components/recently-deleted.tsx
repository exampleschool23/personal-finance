"use client";
import { useEffect, useState, type CSSProperties } from 'react';
import { ArchiveRestore, RotateCcw, Trash2 } from 'lucide-react';
import { categoryColor } from '@/lib/category-colors';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { DeletedItem } from '@/lib/deleted-items';

export function RecentlyDeleted({demo,demoItems,onRestore,onDelete,onSaved}:{demo:boolean;demoItems:DeletedItem[];onRestore:(item:DeletedItem)=>void;onDelete:(item:DeletedItem)=>void;onSaved:()=>void}) {
 const {t,locale}=useLanguage();
 const [items,setItems]=useState<DeletedItem[]>([]),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[loadedKey,setLoadedKey]=useState(''),[reload,setReload]=useState(0);
 const [permanent,setPermanent]=useState(false);
 const [restoring,setRestoring]=useState<DeletedItem|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const requestKey=page+':'+reload;
 const loading=!demo&&loadedKey!==requestKey;
 useEffect(()=>{
  if(demo)return;
  const controller=new AbortController();
  fetch('/api/deleted-items?page='+page,{signal:controller.signal}).then(async response=>{
   const data=await response.json() as {items:DeletedItem[];hasMore:boolean;error?:string};if(!response.ok)throw Error(data.error);
   if(!controller.signal.aborted){setError('');if(!data.items.length&&page>1)setPage(page-1);else{setItems(data.items);setHasMore(data.hasMore);}}
  }).catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoadedKey(requestKey);});
  return ()=>controller.abort();
 },[demo,page,requestKey]);
 const visible=demo?demoItems.slice((page-1)*10,page*10):items;
 return <><div className="page-heading"><div><h1>{t('Recently deleted')}</h1><p className="muted">{t('Restore deleted items to bring them back, or permanently delete them to remove their recovery data.')}</p><p className="muted">{t('Items deleted before recovery was enabled cannot be recovered here.')}</p></div></div><section className="panel recovery-panel">
 {error&&!restoring&&!loading&&<div role="alert" className="error">{t(error)} <Button variant="outline" onClick={()=>setReload(n=>n+1)}>{t('Retry')}</Button></div>}
 {loading?<LoadingPlaceholder label={t('Loading records…')}/>:!visible.length?<div className="recovery-empty"><ArchiveRestore size={34}/><h2>{t('No deleted items.')}</h2><p>{t('Your deleted records will appear here for recovery.')}</p></div>:<div className="recovery-grid">{visible.map(item=><article className="recovery-card" key={item.id} style={{'--recovery-color':categoryColor(item.source==='expense_plans'?'Other expense':item.data.kind)} as CSSProperties}><span className="recovery-icon"><ArchiveRestore size={22}/></span><div><span className="recovery-type">{t(item.source==='expense_plans'?'Monthly expense plan':item.data.kind)}</span><h2>{item.data.name}</h2><p>{t('Deleted on')} · {formatDateTime(item.deleted_at,locale)}</p></div><div className="recovery-actions"><Button variant="outline" disabled={busy} onClick={()=>{setError('');setPermanent(false);setRestoring(item);}}><RotateCcw size={15}/>{t('Restore')}</Button><Button variant="destructive" disabled={busy} onClick={()=>{setError('');setPermanent(true);setRestoring(item);}}><Trash2 size={15}/>{t('Delete permanently')}</Button></div></article>)}</div>}

 <nav className="records-pagination" aria-label={t('Record pages')}><span>{t('Page {page}',{page:formatNumber(page,locale,0)})}</span><div><Button variant="outline" disabled={loading||busy||page<=1} onClick={()=>setPage(n=>n-1)}>{t('Previous')}</Button><Button variant="outline" disabled={loading||busy||!(demo?demoItems.length>page*10:hasMore)} onClick={()=>setPage(n=>n+1)}>{t('Next')}</Button></div></nav>
 </section><AlertDialog open={!!restoring} onOpenChange={open=>{if(!open&&!busy){setRestoring(null);setError('');}}}><AlertDialogContent><AlertDialogTitle>{t(permanent?'Permanently delete {name}?':'Restore {name}?',{name:restoring?.data.name||''})}</AlertDialogTitle><AlertDialogDescription>{t(permanent?'This permanently removes the saved item and its recovery data from the database. This cannot be undone.':'This restores the original details and dates. The item will appear in your records and affect balances or forecasts again. A stopped item keeps its end date.')}</AlertDialogDescription>{error&&<p className="error" role="alert">{t(error)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel><AlertDialogAction className={permanent?'bg-destructive text-white hover:bg-destructive/90':undefined} disabled={busy} onClick={async event=>{event.preventDefault();if(!restoring)return;setBusy(true);setError('');try{
 if(demo){if(permanent)onDelete(restoring);else onRestore(restoring);if(visible.length===1&&page>1)setPage(n=>n-1);}else{const response=await fetch('/api/deleted-items',{method:permanent?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:restoring.id})});const data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error);}
 setRestoring(null);setReload(n=>n+1);onSaved();
 }catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>{t(busy?'Saving…':permanent?'Delete permanently':'Restore')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
