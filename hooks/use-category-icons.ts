"use client";
import { useCallback, useState } from 'react';
import { chosenCategoryEmoji, type CategoryIcons } from '@/lib/category-icons';
import type { Category } from '@/lib/planning';
import type { PreferenceResource } from './use-workspace-preferences';

/** The icons chosen for categories, shared by the workspace. A choice shows at once and is saved; a failed save puts the previous icon back.
 * In the sample workspace choices last for the visit. */
export function useCategoryIcons(preferences: PreferenceResource, owner: string | null, demo: boolean, categories: readonly Category[]) {
 const scope = demo ? 'demo' : owner;
 const [local, setLocal] = useState<{ scope: string | null; icons: CategoryIcons } | null>(null);
 const [busy, setBusy] = useState(false);
 const saved = (preferences.data.preferences.find(item => item.key === 'category_icons')?.data as { icons?: CategoryIcons } | undefined)?.icons ?? {};
 const icons = local?.scope === scope ? local.icons : saved;
 const disabled = busy || (!demo && (!owner || preferences.initialLoading || !!preferences.error));
 /** Chooses `icon` for a built-in category name or added category id; null goes back to the default. */
 async function choose(id: string, icon: string | null) {
  if (disabled) return;
  const next = Object.fromEntries(Object.entries(icons).filter(([key]) => key !== id).concat(icon ? [[id, icon]] : []));
  setBusy(true); setLocal({ scope, icons: next });
  try { if (!demo) await preferences.save({ key: 'category_icons', data: { icons: next } }); }
  catch (error) { setLocal({ scope, icons }); throw error; }
  finally { setBusy(false); }
 }
 const emojiOf = useCallback((kind: string) => chosenCategoryEmoji(kind, icons, categories), [icons, categories]);
 return { icons, choose, disabled, emojiOf };
}
export type CategoryIconsController = ReturnType<typeof useCategoryIcons>;
