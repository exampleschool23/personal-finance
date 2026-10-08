"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { OwnerAvatar } from '@/components/presentation-foundation/person-avatar';
import type { OwnerOption } from '@/components/presentation-foundation/owner-filter';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { Entry } from '@/lib/finance';
import type { Category } from '@/lib/planning';
import { directionOf, type CategoryChoice } from '@/lib/transaction-rules';
import type { Tag } from '@/lib/tags';
import { BusinessChoiceButton, CategoryChoiceButton, ChoiceButton, OwnerList } from './pickers';
import { TagSelector } from './tags';

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

/** Edit multiple drawer: change the category, the business, the owner and the tags of the selected transactions together.
 * Fields left as they are stay unchanged on every transaction. */
export function BulkEditSheet({ records, categories, removed, businesses, owners = [], tags, tagsOf, onCreateTag, onSave, onClose }: { records: Entry[]; categories: readonly Category[]; removed?: readonly string[]; businesses: readonly BusinessOption[]; /** The household's owners, in a shared workspace. */ owners?: readonly OwnerOption[]; tags: readonly Tag[]; tagsOf: (id: string) => readonly string[]; onCreateTag?: (name: string) => Promise<string>; onSave: (change: { choice: CategoryChoice | null; business: string | null | undefined; owner: string | undefined; add: string[]; remove: string[] }) => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const directions = new Set(records.map(record => directionOf(record.kind)));
 const direction = directions.size === 1 ? [...directions][0] : null;
 const [choice, setChoice] = useState<CategoryChoice | null>(null);
 const [business, setBusiness] = useState<string | null | undefined>(undefined);
 const [add, setAdd] = useState<string[]>([]), [remove, setRemove] = useState<string[]>([]);
 const [owner, setOwner] = useState<string | undefined>(undefined);
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const shared = tags.filter(tag => records.length > 0 && records.every(record => tagsOf(record.id).includes(tag.id))).map(tag => tag.id);
 const changed = !!choice || business !== undefined || owner !== undefined || add.length > 0 || remove.length > 0;
 const chosenOwner = owners.find(item => item.id === owner);
 const businessName = business === undefined ? t('Leave unchanged') : business === null ? t('Household') : businesses.find(item => item.id === business)?.name ?? '';
 async function save() {
  if (!changed) return;
  setBusy(true); setError('');
  try { await onSave({ choice, business, owner, add, remove }); onClose(); } catch (reason) { setError(t((reason as Error).message || 'Could not save changes.')); } finally { setBusy(false); }
 }
 return <Sheet open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <SheetContent className="bulk-edit-sheet" aria-describedby={undefined}>
   <SheetHeader><SheetTitle>{t('Edit {count} transactions', { count: records.length })}</SheetTitle></SheetHeader>
   <form className="bulk-edit-form" onSubmit={event => { event.preventDefault(); return save(); }}>
    <fieldset disabled={busy}>
     <div className="budget-dialog-label">{t('Category')}
      {direction ? <CategoryChoiceButton categories={categories} removed={removed} direction={direction} value={choice} placeholder={t('Leave unchanged')} onChange={setChoice}/> : <span className="bulk-bar-note">{t('Select only income or only expenses to change their category together.')}</span>}
     </div>
     {businesses.length > 0 && <div className="budget-dialog-label">{t('Business')}<BusinessChoiceButton businesses={businesses} value={business} label={businessName} onChange={setBusiness}/></div>}
     {owners.length > 0 && <div className="budget-dialog-label">{t('Owner')}
      <ChoiceButton label={chosenOwner ? <><OwnerAvatar owner={chosenOwner} size="sm"/>{chosenOwner.name}</> : t('Leave unchanged')}>{close => <OwnerList owners={owners} selected={owner} onSelect={value => { close(); setOwner(value); }}/>}</ChoiceButton>
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
