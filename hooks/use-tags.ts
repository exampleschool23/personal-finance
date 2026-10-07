"use client";
import { useState } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { requestJson } from '@/lib/api-client';
import { showDeleted, showSaved } from '@/lib/feedback';
import type { Entry } from '@/lib/finance';
import { changeTags, emptyTags, type Tag, type TagData } from '@/lib/tags';

/** Tags and which transactions carry them. The sample workspace keeps both in memory. */
export function useTags(owner: string | null, demo: boolean, revision: number, records: readonly Entry[], seed: TagData = emptyTags) {
 const live = !!owner && !demo;
 const remote = useOwnerResource<TagData>('/api/tags', owner, live, revision, emptyTags);
 const [sample, setSample] = useState<{ seed: TagData; data: TagData }>({ seed, data: seed });
 if (sample.seed !== seed) setSample({ seed, data: seed });
 const data = demo ? sample.data : remote.data;
 async function post(url: string, action: string, payload: unknown) {
  return (await requestJson<{ changed?: number }>(url, { body: { action, data: payload }, fallback: 'Could not save changes.' })).changed ?? 0;
 }
 return {
  data, loading: live && remote.initialLoading, error: live ? remote.error : '', retry: remote.retry,
  async save(tag: Tag) {
   if (demo) {
    if (sample.data.tags.some(item => item.id !== tag.id && item.name.trim().toLowerCase() === tag.name.trim().toLowerCase())) throw Error('A tag with this name already exists.');
    setSample(previous => ({ ...previous, data: { ...previous.data, tags: [...previous.data.tags.filter(item => item.id !== tag.id), tag] } }));
   } else { await post('/api/tags', 'save', tag); remote.invalidate(); }
   showSaved();
  },
  async remove(id: string) {
   if (demo) setSample(previous => ({ ...previous, data: { tags: previous.data.tags.filter(item => item.id !== id), links: previous.data.links.filter(link => link.tag_id !== id) } }));
   else { await post('/api/tags', 'delete', { id }); remote.invalidate(); }
   showDeleted();
  },
  /** Adds and removes tags on transactions; resolves to how many changed. */
  async change(ids: string[], add: string[], remove: string[]) {
   if (demo) {
    const result = changeTags(sample.data.links, records, ids, add, remove);
    setSample(previous => ({ ...previous, data: { ...previous.data, links: result.links } }));
    return result.changed;
   }
   const changed = await post('/api/transaction-rules', 'tags', { ids, add, remove });
   remote.invalidate();
   return changed;
  },
 };
}
export type TagsResource = ReturnType<typeof useTags>;
