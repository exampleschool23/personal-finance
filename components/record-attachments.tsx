"use client";
import { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { Button } from '@/components/ui/button';
import { showError, showSaved } from '@/lib/feedback';
import { formatNumber } from '@/lib/format';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { requestJson, type RequestError } from '@/lib/api-client';
import { attachmentAccept, attachmentErrors, canPreviewAttachment, uploadAttachment, type AttachmentView } from '@/lib/record-attachments';

// Signed links last five minutes; the list renews them before they lapse.
const renewEvery = 4 * 60 * 1000;

async function fetchAttachments(recordId: string, signal: AbortSignal) {
 const response = await fetch('/api/record-attachments?record=' + recordId, { signal, cache: 'no-store' });
 const result = await response.json() as { attachments?: AttachmentView[] };
 if (!response.ok) throw Error();
 return result.attachments ?? [];
}

/** Receipts and documents on one transaction: thumbnails that open full size, an Attach button and removal. */
export function RecordAttachments({ recordId, available, onChange }: { recordId: string; available: boolean; onChange: () => void }) {
 const { t, locale } = useLanguage();
 const [items, setItems] = useState<AttachmentView[]>([]);
 const [state, setState] = useState<'loading' | 'ready' | 'failed'>(available ? 'loading' : 'ready');
 const [uploading, setUploading] = useState(0);
 const [removing, setRemoving] = useState<AttachmentView | null>(null);
 const [busy, setBusy] = useState(false);
 const input = useRef<HTMLInputElement>(null);
 const [revision, setRevision] = useState(0);
 const load = () => setRevision(value => value + 1);
 useEffect(() => {
  if (!available) return;
  const controller = new AbortController();
  const read = () => fetchAttachments(recordId, controller.signal).then(list => { setItems(list); setState('ready'); }, () => { if (!controller.signal.aborted) setState('failed'); });
  void read();
  const timer = setInterval(read, renewEvery);
  return () => { controller.abort(); clearInterval(timer); };
 }, [available, recordId, revision]);

 async function attach(files: FileList | null) {
  const chosen = [...files ?? []];
  if (input.current) input.current.value = '';
  if (!chosen.length) return;
  setUploading(count => count + chosen.length);
  let saved = 0;
  for (const file of chosen) {
   try { await uploadAttachment(file, recordId); saved++; }
   catch (reason) { showError((reason as Error).message || attachmentErrors.unavailable, { detail: file.name }); }
   finally { setUploading(count => count - 1); }
  }
  if (saved) { showSaved(); onChange(); load(); }
 }
 async function remove(item: AttachmentView) {
  setBusy(true);
  try {
   // An attachment that is already gone counts as removed.
   await requestJson('/api/record-attachments', { body: { action: 'delete', data: { id: item.id } }, fallback: 'Could not save changes.' }).catch((reason: RequestError) => { if (reason.status !== 404) throw reason; });
   setItems(previous => previous.filter(entry => entry.id !== item.id));
   setRemoving(null); onChange();
  } catch (reason) { showError((reason as Error).message || 'Could not save changes.'); }
  finally { setBusy(false); }
 }

 const size = (bytes: number) => bytes >= 1048576 ? t('{size} MB', { size: formatNumber(bytes / 1048576, locale, 1) }) : t('{size} KB', { size: formatNumber(Math.max(1, Math.round(bytes / 1024)), locale, 0) });
 return <div className="record-attachments">
  {state === 'failed' ? <InlineError message={t('Could not load attachments.')} onRetry={() => { setState('loading'); load(); }}/>
   : items.length > 0 && <ul className="attachment-grid" aria-label={t('Attachments')}>
    {items.map(item => <li key={item.id} className="attachment-tile">
     <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={t('Open {name}', { name: item.file_name })} aria-disabled={!item.url || undefined}>
      {item.url && canPreviewAttachment(item.mime)
       // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed storage link, not an optimisable asset
       ? <img src={item.url} alt="" loading="lazy"/>
       : <span className="attachment-file"><FileText size={22} aria-hidden="true"/></span>}
      <span className="attachment-name">{item.file_name}</span>
      <small>{size(item.size)}</small>
     </a>
     <Button type="button" variant="ghost" size="icon" className="attachment-remove" aria-label={t('Remove {name}', { name: item.file_name })} onClick={() => setRemoving(item)}><X size={14} aria-hidden="true"/></Button>
    </li>)}
   </ul>}
  {available
   ? <>
    <input ref={input} type="file" accept={attachmentAccept} multiple hidden onChange={event => void attach(event.currentTarget.files)}/>
    <Button type="button" variant="outline" size="sm" disabled={uploading > 0 || state === 'loading'} onClick={() => input.current?.click()}><Paperclip size={14} aria-hidden="true"/>{uploading > 0 ? t('Uploading…') : t('Attach receipt')}</Button>
   </>
   : <p className="muted">{t('Attachments are not available in the sample workspace.')}</p>}
  <ConfirmDialog open={!!removing} busy={busy} onClose={() => setRemoving(null)} destructive title={t('Remove attachment?')} description={t('{name} will be deleted permanently.', { name: removing?.file_name ?? '' })} confirmLabel={t('Remove')} onConfirm={() => removing ? remove(removing) : undefined}/>
 </div>;
}
