"use client";
import { useEffect, useRef, useState } from 'react';
import { orderedGoals as orderById, reorderGoal as reorderIds } from '@/lib/goal-order';
import type { WorkspacePreference } from '@/lib/workspace-preferences';
import type { PreferenceResource } from './use-workspace-preferences';

type OrderKey = 'account_order' | 'category_order';
type OrderPreference = Extract<WorkspacePreference, { key: OrderKey }>;

/** A list the person puts in their own order, saved as one workspace preference (ids only).
 * The sample workspace keeps the order in memory; a failed save rolls back and returns an error. */
export function useDisplayOrder<T extends { id: string }>(key: OrderKey, items: T[], preferences: PreferenceResource, owner: string | null, demo: boolean) {
 const scope = demo ? 'demo' : owner;
 const currentScope = useRef(scope);
 useEffect(() => { currentScope.current = scope; }, [scope]);
 const pending = useRef(false);
 const [state, setState] = useState<{ scope: string | null; ids: string[]; error: string } | null>(null);
 const [busy, setBusy] = useState(false);
 const saved = preferences.data.preferences.find((item): item is OrderPreference => item.key === key)?.data.ids ?? [];
 const ids = state?.scope === scope ? state.ids : saved;
 const ordered = orderById(items, ids);
 const disabled = busy || (!demo && (!owner || preferences.loading || !!preferences.error));
 async function reorder(id: string, target: string, visible?: string[]) {
  if (pending.current || disabled) return;
  const before = ordered.map(item => item.id);
  const next = reorderIds(before, id, target, visible);
  if (next.every((value, index) => value === before[index])) return;
  pending.current = true; setBusy(true); setState({ scope, ids: next, error: '' });
  try { if (!demo) await preferences.save({ key, data: { ids: next } } as OrderPreference); }
  catch { if (currentScope.current === scope) setState({ scope, ids: before, error: 'Could not save the order. Please try again.' }); }
  finally { pending.current = false; setBusy(false); }
 }
 return { items: ordered, reorder, disabled, error: state?.scope === scope ? state.error : '' };
}
