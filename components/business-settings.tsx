"use client";
import { useState, type CSSProperties } from 'react';
import { Briefcase, Plus, Tag as TagIcon } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { Count } from '@/components/presentation-foundation/count';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { TagChip } from '@/components/presentation-foundation/tag-chip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDisplayOrder } from '@/hooks/use-display-order';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import type { TagsResource } from '@/hooks/use-tags';
import { businessStructureLabels, isBusinessAccount, nextPaletteColor, paletteColor, paletteColors, paletteLabels, type BusinessStructure, type PaletteColor } from '@/lib/business';
import type { Entry } from '@/lib/finance';
import { formatNumber } from '@/lib/format';
import { tagCounts, type Tag } from '@/lib/tags';

/** Settings › Businesses: each business with its structure and how many accounts and transactions it has, in the
 * person's own order. Editing opens the business's record; setup walks through adding businesses and accounts. */
export function BusinessSettings({ businesses, records, preferences, owner, demo, onEdit, onDelete, onSetup, onGuide }: { businesses: Entry[]; records: readonly Entry[]; preferences: PreferenceResource; owner: string | null; demo: boolean; onEdit: (business: Entry) => void; onDelete: (business: Entry) => void; onSetup: () => void; onGuide: () => void }) {
 const { t, locale } = useLanguage();
 const order = useDisplayOrder('business_order', businesses, preferences, owner, demo);
 return <section className="panel tools-panel business-settings">
  <PanelTitle title={t('Businesses')} count={<Count value={businesses.length}/>} hint={t('Track a side business, freelance work or rentals beside your household. Each business has its own profit and loss in Reports.')}>
   {businesses.length > 0 && <Button variant="outline" onClick={onGuide}>{t('Setup guide')}</Button>}
   <Button onClick={onSetup}><Plus size={16} aria-hidden="true"/>{t(businesses.length ? 'Add business' : 'Set up business tracking')}</Button>
  </PanelTitle>
  {order.items.length ? <SortableList id="business-order" items={order.items.map(item => item.id)} nameOf={id => businesses.find(item => item.id === id)?.name ?? ''} onMove={(moved, over) => void order.reorder(moved, over)} disabled={order.disabled}>
   <ul className="settings-list">{order.items.map(business => {
    const accounts = records.filter(record => record.business_id === business.id && isBusinessAccount(record)).length;
    return <SortableItem as="li" key={business.id} id={business.id} label={business.name}>
     <BusinessMark name={business.name} color={business.business_color} logo={business.business_logo}/>
     <span className="settings-list-name">{business.name}<small>{[business.business_structure ? t(businessStructureLabels[business.business_structure as BusinessStructure]) : null, t('{count} accounts', { count: formatNumber(accounts, locale, 0) })].filter(Boolean).join(' · ')}</small></span>
     <Link className="panel-link" href={`/reports?tab=cash_flow&business=${business.id}&view=pnl`}>{t('View P&L')}</Link>
     <RowMenu label={t('Actions for {name}', { name: business.name })} items={[{ label: t('Edit'), onSelect: () => onEdit(business) }, { label: t('Delete'), deletes: true, onSelect: () => onDelete(business) }]}/>
    </SortableItem>;
   })}</ul>
  </SortableList> : <EmptyState icon={<Briefcase/>} description={t('No businesses yet.')}/>}
  <ErrorPopup message={order.error}/>
 </section>;
}

/** A tag's name and colour. */
function TagDialog({ tag, onSave, onClose }: { tag: Tag; onSave: (tag: Tag) => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const [name, setName] = useState(tag.name), [color, setColor] = useState<PaletteColor>(tag.color), [busy, setBusy] = useState(false), [error, setError] = useState('');
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle>{t(tag.name ? 'Edit tag' : 'Add tag')}</DialogTitle>
   <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onSave({ ...tag, name: name.trim(), color }); onClose(); } catch (reason) { setError(t((reason as Error).message || 'Could not save changes.')); } finally { setBusy(false); } }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     <label className="budget-dialog-label">{t('Name')}<Input required autoFocus maxLength={60} value={name} onChange={event => setName(event.currentTarget.value)}/></label>
     <fieldset className="business-color-field"><legend>{t('Colour')}</legend><div role="radiogroup" aria-label={t('Colour')}>{paletteColors.map(item => <button key={item} type="button" role="radio" aria-checked={color === item} aria-label={t(paletteLabels[item])} style={{ '--swatch': paletteColor(item) } as CSSProperties} onClick={() => setColor(item)}/>)}</div></fieldset>
     {error && <p className="form-error" role="alert">{error}</p>}
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy || !name.trim()}>{t(busy ? 'Saving…' : 'Save tag')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}

/** Settings › Tags: every tag in the person's order, with how many transactions carry it; the count opens those
 * transactions, ready to select and move to a business. */
export function TagSettings({ tags, preferences, owner, demo }: { tags: TagsResource; preferences: PreferenceResource; owner: string | null; demo: boolean }) {
 const { t, locale } = useLanguage();
 const order = useDisplayOrder('tag_order', tags.data.tags, preferences, owner, demo);
 const counts = tagCounts(tags.data.links);
 const [editing, setEditing] = useState<Tag | null>(null), [deleting, setDeleting] = useState<Tag | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function remove() {
  if (!deleting) return;
  setBusy(true); setError('');
  try { await tags.remove(deleting.id); setDeleting(null); } catch (reason) { setError(t((reason as Error).message)); } finally { setBusy(false); }
 }
 return <section className="panel tools-panel tag-settings">
  <PanelTitle title={t('Tags')} count={<Count value={tags.data.tags.length}/>} hint={t('Tags label transactions across categories and businesses, such as a trip or receipts to keep. Rules can add them automatically.')}>
   <Button variant="outline" onClick={() => setEditing({ id: crypto.randomUUID(), name: '', color: nextPaletteColor(tags.data.tags.map(tag => tag.color)) })}><Plus size={16} aria-hidden="true"/>{t('Add tag')}</Button>
  </PanelTitle>
  {tags.error ? <InlineError message={t(tags.error)} onRetry={tags.retry}/> : order.items.length ? <SortableList id="tag-order" items={order.items.map(item => item.id)} nameOf={id => tags.data.tags.find(item => item.id === id)?.name ?? ''} onMove={(moved, over) => void order.reorder(moved, over)} disabled={order.disabled}>
   <ul className="settings-list">{order.items.map(tag => <SortableItem as="li" key={tag.id} id={tag.id} label={tag.name}>
    <TagChip name={tag.name} color={tag.color}/>
    <span className="settings-list-name"/>
    <Link className="panel-link" href={`/transactions?tag=${tag.id}`}>{t('{count} transactions', { count: formatNumber(counts.get(tag.id) ?? 0, locale, 0) })}</Link>
    <RowMenu label={t('Actions for {name}', { name: tag.name })} items={[{ label: t('Edit'), onSelect: () => setEditing(tag) }, { label: t('Delete'), deletes: true, onSelect: () => { setError(''); setDeleting(tag); } }]}/>
   </SortableItem>)}</ul>
  </SortableList> : <EmptyState icon={<TagIcon/>} description={t('No tags yet.')}/>}
  <ErrorPopup message={order.error}/>
  {editing && <TagDialog tag={editing} onSave={tags.save} onClose={() => setEditing(null)}/>}
  <ConfirmDialog deletes open={!!deleting} onClose={() => setDeleting(null)} busy={busy} error={error} title={t('Delete {name}?', { name: deleting?.name ?? '' })} description={t('The tag is removed from its transactions and rules. The transactions themselves are kept.')} confirmLabel={t(busy ? 'Deleting…' : 'Delete tag')} onConfirm={remove}/>
 </section>;
}
