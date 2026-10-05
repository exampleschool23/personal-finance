"use client";
import { useState } from 'react';
import { Check, ChevronDown, Plus, Tag as TagIcon } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { TagChip } from '@/components/presentation-foundation/tag-chip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Tag, TagMatch } from '@/lib/tags';

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
/** Tags to switch on and off, and a quick way to create one. `onCreate` resolves to the new tag's id. */
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
