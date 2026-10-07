"use client";
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatNumber } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import { scheduleHistory, type ArchiveTarget } from '@/lib/recurring';


/** Deleting a schedule or spending plan from Recurring. When payments were recorded against it, the person chooses
 * whether they stay in history or are deleted too; otherwise it is a plain yes or no. Either way everything can be restored from Recently deleted. */
export function DeleteScheduleDialog({ target, history, onDelete, onClose }: { target: ArchiveTarget | null; history: number; onDelete: (removeHistory: boolean) => Promise<void>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const name = target ? target.source === 'plan' ? target.plan.name : target.record.name : '';
 async function remove(removeHistory: boolean) {
  setBusy(true); setError('');
  try { await onDelete(removeHistory); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
 }
 const action = (label: string, removeHistory: boolean, variant: 'outline' | 'destructive') => <AlertDialogAction variant={variant} disabled={busy} onClick={event => { event.preventDefault(); void remove(removeHistory); }}><Trash2 aria-hidden="true"/>{t(label)}</AlertDialogAction>;
 return <AlertDialog open={!!target} onOpenChange={next => { if (!next && !busy) { setError(''); onClose(); } }}><AlertDialogContent>
  <AlertDialogTitle>{t('Delete {name}?', { name })}</AlertDialogTitle>
  <AlertDialogDescription>{history > 0
   ? t('Payments recorded for it: {count}. Keep them in your history, or delete them too? Deleting them also reverses their account balances. You can restore everything from Recently deleted.', { count: formatNumber(history, locale, 0) })
   : t('It moves to Recently deleted, where you can restore it.')}</AlertDialogDescription>
  <ErrorPopup message={error}/>
  <AlertDialogFooter>
   <AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel>
   {history > 0 ? <>{action('Delete, keep history', false, 'outline')}{action('Delete with history', true, 'destructive')}</> : action('Delete', false, 'destructive')}
  </AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}

/** Delete on Recurring: `open` (absent where deleting is not offered) asks about a schedule or plan, and `dialog` is the question, counting the payments recorded against it. */
export function useScheduleDeletion(data: Pick<PlanningData, 'records' | 'occurrences'>, onDelete?: (target: ArchiveTarget, removeHistory: boolean) => Promise<void>) {
 const [target, setTarget] = useState<ArchiveTarget | null>(null);
 const history = target ? scheduleHistory(target, data.records, data.occurrences).length : 0;
 const dialog = onDelete && <DeleteScheduleDialog target={target} history={history} onDelete={removeHistory => onDelete(target!, removeHistory)} onClose={() => setTarget(null)}/>;
 return { open: onDelete && setTarget, dialog };
}
