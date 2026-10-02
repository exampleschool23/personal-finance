"use client";
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { useEffect, useState, type CSSProperties } from 'react';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { ArchiveRestore, RotateCcw, Trash2 } from 'lucide-react';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { categoryColor } from '@/lib/category-colors';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { Pagination } from '@/components/presentation-foundation/pagination';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { deletedItemColorKind, deletedItemLabel, type DeletedItem } from '@/lib/deleted-items';

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
 return <><PageHeader title={t('Recently deleted')} hint={<>{t('Restore deleted items to bring them back, or permanently delete them to remove their recovery data.')} {t('Items deleted before recovery was enabled cannot be recovered here.')}</>}/><section className="panel records recovery-panel">
 {error&&!restoring&&!loading&&<InlineError as="div" message={t(error)} onRetry={()=>setReload(n=>n+1)}/>}
 {loading?<LoadingPlaceholder label={t('Loading records…')}/>:!visible.length?<EmptyState icon={<ArchiveRestore aria-hidden="true"/>} title={t('No deleted items.')} description={t('Your deleted records will appear here for recovery.')}/>:<ul className="recovery-list">{visible.map(item=><li className="recovery-row" key={item.id} style={{'--recovery-color':categoryColor(deletedItemColorKind(item))} as CSSProperties}>
  <span className="recovery-icon"><ArchiveRestore size={20} aria-hidden="true"/></span>
  <div className="recovery-info"><strong>{item.data.name}</strong><p><CategoryBadge kind={deletedItemColorKind(item)} label={t(deletedItemLabel(item))}/>{item.source==='finance_records'&&item.data.date&&<span>{formatDate(item.data.date,locale)}</span>}</p></div>
  <div className="recovery-value">{item.source==='finance_records'&&<strong>{formatMoney(Number(item.data.amount)*(['Stock','Crypto'].includes(item.data.kind)?Number(item.data.quantity||1):1),item.data.currency,locale)}</strong>}{item.source==='savings_goals'&&<strong>{t('Target amount')}: {formatMoney(Number(item.data.target),item.data.currency??'USD',locale)}</strong>}<small>{t('Deleted on')} · {formatDateTime(item.deleted_at,locale)}</small></div>
  <div className="row-actions"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setError('');setPermanent(false);setRestoring(item);}}><RotateCcw size={15} aria-hidden="true"/>{t('Restore')}</Button><Button size="sm" variant="ghost" className="recovery-delete" disabled={busy} onClick={()=>{setError('');setPermanent(true);setRestoring(item);}}><Trash2 size={15} aria-hidden="true"/>{t('Delete permanently')}</Button></div>
 </li>)}</ul>}

 <Pagination label={t('Record pages')} summary={t('Page {page}',{page:formatNumber(page,locale,0)})} page={page} hasNext={demo?demoItems.length>page*10:hasMore} disabled={loading||busy} onPage={setPage}/>
 </section><ConfirmDialog open={!!restoring} onClose={()=>{setRestoring(null);setError('');}} busy={busy} destructive={permanent} error={error} title={t(permanent?'Permanently delete {name}?':'Restore {name}?',{name:restoring?.data.name||''})} description={t(permanent?'This permanently removes the saved item and its recovery data from the database. This cannot be undone.':'This restores the original details and dates. The item will appear in your records and affect balances or forecasts again. A stopped item keeps its end date.')} confirmLabel={t(busy?'Saving…':permanent?'Delete permanently':'Restore')} onConfirm={async()=>{if(!restoring)return;setBusy(true);setError('');try{
 if(demo){if(permanent)onDelete(restoring);else onRestore(restoring);if(visible.length===1&&page>1)setPage(n=>n-1);}else{const response=await fetch('/api/deleted-items',{method:permanent?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:restoring.id})});const data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error);}
 setRestoring(null);setReload(n=>n+1);onSaved();
 }catch(error){setError((error as Error).message);}finally{setBusy(false);}}}/></>;
}
