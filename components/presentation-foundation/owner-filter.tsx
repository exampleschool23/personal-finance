"use client";
import { useState } from 'react';
import { Check, ChevronDown, Users } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { OwnerAvatar } from './person-avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type OwnerOption = { id: string; name: string };

/** Top-level owner filter of a shared household: any mix of its people and what is shared.
 * Nothing selected shows everything. */
export function OwnerFilter({ owners, value, onChange }: { owners: readonly OwnerOption[]; value: readonly string[]; onChange: (value: string[]) => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const chosen = owners.filter(option => value.includes(option.id));
 const label = !chosen.length ? t('All owners') : chosen.length === 1 ? chosen[0].name : t('{count} selected', { count: chosen.length });
 const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="business-filter-trigger" aria-label={t('Filter by owner')} data-active={chosen.length > 0 || undefined}><Users size={16} aria-hidden="true"/><span>{label}</span><ChevronDown size={15} aria-hidden="true"/></button></PopoverTrigger>
  <PopoverContent className="business-filter-popover" align="start">
   <ul role="listbox" aria-multiselectable="true" aria-label={t('Filter by owner')}>
    <li role="option" aria-selected={!chosen.length}><button type="button" onClick={() => onChange([])}><span className="business-filter-all" aria-hidden="true"/><span>{t('All owners')}</span>{!chosen.length && <Check size={15} aria-hidden="true"/>}</button></li>
    {owners.map(option => <li key={option.id} role="option" aria-selected={value.includes(option.id)}>
     <button type="button" onClick={() => toggle(option.id)}><OwnerAvatar owner={option} size="sm"/><span>{option.name}</span>{value.includes(option.id) && <Check size={15} aria-hidden="true"/>}</button>
    </li>)}
   </ul>
  </PopoverContent>
 </Popover>;
}
