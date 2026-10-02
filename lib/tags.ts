import { z } from 'zod';
import { uuid } from './api-validation';
import { paletteColors, type PaletteColor } from './business';
import { expenses, income, type Entry } from './finance';

/** A label that cuts across categories and businesses, such as a trip or a tax year. */
export type Tag = { id: string; name: string; color: PaletteColor };
export type TagLink = { record_id: string; tag_id: string };
export type TagData = { tags: Tag[]; links: TagLink[] };
export const emptyTags: TagData = { tags: [], links: [] };

export const tagSchemas = {
 save: z.object({ id: uuid, name: z.string().trim().min(1).max(60), color: z.enum(paletteColors as [PaletteColor, ...PaletteColor[]]) }),
 delete: z.object({ id: uuid }),
};

/** Tag ids of each transaction. */
export function tagsByRecord(links: readonly TagLink[]) {
 const map = new Map<string, string[]>();
 for (const link of links) map.set(link.record_id, [...(map.get(link.record_id) ?? []), link.tag_id]);
 return map;
}
/** How many transactions carry each tag. */
export function tagCounts(links: readonly TagLink[]) {
 const counts = new Map<string, number>();
 for (const link of links) counts.set(link.tag_id, (counts.get(link.tag_id) ?? 0) + 1);
 return counts;
}
/** How a filter with several tags matches: a transaction with any of them, or only those with all of them. */
export const tagMatches = ['any', 'all'] as const;
export type TagMatch = typeof tagMatches[number];
/** Whether a transaction's tags pass a tag filter. No chosen tags lets everything through. */
export function matchesTags(recordTags: readonly string[], chosen: readonly string[], match: TagMatch) {
 if (!chosen.length) return true;
 return match === 'all' ? chosen.every(tag => recordTags.includes(tag)) : chosen.some(tag => recordTags.includes(tag));
}

/** Only recorded income and spending carry tags, as `public.tag_transactions` enforces. */
export const canTag = (record: Pick<Entry, 'kind' | 'frequency' | 'history_event_id'>) => record.frequency === 'Once' && [...income, ...expenses].includes(record.kind) && !record.history_event_id;

/** Adds and removes tags on transactions; the sample workspace's copy of `public.tag_transactions`. */
export function changeTags(links: readonly TagLink[], records: readonly Entry[], ids: readonly string[], add: readonly string[], remove: readonly string[]) {
 const taggable = new Set(records.filter(record => ids.includes(record.id) && canTag(record)).map(record => record.id));
 const changed = new Set<string>();
 const kept = links.filter(link => { const drop = ids.includes(link.record_id) && remove.includes(link.tag_id); if (drop) changed.add(link.record_id); return !drop; });
 const next = [...kept];
 for (const record of taggable) for (const tag of add) if (!next.some(link => link.record_id === record && link.tag_id === tag)) { next.push({ record_id: record, tag_id: tag }); changed.add(record); }
 return { links: next, changed: changed.size };
}
