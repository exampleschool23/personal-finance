"use client";
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Explanatory copy behind a small ⓘ next to a heading, so headings stay one clean line. */
export function InfoHint({ children, label }: { children: ReactNode; label?: string }) {
 const { t } = useLanguage();
 return <Popover>
  <PopoverTrigger className="info-hint" aria-label={label ?? t('Details')}><Info aria-hidden="true"/></PopoverTrigger>
  <PopoverContent className="info-hint-content" align="start">{children}</PopoverContent>
 </Popover>;
}
