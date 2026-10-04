"use client";
import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { TagChip } from '@/components/presentation-foundation/tag-chip';
import { OwnerAvatar } from '@/components/presentation-foundation/person-avatar';
import type { OwnerOption } from '@/components/presentation-foundation/owner-filter';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { shiftDay } from '@/lib/calendar-days';
import { income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber, formatSignedMoney } from '@/lib/format';
import { isMortgagePayment, spendingAmount, transferAmount } from '@/lib/spending';
import { signedAmount } from '@/lib/transaction-list';
import type { Category } from '@/lib/planning';
import { categoryChoices, choiceKey, directionOf, extraCriteria, hasCriteria, openCriteria, ruleChoice, ruleCriterion, ruleTargets, suggestedPattern, type CategoryChoice, type TransactionRule } from '@/lib/transaction-rules';
import type { Tag, TagMatch } from '@/lib/tags';

type Choice = ReturnType<typeof categoryChoices>[number];

/** The name shown for a transaction's category: a custom category's own name, or the translated kind. */
export function useChoiceName(categories: readonly Category[]) {
 const { t } = useLanguage();
 return (choice: CategoryChoice) => choice.category_id ? categories.find(category => category.id === choice.category_id)?.name ?? t('Custom category') : t(choice.kind);
}

/** A searchable list of one direction's categories. */
function CategoryList({ categories, direction, selected, onSelect }: { categories: readonly Category[]; direction: Category['direction']; selected?: string; onSelect: (choice: Choice) => void }) {
 const { t } = useLanguage();
 const [query, setQuery] = useState('');
 const name = (choice: Choice) => choice.custom ? choice.name : t(choice.name);
 const options = categoryChoices(categories, direction).filter(choice => name(choice).toLowerCase().includes(query.trim().toLowerCase()));
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
export function CategoryPicker({ record, categories, disabled, onChange }: { record: Entry; categories: readonly Category[]; disabled?: boolean; onChange: (choice: CategoryChoice) => void }) {
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
   <CategoryList categories={categories} direction={direction} selected={choiceKey(choice)} onSelect={next => { setOpen(false); if (choiceKey(next) !== choiceKey(choice) || next.kind !== record.kind) onChange(next); }}/>
  </PopoverContent>
 </Popover>;
}

/** The Edit multiple bar: how many are selected, and the drawer that changes their fields together. */
export function BulkEditBar({ count, total, onAll, onEdit, onCancel }: { count: number; total: number; onAll: (select: boolean) => void; onEdit: () => void; onCancel: () => void }) {
 const { t } = useLanguage();
 return <div className="bulk-bar" role="region" aria-label={t('Edit multiple')}>
  <strong>{t('{count} selected', { count })}</strong>
  <Button size="sm" variant="outline" disabled={!total} onClick={() => onAll(count < total)}>{t(total > 0 && count >= total ? 'Clear selection' : 'Select all')}</Button>
  <Button size="sm" disabled={!count} onClick={onEdit}>{t('Edit {count}', { count })}</Button>
  <Button size="sm" variant="outline" onClick={onCancel}>{t('Done')}</Button>
 </div>;
}

/** A business choice: one business, or the household (none). */
function BusinessList({ businesses, selected, onSelect, household = true }: { businesses: readonly BusinessOption[]; selected?: string | null; onSelect: (business: string | null) => void; household?: boolean }) {
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
function OwnerList({ owners, selected, onSelect }: { owners: readonly OwnerOption[]; selected?: string; onSelect: (owner: string) => void }) {
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

/** Tags to switch on and off, and a quick way to create one. `onCreate` resolves to the new tag's id. */
/** Top-level tag filter: any number of tags (none shows everything); with two or more, rows need any of them or all of them. */
export function TagFilter({ tags, value, match, onChange }: { tags: readonly Tag[]; value: readonly string[]; match: TagMatch; onChange: (value: string[], match: TagMatch) => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const chosen = tags.filter(tag => value.includes(tag.id));
 const label = !chosen.length ? t('All tags') : chosen.length === 1 ? chosen[0].name : t(match === 'all' ? 'All of {count} tags' : 'Any of {count} tags', { count: chosen.length });
 const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id], match);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="business-filter-trigger" aria-label={t('Filter by tag')} data-active={chosen.length > 0 || undefined}><TagIcon size={16} aria-hidden="true"/><span>{label}</span><ChevronDown size={15} aria-hidden="true"/></button></PopoverTrigger>
  <PopoverContent className="business-filter-popover" align="start">
   {chosen.length > 1 && <Segmented className="tag-filter-match" label={t('Match tags')} options={[{ value: 'any', label: t('Any tag') }, { value: 'all', label: t('Every tag') }] as const} value={match} onChange={next => onChange([...value], next)}/>}
   <ul role="listbox" aria-multiselectable="true" aria-label={t('Filter by tag')}>
    <li role="option" aria-selected={!chosen.length}><button type="button" onClick={() => onChange([], match)}><span className="business-filter-all" aria-hidden="true"/><span>{t('All tags')}</span>{!chosen.length && <Check size={15} aria-hidden="true"/>}</button></li>
    {tags.map(tag => <li key={tag.id} role="option" aria-selected={value.includes(tag.id)}>
     <button type="button" onClick={() => toggle(tag.id)}><TagChip name={tag.name} color={tag.color}/>{value.includes(tag.id) && <Check size={15} aria-hidden="true"/>}</button>
    </li>)}
   </ul>
  </PopoverContent>
 </Popover>;
}

export function TagSelector({ tags, selected, onToggle, onCreate }: { tags: readonly Tag[]; selected: readonly string[]; onToggle: (id: string) => void; onCreate?: (name: string) => Promise<string> }) {
 const { t } = useLanguage();
 const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function create() {
  const value = name.trim();
  if (!value || !onCreate || busy) return;
  const existing = tags.find(tag => tag.name.trim().toLowerCase() === value.toLowerCase());
  if (existing) { if (!selected.includes(existing.id)) onToggle(existing.id); setName(''); return; }
  setBusy(true); setError('');
  try { onToggle(await onCreate(value)); setName(''); } catch (reason) { setError(t((reason as Error).message)); } finally { setBusy(false); }
 }
 return <div className="tag-selector">
  {tags.length ? <ul aria-label={t('Tags')}>{tags.map(tag => <li key={tag.id}><button type="button" aria-pressed={selected.includes(tag.id)} onClick={() => onToggle(tag.id)}><TagChip name={tag.name} color={tag.color}>{selected.includes(tag.id) && <Check size={13} aria-hidden="true"/>}</TagChip></button></li>)}</ul> : <p className="muted">{t('No tags yet.')}</p>}
  {onCreate && <div className="tag-selector-new"><Input placeholder={t('New tag')} aria-label={t('New tag')} maxLength={60} value={name} disabled={busy} onChange={event => setName(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }}/><Button type="button" size="sm" variant="outline" disabled={busy || !name.trim()} onClick={() => void create()}><Plus size={15} aria-hidden="true"/>{t('Add')}</Button></div>}
  {error && <p className="form-error" role="alert">{error}</p>}
 </div>;
}

/** Edit multiple drawer: change the category, the business, the owner and the tags of the selected transactions together.
 * Fields left as they are stay unchanged on every transaction. */
export function BulkEditSheet({ records, categories, businesses, owners = [], tags, tagsOf, onCreateTag, onSave, onClose }: { records: Entry[]; categories: readonly Category[]; businesses: readonly BusinessOption[]; /** The household's owners, in a shared workspace. */ owners?: readonly OwnerOption[]; tags: readonly Tag[]; tagsOf: (id: string) => readonly string[]; onCreateTag?: (name: string) => Promise<string>; onSave: (change: { choice: CategoryChoice | null; business: string | null | undefined; owner: string | undefined; add: string[]; remove: string[] }) => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const directions = new Set(records.map(record => directionOf(record.kind)));
 const direction = directions.size === 1 ? [...directions][0] : null;
 const [choice, setChoice] = useState<CategoryChoice | null>(null);
 const [business, setBusiness] = useState<string | null | undefined>(undefined);
 const [add, setAdd] = useState<string[]>([]), [remove, setRemove] = useState<string[]>([]);
 const [owner, setOwner] = useState<string | undefined>(undefined);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [picking, setPicking] = useState<'category' | 'business' | 'owner' | null>(null);
 const choiceName = useChoiceName(categories);
 const shared = tags.filter(tag => records.length > 0 && records.every(record => tagsOf(record.id).includes(tag.id))).map(tag => tag.id);
 const changed = !!choice || business !== undefined || owner !== undefined || add.length > 0 || remove.length > 0;
 const chosenOwner = owners.find(item => item.id === owner);
 const businessName = business === undefined ? t('Leave unchanged') : business === null ? t('Household') : businesses.find(item => item.id === business)?.name ?? '';
 return <Sheet open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <SheetContent className="bulk-edit-sheet" aria-describedby={undefined}>
   <SheetHeader><SheetTitle>{t('Edit {count} transactions', { count: records.length })}</SheetTitle></SheetHeader>
   <form className="bulk-edit-form" onSubmit={async event => { event.preventDefault(); if (!changed) return; setBusy(true); setError(''); try { await onSave({ choice, business, owner, add, remove }); onClose(); } catch (reason) { setError(t((reason as Error).message || 'Could not save changes.')); } finally { setBusy(false); } }}>
    <fieldset disabled={busy}>
     <div className="budget-dialog-label">{t('Category')}
      {direction ? <Popover open={picking === 'category'} onOpenChange={open => setPicking(open ? 'category' : null)}>
       <PopoverTrigger asChild><button type="button" className="rule-category-button">{choice ? <><CategoryIcon kind={choice.category_id ? choiceName(choice) : choice.kind} size="sm"/>{choiceName(choice)}</> : t('Leave unchanged')}</button></PopoverTrigger>
       <PopoverContent className="category-picker-popover" align="start"><CategoryList categories={categories} direction={direction} selected={choice ? choiceKey(choice) : undefined} onSelect={value => { setPicking(null); setChoice(value); }}/></PopoverContent>
      </Popover> : <span className="bulk-bar-note">{t('Select only income or only expenses to change their category together.')}</span>}
     </div>
     {businesses.length > 0 && <div className="budget-dialog-label">{t('Business')}
      <Popover open={picking === 'business'} onOpenChange={open => setPicking(open ? 'business' : null)}>
       <PopoverTrigger asChild><button type="button" className="rule-category-button">{businessName}</button></PopoverTrigger>
       <PopoverContent className="category-picker-popover" align="start"><BusinessList businesses={businesses} selected={business} onSelect={value => { setPicking(null); setBusiness(value); }}/></PopoverContent>
      </Popover>
     </div>}
     {owners.length > 0 && <div className="budget-dialog-label">{t('Owner')}
      <Popover open={picking === 'owner'} onOpenChange={open => setPicking(open ? 'owner' : null)}>
       <PopoverTrigger asChild><button type="button" className="rule-category-button">{chosenOwner ? <><OwnerAvatar owner={chosenOwner} size="sm"/>{chosenOwner.name}</> : t('Leave unchanged')}</button></PopoverTrigger>
       <PopoverContent className="category-picker-popover" align="start"><OwnerList owners={owners} selected={owner} onSelect={value => { setPicking(null); setOwner(value); }}/></PopoverContent>
      </Popover>
     </div>}
     <div className="budget-dialog-label">{t('Add tags')}<TagSelector tags={tags} selected={add} onToggle={id => { setAdd(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id]); setRemove(list => list.filter(item => item !== id)); }} onCreate={onCreateTag}/></div>
     {shared.length > 0 && <div className="budget-dialog-label">{t('Remove tags')}<TagSelector tags={tags.filter(tag => shared.includes(tag.id))} selected={remove} onToggle={id => { setRemove(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id]); setAdd(list => list.filter(item => item !== id)); }}/></div>}
     {error && <p className="form-error" role="alert">{error}</p>}
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy || !changed}>{t(busy ? 'Saving…' : 'Apply changes')}</Button></FormFooter>
   </form>
  </SheetContent>
 </Sheet>;
}

/** One day: its date and net total in the heading, its transactions below. */
export function DayGroup({ date, total, currency, today, children }: { date: string; total: number | null; currency: string; today: string; children: ReactNode }) {
 const { t, locale } = useLanguage();
 const yesterday = shiftDay(today, -1);
 const label = date === today ? t('Today') : date === yesterday ? t('Yesterday') : formatDate(date, locale);
 return <section className="transaction-day" aria-label={label}>
  <div className="transaction-day-heading"><h3>{label}</h3><span className={total !== null && total > 0 ? 'positive' : undefined}>{total === null ? '—' : formatSignedMoney(total, currency, locale)}</span></div>
  <ul>{children}</ul>
 </section>;
}

/** A mortgage payment's split: the principal is a transfer to the debt, the interest is spending. */
export function MortgageSplit({ record }: { record: Entry }) {
 const { t, locale } = useLanguage();
 if (!isMortgagePayment(record)) return null;
 return <small>{t('Mortgage payment · Principal: {principal} · Interest: {interest}', { principal: formatMoney(transferAmount(record), record.currency, locale), interest: formatMoney(spendingAmount(record), record.currency, locale) })}</small>;
}

/** The row's signed amount by the shared spending definition (`lib/spending.ts`): a mortgage payment shows its interest. */
export function TransactionAmount({ record }: { record: Entry }) {
 const { locale } = useLanguage();
 const incoming = income.includes(record.kind);
 return <strong className={incoming ? 'transaction-amount positive' : 'transaction-amount'}>{formatSignedMoney(signedAmount(record), record.currency, locale)}</strong>;
}

/** What a rule does, in words: its category, business and tags. */
function RuleActionsSummary({ rule, categories, businesses = [], tags = [] }: { rule: TransactionRule; categories: readonly Category[]; businesses?: readonly BusinessOption[]; tags?: readonly Tag[] }) {
 const { t } = useLanguage();
 const choiceName = useChoiceName(categories);
 const choice = ruleChoice(rule), business = businesses.find(item => item.id === rule.business_id);
 return <span className="rule-actions">
  {choice && <span className="transaction-category"><CategoryIcon kind={choice.category_id ? choiceName(choice) : choice.kind} size="sm"/><span>{choiceName(choice)}</span></span>}
  {business && <span className="transaction-business"><BusinessMark name={business.name} color={business.business_color} logo={business.business_logo} size="sm"/><span>{business.name}</span></span>}
  {(rule.tag_ids ?? []).map(id => tags.find(tag => tag.id === id)).filter((tag): tag is Tag => !!tag).map(tag => <TagChip key={tag.id} name={tag.name} color={tag.color}/>)}
  {!choice && !business && !rule.tag_ids?.length && <span className="muted">{t('No changes')}</span>}
 </span>;
}

/** What a rule matches, in words: its name test and how many other conditions it sets. */
function useRuleCriteriaText() {
 const { t, locale } = useLanguage();
 return (rule: TransactionRule) => {
  const name = rule.pattern.trim() ? t(rule.match === 'exact' ? 'Name is “{pattern}”' : 'Name contains “{pattern}”', { pattern: rule.pattern }) : t('Any name');
  const extra = extraCriteria(rule);
  return extra ? `${name} · ${t('+{count} conditions', { count: formatNumber(extra, locale, 0) })}` : name;
 };
}

/** Create or edit a rule: what a transaction must match (its name and, behind "More conditions", an account, a
 * category, a business and an amount range) and what the rule then sets (category, business, tags), optionally
 * applied to past transactions. */
export function RuleDialog({ rule, records, categories, businesses, accounts = [], tags, splits, tagsOf, onCreateTag, onSave, onClose }: { rule: TransactionRule; records?: Entry[]; categories: readonly Category[]; businesses: readonly BusinessOption[]; accounts?: ReadonlyArray<{ id: string; name: string }>; tags: readonly Tag[]; splits: Parameters<typeof ruleTargets>[2]; tagsOf: (id: string) => readonly string[]; onCreateTag?: (name: string) => Promise<string>; onSave: (rule: TransactionRule, apply: boolean) => Promise<number>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [pattern, setPattern] = useState(rule.pattern), [match, setMatch] = useState(rule.match);
 const [direction, setDirection] = useState<TransactionRule['direction']>(rule.direction);
 const [account, setAccount] = useState(rule.account_id), [inBusiness, setInBusiness] = useState(rule.match_business_id);
 const [criterion, setCriterion] = useState<CategoryChoice | null>(ruleCriterion(rule));
 const [amountMin, setAmountMin] = useState(rule.amount_min), [amountMax, setAmountMax] = useState(rule.amount_max);
 const [choice, setChoice] = useState<CategoryChoice | null>(ruleChoice(rule));
 const [business, setBusiness] = useState<string | null>(rule.business_id);
 const [tagIds, setTagIds] = useState<string[]>(rule.tag_ids);
 const [apply, setApply] = useState(true);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [picking, setPicking] = useState<'category' | 'business' | 'criterion' | null>(null);
 // A category belongs to one direction, so a rule for both directions neither requires nor sets one.
 const ofDirection = (value: CategoryChoice | null) => direction === 'any' ? null : value && directionOf(value.kind) === direction ? value : null;
 const category = ofDirection(choice), required = ofDirection(criterion);
 const next: TransactionRule = { ...rule, pattern: pattern.trim(), match, direction, account_id: account, match_business_id: inBusiness, match_kind: required?.kind ?? null, match_category_id: required?.category_id ?? null, amount_min: amountMin, amount_max: amountMax, kind: category?.kind ?? null, category_id: category?.category_id ?? null, business_id: business, tag_ids: tagIds };
 const rangeValid = amountMax === null || amountMax >= (amountMin ?? 0);
 const valid = hasCriteria(next) && rangeValid && (!!next.kind || !!next.business_id || next.tag_ids.length > 0);
 // Without the transactions at hand (Settings), the count is left to the database.
 const matches = records && valid ? ruleTargets(next, records, splits, tagsOf).length : null;
 const choiceName = useChoiceName(categories);
 const businessRecord = businesses.find(item => item.id === business);
 const extra = extraCriteria(next);
 const amount = (value: number | null, set: (value: number | null) => void, label: string) => <label>{t(label)}<FormattedNumberInput value={value ?? 0} required={false} ariaLabel={t(label)} placeholder="" onValueChange={(typed, blank) => set(blank ? null : typed)}/></label>;
 return <Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
  <DialogContent className="budget-dialog rule-dialog">
   <DialogTitle>{t('Rule')}</DialogTitle>
   <form onSubmit={async event => { event.preventDefault(); if (!valid) return; setBusy(true); setError(''); try { await onSave(next, apply); onClose(); } catch (reason) { setError(t((reason as Error).message)); } finally { setBusy(false); } }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     <div className="rule-columns"><div className="rule-column">
     <div className="budget-dialog-label">{t('When the name')}
      <div className="rule-name-criterion">
       <NativeSelect aria-label={t('Name match')} value={match} onChange={event => setMatch(event.currentTarget.value as TransactionRule['match'])}><option value="contains">{t('Contains')}</option><option value="exact">{t('Is exactly')}</option></NativeSelect>
       <Input aria-label={t('Name')} required={!extra} maxLength={120} value={pattern} onChange={event => setPattern(event.currentTarget.value)}/>
      </div>
     </div>
     <div className="budget-dialog-label">{t('Applies to')}<Segmented label={t('Applies to')} options={[{ value: 'expense', label: t('Expenses') }, { value: 'income', label: t('Income') }, { value: 'any', label: t('Both') }] as const} value={direction} onChange={setDirection}/></div>
     <details className="rule-more" open={extraCriteria(rule) > 0 || undefined}>
      <summary>{t('More conditions')}{extra > 0 && <Count value={extra}/>}</summary>
      {accounts.length > 0 && <label className="budget-dialog-label">{t('Account')}<NativeSelect value={account ?? ''} onChange={event => setAccount(event.currentTarget.value || null)}><option value="">{t('Any account')}</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>}
      {direction !== 'any' && <div className="budget-dialog-label">{t('Category')}
       <Popover open={picking === 'criterion'} onOpenChange={open => setPicking(open ? 'criterion' : null)}>
        <PopoverTrigger asChild><button type="button" className="rule-category-button">{required ? <><CategoryIcon kind={required.category_id ? choiceName(required) : required.kind} size="sm"/>{choiceName(required)}</> : t('Any category')}</button></PopoverTrigger>
        <PopoverContent className="category-picker-popover" align="start"><CategoryList categories={categories} direction={direction} selected={required ? choiceKey(required) : undefined} onSelect={value => { setPicking(null); setCriterion(value); }}/>{required && <Button type="button" size="sm" variant="ghost" onClick={() => { setPicking(null); setCriterion(null); }}>{t('Any category')}</Button>}</PopoverContent>
       </Popover>
      </div>}
      {businesses.length > 0 && <label className="budget-dialog-label">{t('Business')}<NativeSelect value={inBusiness ?? ''} onChange={event => setInBusiness(event.currentTarget.value || null)}><option value="">{t('Any business')}</option>{businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>}
      <div className="budget-dialog-label">{t('Amount')}<div className="rule-amount-range">{amount(amountMin, setAmountMin, 'From')}{amount(amountMax, setAmountMax, 'To')}</div>{!rangeValid && <span className="form-error" role="alert">{t('The upper amount must not be below {amount}.', { amount: formatNumber(amountMin ?? 0, locale) })}</span>}</div>
     </details>
     </div><div className="rule-column">
     {direction !== 'any' && <div className="budget-dialog-label">{t('Set the category to')}
      <Popover open={picking === 'category'} onOpenChange={open => setPicking(open ? 'category' : null)}>
       <PopoverTrigger asChild><button type="button" className="rule-category-button">{category ? <><CategoryIcon kind={category.category_id ? choiceName(category) : category.kind} size="sm"/>{choiceName(category)}</> : t('Leave unchanged')}</button></PopoverTrigger>
       <PopoverContent className="category-picker-popover" align="start"><CategoryList categories={categories} direction={direction} selected={category ? choiceKey(category) : undefined} onSelect={value => { setPicking(null); setChoice(value); }}/>{category && <Button type="button" size="sm" variant="ghost" onClick={() => { setPicking(null); setChoice(null); }}>{t('Leave unchanged')}</Button>}</PopoverContent>
      </Popover>
     </div>}
     {businesses.length > 0 && <div className="budget-dialog-label">{t('Set the business to')}
      <Popover open={picking === 'business'} onOpenChange={open => setPicking(open ? 'business' : null)}>
       <PopoverTrigger asChild><button type="button" className="rule-category-button">{businessRecord ? <><BusinessMark name={businessRecord.name} color={businessRecord.business_color} logo={businessRecord.business_logo} size="sm"/>{businessRecord.name}</> : t('Leave unchanged')}</button></PopoverTrigger>
       <PopoverContent className="category-picker-popover" align="start"><BusinessList businesses={businesses} household={false} selected={business} onSelect={value => { setPicking(null); setBusiness(value); }}/>{business && <Button type="button" size="sm" variant="ghost" onClick={() => { setPicking(null); setBusiness(null); }}>{t('Leave unchanged')}</Button>}</PopoverContent>
      </Popover>
     </div>}
     <div className="budget-dialog-label">{t('Add tags')}<TagSelector tags={tags} selected={tagIds} onToggle={id => setTagIds(list => list.includes(id) ? list.filter(item => item !== id) : list.length >= 10 ? list : [...list, id])} onCreate={onCreateTag}/></div>
     </div></div>
     <label className="budget-check"><input type="checkbox" checked={apply} onChange={event => setApply(event.currentTarget.checked)}/><span><strong>{matches === null ? t('Apply to matching past transactions') : t('Apply to {count} matching transactions', { count: formatNumber(matches, locale, 0) })}</strong><small>{t('New bank statement imports follow the rule too. Categories you choose by hand are kept.')}</small></span></label>
     {error && <p className="form-error" role="alert">{error}</p>}
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy || !valid}>{t(busy ? 'Saving…' : 'Save rule')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}

/** Saved rules as rows: what each matches and what it sets. Clicking a row edits it. */
function ruleList({ rules, categories, businesses, tags, onEdit }: RulesProps, t: ReturnType<typeof useLanguage>['t'], criteria: (rule: TransactionRule) => string, onDelete: (rule: TransactionRule) => void) {
 return rules.length ? <ul className="rule-list">{rules.map(rule => <li key={rule.id}>
  <button type="button" onClick={() => onEdit(rule)}><span>{criteria(rule)}</span><span className="rule-arrow" aria-hidden="true">→</span><RuleActionsSummary rule={rule} categories={categories} businesses={businesses} tags={tags}/></button>
  <Button size="icon" variant="ghost" aria-label={t('Delete {name}', { name: criteria(rule) })} onClick={() => onDelete(rule)}><Trash2 size={15}/></Button>
 </li>)}</ul> : <p className="budget-left-empty">{t('No rules yet. Change a transaction’s category or business and choose Create rule, or add one here.')}</p>;
}

/** Deleting a rule asks first; the transactions it changed keep their changes. */
function useRuleRemoval(onRemove: (rule: TransactionRule) => Promise<void>) {
 const { t } = useLanguage();
 const criteria = useRuleCriteriaText();
 const [deleting, setDeleting] = useState<TransactionRule | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function remove() {
  if (!deleting || busy) return;
  setBusy(true); setError('');
  try { await onRemove(deleting); setDeleting(null); }
  catch (reason) { setError((reason as Error).message); }
  finally { setBusy(false); }
 }
 const ask = (rule: TransactionRule) => { setError(''); setDeleting(rule); };
 const dialog = <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} busy={busy} destructive error={error} title={t('Delete {name}?', { name: deleting ? criteria(deleting) : '' })} description={t('New transactions will no longer follow this rule. Transactions it already changed keep their changes.')} confirmLabel={t(busy ? 'Deleting…' : 'Delete rule')} onConfirm={remove}/>;
 return { ask, dialog, criteria };
}

type RulesProps = { rules: TransactionRule[]; categories: readonly Category[]; businesses?: readonly BusinessOption[]; tags?: readonly Tag[]; onEdit: (rule: TransactionRule) => void; onAdd: () => void; onRemove: (rule: TransactionRule) => Promise<void> };
/** Every saved rule, with a way to add, edit or remove one. */
export function RulesDialog({ onClose, ...props }: RulesProps & { onClose: () => void }) {
 const { t } = useLanguage();
 const removal = useRuleRemoval(props.onRemove);
 return <><Dialog open onOpenChange={value => { if (!value) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle>{t('Rules')}</DialogTitle>
   {ruleList(props, t, removal.criteria, removal.ask)}
   <div className="record-form-footer"><Button onClick={props.onAdd}><Plus size={16} aria-hidden="true"/>{t('Add rule')}</Button></div>
  </DialogContent>
 </Dialog>
 {removal.dialog}</>;
}

/** Settings › Rules: the same list as a panel. */
export function RulesPanel(props: RulesProps) {
 const { t } = useLanguage();
 const removal = useRuleRemoval(props.onRemove);
 return <section className="panel tools-panel">
  <PanelTitle title={t('Rules')} count={<Count value={props.rules.length}/>} hint={t('A rule sets the category, business or tags of transactions whose name contains its words. New bank statement imports follow your rules too.')}><Button onClick={props.onAdd}><Plus size={16} aria-hidden="true"/>{t('Add rule')}</Button></PanelTitle>
  {ruleList(props, t, removal.criteria, removal.ask)}
  {removal.dialog}
 </section>;
}

const emptyRule = (pattern: string, direction: TransactionRule['direction']): TransactionRule => ({ id: crypto.randomUUID(), pattern, direction, ...openCriteria, kind: null, category_id: null, business_id: null, tag_ids: [] });
/** A new rule suggested from one category change. */
export const ruleFromChange = (record: Entry, choice: CategoryChoice): TransactionRule => ({ ...emptyRule(suggestedPattern(record.name), directionOf(choice.kind) ?? 'expense'), ...choice });
/** A new rule suggested from one business change: "anything from this merchant belongs to this business". */
export const ruleFromBusiness = (record: Entry, business: string): TransactionRule => ({ ...emptyRule(suggestedPattern(record.name), 'any'), business_id: business });
/** A blank rule from the Rules list. */
export const newRule = () => emptyRule('', 'expense');
