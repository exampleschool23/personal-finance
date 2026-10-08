"use client";
import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { OwnerAvatar } from '@/components/presentation-foundation/person-avatar';
import type { OwnerOption } from '@/components/presentation-foundation/owner-filter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Entry } from '@/lib/finance';
import type { Category } from '@/lib/planning';
import { categoryChoices, choiceKey, directionOf, type CategoryChoice } from '@/lib/transaction-rules';

type Choice = ReturnType<typeof categoryChoices>[number];

/** The name shown for a transaction's category: a custom category's own name, or the translated kind. */
export function useChoiceName(categories: readonly Category[]) {
 const { t } = useLanguage();
 return (choice: CategoryChoice) => choice.category_id ? categories.find(category => category.id === choice.category_id)?.name ?? t('Custom category') : t(choice.kind);
}

/** A searchable list of one direction's categories. */
export function CategoryList({ categories, removed = [], direction, selected, onSelect }: { categories: readonly Category[]; /** Deleted built-in categories, not offered. */ removed?: readonly string[]; direction: Category['direction']; selected?: string; onSelect: (choice: Choice) => void }) {
 const { t } = useLanguage();
 const [query, setQuery] = useState('');
 const name = (choice: Choice) => choice.custom ? choice.name : t(choice.name);
 const options = categoryChoices(categories, direction, removed).filter(choice => name(choice).toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="category-picker">
  <Input autoFocus placeholder={t('Search categories')} aria-label={t('Search categories')} value={query} onChange={event => setQuery(event.currentTarget.value)}/>
  <p className="category-picker-heading">{t(direction === 'income' ? 'Income' : 'Expenses')}</p>
  <ul role="listbox" aria-label={t('Category')}>
   {options.map(choice => <li key={choiceKey(choice)} role="option" aria-selected={selected === choiceKey(choice)}>
    <button type="button" onClick={() => onSelect(choice)}><CategoryIcon kind={choice.custom ? choice.name : choice.kind} size="sm"/><span>{name(choice)}</span>{selected === choiceKey(choice) && <Check size={15} aria-hidden="true"/>}</button>
   </li>)}
   {!options.length && <li className="category-picker-empty">{t('No categories match.')}</li>}
  </ul>
 </div>;
}

/** A transaction's category as a pill; clicking it opens the category list. */
export function CategoryPicker({ record, categories, removed, disabled, onChange }: { record: Entry; categories: readonly Category[]; removed?: readonly string[]; disabled?: boolean; onChange: (choice: CategoryChoice) => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const direction = directionOf(record.kind) ?? 'expense';
 const choice = { kind: record.kind, category_id: record.custom_category_id ?? null };
 const label = useChoiceName(categories)(choice);
 const pill = <span className="transaction-category"><CategoryIcon kind={record.custom_category_id ? label : record.kind} size="sm"/><span>{label}</span></span>;
 if (disabled) return pill;
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="transaction-category-button" aria-label={t('Change category for {name}', { name: record.name })}>{pill}</button></PopoverTrigger>
  <PopoverContent className="category-picker-popover" align="start">
   <CategoryList categories={categories} removed={removed} direction={direction} selected={choiceKey(choice)} onSelect={next => { setOpen(false); if (choiceKey(next) !== choiceKey(choice) || next.kind !== record.kind) onChange(next); }}/>
  </PopoverContent>
 </Popover>;
}

/** A business choice: one business, or the household (none). */
export function BusinessList({ businesses, selected, onSelect, household = true }: { businesses: readonly BusinessOption[]; selected?: string | null; onSelect: (business: string | null) => void; household?: boolean }) {
 const { t } = useLanguage();
 return <ul className="category-picker business-picker" role="listbox" aria-label={t('Business')}>
  {household && <li role="option" aria-selected={selected === null}><button type="button" onClick={() => onSelect(null)}><span className="business-mark" data-size="sm" aria-hidden="true">🏠</span><span>{t('Household')}</span>{selected === null && <Check size={15} aria-hidden="true"/>}</button></li>}
  {businesses.map(business => <li key={business.id} role="option" aria-selected={selected === business.id}><button type="button" onClick={() => onSelect(business.id)}><BusinessMark name={business.name} color={business.business_color} logo={business.business_logo} size="sm"/><span>{business.name}</span>{selected === business.id && <Check size={15} aria-hidden="true"/>}</button></li>)}
 </ul>;
}

/** A transaction's business as a pill; clicking it opens the business list. Shown only once a business exists. */
export function BusinessPicker({ record, businesses, disabled, onChange }: { record: Entry; businesses: readonly BusinessOption[]; disabled?: boolean; onChange: (business: string | null) => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const business = businesses.find(item => item.id === record.business_id);
 const pill = <span className="transaction-business">{business ? <BusinessMark name={business.name} color={business.business_color} logo={business.business_logo} size="sm"/> : <span className="business-mark" data-size="sm" aria-hidden="true">🏠</span>}<span>{business?.name ?? t('Household')}</span></span>;
 if (disabled || !businesses.length) return pill;
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="transaction-category-button" aria-label={t('Change business for {name}', { name: record.name })}>{pill}</button></PopoverTrigger>
  <PopoverContent className="category-picker-popover" align="start">
   <BusinessList businesses={businesses} selected={record.business_id ?? null} household={record.kind !== 'Business income'} onSelect={next => { setOpen(false); if (next !== (record.business_id ?? null)) onChange(next); }}/>
  </PopoverContent>
 </Popover>;
}

/** The household's owners to choose from, the current one ticked. */
export function OwnerList({ owners, selected, onSelect }: { owners: readonly OwnerOption[]; selected?: string; onSelect: (owner: string) => void }) {
 const { t } = useLanguage();
 return <ul className="category-picker business-picker" role="listbox" aria-label={t('Owner')}>
  {owners.map(owner => <li key={owner.id} role="option" aria-selected={owner.id === selected}><button type="button" onClick={() => onSelect(owner.id)}><OwnerAvatar owner={owner} size="sm"/><span>{owner.name}</span>{owner.id === selected && <Check size={15} aria-hidden="true"/>}</button></li>)}
 </ul>;
}

/** Who a transaction belongs to, as a small avatar; clicking it lists the household to choose from. */
export function OwnerPicker({ record, owner, owners, disabled, onChange }: { record: Entry; owner: OwnerOption; owners: readonly OwnerOption[]; disabled?: boolean; onChange: (owner: string) => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const avatar = <OwnerAvatar size="sm" owner={owner}/>;
 if (disabled) return avatar;
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="transaction-member-button" aria-label={t('Change owner of {name}', { name: record.name })}>{avatar}</button></PopoverTrigger>
  <PopoverContent className="category-picker-popover" align="start">
   <OwnerList owners={owners} selected={owner.id} onSelect={next => { setOpen(false); if (next !== owner.id) onChange(next); }}/>
  </PopoverContent>
 </Popover>;
}

/** A form field's choice as a button that opens its list; `children` gets a way to close it once something is picked. */
export function ChoiceButton({ label, children }: { label: ReactNode; children: (close: () => void) => ReactNode }) {
 const [open, setOpen] = useState(false);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="rule-category-button">{label}</button></PopoverTrigger>
  <PopoverContent className="category-picker-popover" align="start">{children(() => setOpen(false))}</PopoverContent>
 </Popover>;
}

/** A category field: the chosen category (or `placeholder`), and with `clearLabel` a way back to none. */
export function CategoryChoiceButton({ categories, removed, direction, value, placeholder, clearLabel, onChange }: { categories: readonly Category[]; removed?: readonly string[]; direction: Category['direction']; value: CategoryChoice | null; placeholder: string; clearLabel?: string; onChange: (choice: CategoryChoice | null) => void }) {
 const choiceName = useChoiceName(categories);
 const label = value ? <><CategoryIcon kind={value.category_id ? choiceName(value) : value.kind} size="sm"/>{choiceName(value)}</> : placeholder;
 return <ChoiceButton label={label}>{close => <>
  <CategoryList categories={categories} removed={removed} direction={direction} selected={value ? choiceKey(value) : undefined} onSelect={next => { close(); onChange(next); }}/>
  {value && clearLabel && <Button type="button" size="sm" variant="ghost" onClick={() => { close(); onChange(null); }}>{clearLabel}</Button>}
 </>}</ChoiceButton>;
}

/** A business field, shown as `label`; with `clearLabel` a chosen business can be cleared again. */
export function BusinessChoiceButton({ businesses, value, label, household, clearLabel, onChange }: { businesses: readonly BusinessOption[]; value: string | null | undefined; label: ReactNode; household?: boolean; clearLabel?: string; onChange: (business: string | null) => void }) {
 return <ChoiceButton label={label}>{close => <>
  <BusinessList businesses={businesses} household={household} selected={value} onSelect={next => { close(); onChange(next); }}/>
  {value && clearLabel && <Button type="button" size="sm" variant="ghost" onClick={() => { close(); onChange(null); }}>{clearLabel}</Button>}
 </>}</ChoiceButton>;
}
