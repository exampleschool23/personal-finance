"use client";
import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { Brand } from '@/components/presentation-foundation/brand';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Button } from '@/components/ui/button';
import { clientError, reportClientError } from '@/lib/client-errors';

export type BoundaryError = Error & { digest?: string };
function ErrorMessage({ reset }: { reset: () => void }) {
 const { t } = useLanguage();
 return <section className="panel"><EmptyState icon={<TriangleAlert aria-hidden="true"/>}>
  <InlineError message={t('Please try again.')} onRetry={reset}/>
  <Button variant="outline" asChild><Link href="/">{t('Open app')}</Link></Button>
 </EmptyState></section>;
}
/** What the error boundaries show: the brand, a retry and a way back, in the visitor's language. The error is
 * reported with Next's digest, which links it to the server log line of the same failure. */
export function ErrorScreen({ error, reset }: { error: BoundaryError; reset: () => void }) {
 useEffect(() => { reportClientError(clientError('boundary', error, window.location.pathname, error.digest)); }, [error]);
 return <LanguageProvider><main className="auth-page"><header className="auth-page-header"><Brand/></header><ErrorMessage reset={reset}/></main></LanguageProvider>;
}
