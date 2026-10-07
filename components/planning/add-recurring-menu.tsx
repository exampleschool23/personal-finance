"use client";
import { Plus } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type RecurringKind = 'income' | 'bill' | 'plan';

/** Recurring's one way to set something up that repeats. Each choice opens a form for a schedule, not for a payment. */
export function AddRecurringMenu({ onAdd }: { onAdd: (kind: RecurringKind) => void }) {
 const { t } = useLanguage();
 return <DropdownMenu>
  <DropdownMenuTrigger asChild><Button><Plus size={16} aria-hidden="true"/>{t('Add recurring')}</Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
   <DropdownMenuItem onSelect={() => onAdd('income')}>{t('Recurring income')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={() => onAdd('bill')}>{t('Recurring bill')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={() => onAdd('plan')}>{t('Monthly spending plan')}</DropdownMenuItem>
  </DropdownMenuContent>
 </DropdownMenu>;
}
