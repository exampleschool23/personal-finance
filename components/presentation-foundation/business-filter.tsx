"use client";
import { useState } from 'react';
import { Briefcase, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { BusinessMark } from './business-mark';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HOUSEHOLD } from '@/lib/business';

export type BusinessOption = { id: string; name: string; business_color?: string | null; business_logo?: string | null };

/** Top-level business filter: any mix of businesses and the household (everything without a business).
 * Nothing selected shows everything. */
export function BusinessFilter({ businesses, value, onChange, household = true }: { businesses: readonly BusinessOption[]; value: readonly string[]; onChange: (value: string[]) => void; household?: boolean }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const options = [...(household ? [{ id: HOUSEHOLD, name: t('Household') }] : []), ...businesses];
 const chosen = options.filter(option => value.includes(option.id));
 const label = !chosen.length ? t('All businesses') : chosen.length === 1 ? chosen[0].name : t('{count} selected', { count: chosen.length });
 const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="business-filter-trigger" aria-label={t('Filter by business')} data-active={chosen.length > 0 || undefined}><Briefcase size={16} aria-hidden="true"/><span>{label}</span><ChevronDown size={15} aria-hidden="true"/></button></PopoverTrigger>
  <PopoverContent className="business-filter-popover" align="start">
   <ul role="listbox" aria-multiselectable="true" aria-label={t('Filter by business')}>
    <li role="option" aria-selected={!chosen.length}><button type="button" onClick={() => onChange([])}><span className="business-filter-all" aria-hidden="true"/><span>{t('All businesses and household')}</span>{!chosen.length && <Check size={15} aria-hidden="true"/>}</button></li>
    {options.map(option => <li key={option.id} role="option" aria-selected={value.includes(option.id)}>
     <button type="button" onClick={() => toggle(option.id)}>{option.id === HOUSEHOLD ? <span className="business-mark" data-size="sm" aria-hidden="true">🏠</span> : <BusinessMark name={option.name} color={'business_color' in option ? option.business_color : null} logo={'business_logo' in option ? option.business_logo : null} size="sm"/>}<span>{option.name}</span>{value.includes(option.id) && <Check size={15} aria-hidden="true"/>}</button>
    </li>)}
   </ul>
  </PopoverContent>
 </Popover>;
}
