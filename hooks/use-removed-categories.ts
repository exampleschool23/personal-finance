"use client";
import { useState } from 'react';
import { showDeleted } from '@/lib/feedback';
import { removedCategories } from '@/lib/removed-categories';
import type { PreferenceResource } from './use-workspace-preferences';

/** The built-in categories this workspace deleted. A deletion itself runs in the database
 * (`/api/categories`), which moves linked records first; in the sample workspace it lasts for the visit. */
export function useRemovedCategories(preferences: PreferenceResource, owner: string | null, demo: boolean) {
 const scope = demo ? 'demo' : owner;
 const [local, setLocal] = useState<{ scope: string | null; kinds: string[] } | null>(null);
 const kinds = local?.scope === scope ? local.kinds : removedCategories(preferences.data.preferences);
 /** The sample workspace has no database: a deleted category is hidden for the visit. */
 const hideForVisit = (kind: string) => { setLocal({ scope, kinds: [...kinds, kind] }); showDeleted(); };
 // A saved deletion shows at once; the reloaded preference then agrees.
 const deleted = (kind: string) => setLocal({ scope, kinds: [...kinds, kind] });
 return { kinds, hideForVisit, deleted };
}
export type RemovedCategoriesController = ReturnType<typeof useRemovedCategories>;
