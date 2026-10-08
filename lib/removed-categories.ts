import { expenses, income, type Entry } from './finance';
import type { Category } from './planning';
import type { WorkspacePreference } from './workspace-preferences';

/** The built-in categories (record kinds) this workspace deleted. They stay valid kinds, so records and links keep working; they are just no longer offered. */
export const removedCategories = (preferences: readonly WorkspacePreference[]): string[] =>
 (preferences.find(item => item.key === 'removed_categories')?.data as { kinds?: string[] } | undefined)?.kinds ?? [];

/** One direction's built-in categories that are still offered. `keep` stays listed even if deleted, so an existing record shows its own category. */
export function offeredKinds(direction: Category['direction'], removed: readonly string[], keep?: string): string[] {
 return (direction === 'income' ? income : expenses).filter(kind => kind === keep || !removed.includes(kind));
}

/** A category may go only while another one of its direction stays to record in. Mirrors `public.delete_built_in_category`. */
export function canRemoveCategory(key: string, direction: Category['direction'], categories: readonly Category[], removed: readonly string[]) {
 return offeredKinds(direction, removed).some(kind => kind !== key) || categories.some(category => category.direction === direction && category.id !== key);
}

/** The category a new record starts in: `kind` while it is offered, else the first offered built-in of its direction,
 * else the direction's first added category (on its general kind). */
export function offeredChoice(kind: Entry['kind'], categories: readonly Category[], removed: readonly string[]): { kind: Entry['kind']; custom_category_id: string | null } {
 const direction = income.includes(kind) ? 'income' : expenses.includes(kind) ? 'expense' : null;
 if (!direction || !removed.includes(kind)) return { kind, custom_category_id: null };
 const first = offeredKinds(direction, removed)[0];
 if (first) return { kind: first as Entry['kind'], custom_category_id: null };
 const custom = categories.find(category => category.direction === direction);
 return { kind: direction === 'income' ? 'Other income' : 'Other expense', custom_category_id: custom?.id ?? null };
}
