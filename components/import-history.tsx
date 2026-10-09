"use client";
import { showNotice } from '@/lib/feedback';
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {InfoHint} from '@/components/presentation-foundation/info-hint';
import {Button} from '@/components/ui/button';
import {useOwnerResource} from '@/hooks/use-owner-resource';
import {formatDateTime,formatNumber} from '@/lib/format';
import {Inbox} from 'lucide-react';
import {ConfirmDialog} from '@/components/presentation-foundation/confirm-dialog';
import {EmptyState} from '@/components/presentation-foundation/empty-state';
import {ResourceState} from '@/components/presentation-foundation/resource-state';
import {requestJson} from '@/lib/api-client';
const empty={batches:[] as {id:string;account_id:string;created_at:string;undone_at:string|null;result:{added:number;skipped:number}}[]};
export function ImportHistory({owner,demo,revision,onSaved}:{owner:string|null;demo:boolean;revision:number;onSaved:()=>void}){
 const {t,locale}=useLanguage();const history=useOwnerResource('/api/import',owner,!demo,revision,empty);const [undo,setUndo]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="panel tools-panel"><h2>{t('Statement import history')}<InfoHint>{t('Undo removes only unchanged records added by that import and reverses their cash effects. Skipped duplicates remain. Later edits or goal links require individual review.')}</InfoHint></h2><ResourceState loading={history.loading} error={history.error} onRetry={history.retry}>{!history.data.batches.length?<EmptyState icon={<Inbox aria-hidden="true"/>} title={t('No imports yet')} description={t('Imported statements will appear here so you can review or undo them.')}/>:<ul className="tool-list">{history.data.batches.map(batch=><li key={batch.id}><div><strong>{formatDateTime(batch.created_at,locale)}</strong><p>{t('Imported {added}; skipped {skipped}.',{added:formatNumber(batch.result.added,locale,0),skipped:formatNumber(batch.result.skipped,locale,0)})}</p></div>{batch.undone_at?<span>{t('Undone')}</span>:batch.result.added>0&&<Button type="button" disabled={busy} variant="outline" onClick={()=>{setError('');setUndo(batch.id);}}>{t('Undo import')}</Button>}</li>)}</ul>}</ResourceState>{error&&<p role="alert">{t(error)}</p>}
 <ConfirmDialog open={!!undo} onClose={()=>setUndo(null)} busy={busy} title={t('Undo this import?')} description={t('All unchanged transactions added by this import will be removed together. This also changes the cash account balance.')} confirmLabel={t(busy?'Saving…':'Undo import')} onConfirm={async()=>{setBusy(true);setError('');try{await requestJson('/api/import',{method:'DELETE',body:{id:undo}});setUndo(null);history.invalidate();onSaved();showNotice('Import undone');}catch(e){setError((e as Error).message);setUndo(null);}finally{setBusy(false);}}}/></section>;
}
