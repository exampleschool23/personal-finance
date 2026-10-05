"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { categoryIconGroups } from '@/lib/category-icons';

/** A category's icon as a button that opens the icon choices in groups. Choosing one, or the default, applies it and closes. */
export function CategoryIconPicker({ icon, label, chosen, disabled, onChoose }: { icon: string; label: string; chosen: boolean; disabled?: boolean; onChoose: (icon: string | null) => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const choose = (next: string | null) => { setOpen(false); onChoose(next); };
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="category-icon-button" aria-label={label} title={label} disabled={disabled}><span aria-hidden="true">{icon}</span></button></PopoverTrigger>
  <PopoverContent className="category-icon-picker" align="start">
   {categoryIconGroups.map(group => <section key={group.name}>
    <h4>{t(group.name)}</h4>
    <div className="category-icon-grid">{group.icons.map(item => <button key={item} type="button" aria-label={item} aria-pressed={chosen && item === icon} onClick={() => choose(item)}>{item}</button>)}</div>
   </section>)}
   {chosen && <Button type="button" variant="outline" size="sm" onClick={() => choose(null)}>{t('Use the default icon')}</Button>}
  </PopoverContent>
 </Popover>;
}
