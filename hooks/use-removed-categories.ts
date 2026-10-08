"use client";
import { useState } from 'react';
import { showDeleted, showSaved } from '@/lib/feedback';
import { removedCategories } from '@/lib/removed-categories';
import type { PreferenceResource } from './use-workspace-preferences';

/** The built-in categories this workspace deleted, and putting one back. A deletion itself runs in the database
 * (`/api/categories`), which moves linked records first; in the sample workspace both last for the visit. */
export function useRemovedCategories(preferences: PreferenceResource, owner: string | null, demo: boolean) {
 const scope = demo ? 'demo' : owner;
 const [local, setLocal] = useState<{ scope: string | null; kinds: string[] } | null>(null);
 const [busy, setBusy] = useState(false);
 const kinds = local?.scope === scope ? local.kinds : removedCategories(preferences.data.preferences);
 const disabled = busy || (!demo && (!owner || preferences.initialLoading || !!preferences.error));
 async function restore(kind: string) {
  if (disabled) return;
  const next = kinds.filter(item => item !== kind);
  setBusy(true); setLocal({ scope, kinds: next });
  try { if (demo) showSaved(); else await preferences.save({ key: 'removed_categories', data: { kinds: next } }); }
  catch (error) { setLocal({ scope, kinds }); throw error; }
  finally { setBusy(false); }
 }
 /** The sample workspace has no database: a deleted category is hidden for the visit. */
 const hideForVisit = (kind: string) => { setLocal({ scope, kinds: [...kinds, kind] }); showDeleted(); };
 // A saved deletion shows at once; the reloaded preference then agrees.
 const deleted = (kind: string) => setLocal({ scope, kinds: [...kinds, kind] });
 return { kinds, restore, hideForVisit, deleted, disabled };
}
export type RemovedCategoriesController = ReturnType<typeof useRemovedCategories>;
