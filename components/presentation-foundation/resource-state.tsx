"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';

type Props = { loading: boolean; error?: string | null; onRetry?: () => void; loadingLabel?: string; rows?: number; children: ReactNode };

/** The loading, failed and ready states of one fetched resource, in that order of precedence. */
export function ResourceState({ loading, error, onRetry, loadingLabel, rows = 2, children }: Props) {
 const { t } = useLanguage();
 if (loading) return <LoadingPlaceholder label={loadingLabel ?? t('Loading records…')} rows={rows}/>;
 if (error) return <InlineError message={t(error)} onRetry={onRetry}/>;
 return <>{children}</>;
}
