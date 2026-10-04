"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';

/** A failure that qualifies what a panel shows, with a Retry button when the load can be repeated.
 * Retry never submits a surrounding form. */
export function InlineError({ message, onRetry, className, as: Tag = 'p', children }: { message: ReactNode; onRetry?: () => void; className?: string; as?: 'p' | 'div'; children?: ReactNode }) {
 const { t } = useLanguage();
 return <Tag role="alert" className={className ? `error ${className}` : 'error'}>{message} {onRetry && <Button type="button" onClick={onRetry}>{t('Retry')}</Button>}{children}</Tag>;
}
