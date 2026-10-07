"use client";
import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Props = {
 open: boolean; onClose: () => void; busy?: boolean;
 title: ReactNode; description: ReactNode; cancelLabel?: string; confirmLabel: ReactNode;
 /** Style the confirming action as destructive. */
 destructive?: boolean;
 /** The action deletes something: destructive, with the bin beside its label. */
 deletes?: boolean;
 /** Shown as a popup while the dialog stays open, so the visitor can retry. */
 error?: string | null;
 onConfirm: () => void | Promise<void>;
};

/** A yes/no question before an action. The dialog stays open while busy and the confirm button never submits a surrounding form. */
export function ConfirmDialog({ open, onClose, busy = false, title, description, cancelLabel, confirmLabel, destructive = false, deletes = false, error, onConfirm }: Props) {
 const { t } = useLanguage();
 return <AlertDialog open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}><AlertDialogContent>
  <AlertDialogTitle>{title}</AlertDialogTitle>
  <AlertDialogDescription>{description}</AlertDialogDescription>
  <ErrorPopup message={error}/>
  <AlertDialogFooter>
   <AlertDialogCancel disabled={busy}>{cancelLabel ?? t('Cancel')}</AlertDialogCancel>
   <AlertDialogAction variant={destructive || deletes ? 'destructive' : 'default'} disabled={busy} onClick={event => { event.preventDefault(); void onConfirm(); }}>{deletes && <Trash2 aria-hidden="true"/>}{confirmLabel}</AlertDialogAction>
  </AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}
