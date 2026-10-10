"use client";
import { useState } from 'react';
import { saveOwnerResource, useOwnerResource } from '@/hooks/use-owner-resource';
import { emptyBudget, setBudgetAmount, type BudgetCategorySetting, type BudgetMode, type BudgetState } from '@/lib/budget';
import { demoBudget } from '@/lib/budget-demo';
import { repeatBudgetAmount } from '@/lib/budget-schedules';
import { depositMonth } from '@/lib/deposit-interest';
import { showSaved } from '@/lib/feedback';

export type WorkspaceBudget = ReturnType<typeof useBudget>;

/** Saved budgets, category settings and the budget style. The sample workspace keeps its own copy in memory.
 * Held once, by WorkspaceProvider (`useWorkspace().budget`), so a change shows at once on Budget and in every forecast. */
export function useBudget(owner: string | null, demo: boolean, revision: number) {
 const remote = useOwnerResource<BudgetState>('/api/budget', owner, !!owner && !demo, revision, emptyBudget);
 const [sample, setSample] = useState<BudgetState>(() => demoBudget(depositMonth()));
 const state = demo ? sample : remote.data;
 // Changes show at once; a failed save reloads what is really stored. Saves run in order.
 async function change(next: (state: BudgetState) => BudgetState, ...saves: Array<[action: string, data: unknown]>) {
  if (demo) { setSample(next); showSaved(); return; }
  remote.update(next);
  try { for (const [action, data] of saves) await saveOwnerResource('/api/budget', action, data); }
  catch (error) { remote.invalidate(); throw error; }
 }
 const amount = (category_key: string, month: string, amount: number, currency: string, applies_forward: boolean) =>
  change(current => ({ ...current, amounts: setBudgetAmount(current.amounts, category_key, month, amount, currency, applies_forward) }), ['amount', { category_key, month, amount, currency, applies_forward }]);
 return {
  state,
  loading: !!owner && !demo && remote.initialLoading,
  error: demo ? '' : remote.error,
  retry: remote.retry,
  saveAmount: amount,
  /** The "Apply to all future months" tick (BUD-027): one change and one save, as `repeatBudgetAmount` lays it out. */
  saveRepeat: (category_key: string, month: string, value: number, currency: string, applies_forward: boolean) => {
   const repeat = repeatBudgetAmount(category_key, month, value, currency, applies_forward);
   return change(current => ({ ...current, amounts: repeat.apply(current.amounts) }), repeat.save);
  },
  saveAmounts: (month: string, currency: string, items: Array<{ category_key: string; amount: number; applies_forward: boolean }>) =>
   change(current => ({ ...current, amounts: items.reduce((amounts, item) => setBudgetAmount(amounts, item.category_key, month, item.amount, currency, item.applies_forward), current.amounts) }), ['amounts', { month, currency, items }]),
  saveCategory: (setting: BudgetCategorySetting) =>
   change(current => ({ ...current, categories: [...current.categories.filter(item => item.category_key !== setting.category_key), setting] }), ['category', setting]),
  saveSettings: (mode: BudgetMode, applyForward: boolean) =>
   change(current => ({ ...current, mode, applyForward }), ['settings', { mode, apply_forward: applyForward }]),
 };
}
