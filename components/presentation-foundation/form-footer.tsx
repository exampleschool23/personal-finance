"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';

type Props = { busy?: boolean; onCancel: () => void; cancelLabel?: string; children?: ReactNode };

/** The closing row of a dialog form: a Cancel button that respects the busy state, then the form's own actions. */
export function FormFooter({ busy = false, onCancel, cancelLabel, children }: Props) {
 const { t } = useLanguage();
 return <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel ?? t('Cancel')}</Button>{children}</div>;
}
