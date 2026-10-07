"use client";
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = { label: string; onClick?: () => void; disabled?: boolean; className?: string; variant?: 'outline' | 'ghost';
 /** Why this can never be deleted: the bin stays visible but disabled, and the reason shows on hover and is read aloud. */
 reason?: string };

/** Every delete action is a bin: an icon-only button whose label names what it deletes (shown as a tooltip and read aloud). */
export function DeleteButton({ label, onClick, disabled, className, variant = 'outline', reason }: Props) {
 const classes = ['delete-button', className].filter(Boolean).join(' ');
 const bin = <Button type="button" variant={variant} size="icon" className={reason ? 'delete-button' : classes} title={reason ? undefined : label} aria-label={reason ? `${label}. ${reason}` : label} disabled={disabled || !!reason} onClick={onClick}><Trash2 size={16} aria-hidden="true"/></Button>;
 // A disabled button gets no pointer events, so its wrapper carries the tooltip and the footer placement.
 return reason ? <span className={['delete-button-reason', className].filter(Boolean).join(' ')} title={reason}>{bin}</span> : bin;
}
