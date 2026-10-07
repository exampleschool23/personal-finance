"use client";
import { showSaved } from '@/lib/feedback';
import { useCallback, useState } from 'react';
import { chosenCategoryEmoji, type CategoryIcons } from '@/lib/category-icons';
import { chosenCategoryHue, type CategoryColors } from '@/lib/category-colors';
import type { PaletteColor } from '@/lib/business';
import type { Category } from '@/lib/planning';
import type { PreferenceResource } from './use-workspace-preferences';

type Looks = { icons: CategoryIcons; colors: CategoryColors };
/** A change to one category: an icon or colour, or null to go back to the default; a missing field stays as it is. */
export type CategoryLookChange = { icon?: string | null; color?: PaletteColor | null };
const withChoice = <T,>(map: Record<string, T>, id: string, value: T | null | undefined) => value === undefined ? map : Object.fromEntries(Object.entries(map).filter(([key]) => key !== id).concat(value ? [[id, value]] : [])) as Record<string, T>;

/** The icons and colours chosen for categories, shared by the workspace. A choice shows at once and is saved; a failed save puts the previous look back.
 * In the sample workspace choices last for the visit. */
export function useCategoryIcons(preferences: PreferenceResource, owner: string | null, demo: boolean, categories: readonly Category[]) {
 const scope = demo ? 'demo' : owner;
 const [local, setLocal] = useState<{ scope: string | null; looks: Looks } | null>(null);
 const [busy, setBusy] = useState(false);
 const saved = preferences.data.preferences.find(item => item.key === 'category_icons')?.data as Partial<Looks> | undefined;
 const looks: Looks = local?.scope === scope ? local.looks : { icons: saved?.icons ?? {}, colors: saved?.colors ?? {} };
 const { icons, colors } = looks;
 const disabled = busy || (!demo && (!owner || preferences.initialLoading || !!preferences.error));
 /** Changes the icon and colour of a built-in category name or added category id in one save. */
 async function update(id: string, change: CategoryLookChange) {
  if (disabled) return;
  const next = { icons: withChoice(icons, id, change.icon), colors: withChoice(colors, id, change.color) };
  setBusy(true); setLocal({ scope, looks: next });
  try { if (demo) showSaved(); else await preferences.save({ key: 'category_icons', data: Object.keys(next.colors).length ? next : { icons: next.icons } }); }
  catch (error) { setLocal({ scope, looks }); throw error; }
  finally { setBusy(false); }
 }
 const choose = (id: string, icon: string | null) => update(id, { icon });
 const emojiOf = useCallback((kind: string) => chosenCategoryEmoji(kind, icons, categories), [icons, categories]);
 const hueOf = useCallback((kind: string) => chosenCategoryHue(kind, colors, categories), [colors, categories]);
 return { icons, colors, choose, update, disabled, emojiOf, hueOf };
}
export type CategoryIconsController = ReturnType<typeof useCategoryIcons>;
