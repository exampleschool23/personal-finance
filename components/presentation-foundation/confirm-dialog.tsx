"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Props = {
 open: boolean; onClose: () => void; busy?: boolean;
 title: ReactNode; description: ReactNode; cancelLabel?: string; confirmLabel: ReactNode;
 /** Style the confirming action as destructive. */
 destructive?: boolean;
 /** Shown as a popup while the dialog stays open, so the visitor can retry. */
 error?: string | null;
 onConfirm: () => void | Promise<void>;
};

/** A yes/no question before an action. The dialog stays open while busy and the confirm button never submits a surrounding form. */
export function ConfirmDialog({ open, onClose, busy = false, title, description, cancelLabel, confirmLabel, destructive = false, error, onConfirm }: Props) {
 const { t } = useLanguage();
 return <AlertDialog open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}><AlertDialogContent>
  <AlertDialogTitle>{title}</AlertDialogTitle>
  <AlertDialogDescription>{description}</AlertDialogDescription>
  <ErrorPopup message={error}/>
  <AlertDialogFooter>
   <AlertDialogCancel disabled={busy}>{cancelLabel ?? t('Cancel')}</AlertDialogCancel>
   <AlertDialogAction className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined} disabled={busy} onClick={event => { event.preventDefault(); void onConfirm(); }}>{confirmLabel}</AlertDialogAction>
  </AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}
