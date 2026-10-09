"use client";
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { formatNumber } from '@/lib/format';

/** The page buttons to show: the first and last page, the current one with a neighbour either side, and a gap for the rest. */
export function pageNumbers(page: number, count: number): Array<number | 'gap'> {
 if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
 const start = Math.max(2, Math.min(page - 1, count - 4)), end = Math.min(count - 1, Math.max(page + 1, 5));
 return [1, ...(start > 2 ? ['gap' as const] : []), ...Array.from({ length: end - start + 1 }, (_, index) => start + index), ...(end < count - 1 ? ['gap' as const] : []), count];
}

type Props = { label: string; summary: ReactNode; page: number; /** Total pages when known; a list read a page at a time passes only `hasNext`. */ pageCount?: number; hasNext: boolean; disabled?: boolean; onPage: (page: number) => void };

/** Numbered pages (‹ 1 2 3 … 9 ›) under a paged list. Renders nothing when there is no other page to go to, so empty and one-page lists stay clean. */
export function Pagination({ label, summary, page, pageCount, hasNext, disabled = false, onPage }: Props) {
 const { t, locale } = useLanguage();
 const count = pageCount ?? (hasNext ? page + 1 : page);
 if (page <= 1 && !hasNext) return null;
 return <nav className="records-pagination" aria-label={label}><span>{summary}</span><div>
  <button type="button" className="page-step" aria-label={t('Previous')} disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} aria-hidden="true"/></button>
  {pageNumbers(page, count).map((item, index) => item === 'gap' ? <span key={'gap' + index} className="page-gap" aria-hidden="true">…</span>
   : <button type="button" key={item} className="page-number" aria-label={t('Page {page}', { page: formatNumber(item, locale, 0) })} aria-current={item === page ? 'page' : undefined} disabled={disabled && item !== page} onClick={() => item !== page && onPage(item)}>{formatNumber(item, locale, 0)}</button>)}
  <button type="button" className="page-step" aria-label={t('Next')} disabled={disabled || !hasNext} onClick={() => onPage(page + 1)}><ChevronRight size={16} aria-hidden="true"/></button>
 </div></nav>;
}
