"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';

type Props = { label: string; summary: ReactNode; page: number; hasNext: boolean; disabled?: boolean; onPage: (page: number) => void };

/** Previous / Next under a paged list. Renders nothing when there is no other page to go to, so empty and one-page lists stay clean. */
export function Pagination({ label, summary, page, hasNext, disabled = false, onPage }: Props) {
 const { t } = useLanguage();
 if (page <= 1 && !hasNext) return null;
 return <nav className="records-pagination" aria-label={label}><span>{summary}</span><div>
  <Button variant="outline" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>{t('Previous')}</Button>
  <Button variant="outline" disabled={disabled || !hasNext} onClick={() => onPage(page + 1)}>{t('Next')}</Button>
 </div></nav>;
}
