"use client";
import { useState } from 'react';
import { saveOwnerResource, useOwnerResource } from '@/hooks/use-owner-resource';
import { demoBudget, emptyBudget, setBudgetAmount, type BudgetCategorySetting, type BudgetMode, type BudgetState } from '@/lib/budget';
import { expensePlanMonth } from '@/lib/expense-plans';
import { showSaved } from '@/lib/feedback';

/** Saved budgets, category settings and the budget style. The sample workspace keeps its own copy in memory. */
export function useBudget(owner: string | null, demo: boolean, revision: number) {
 const remote = useOwnerResource<BudgetState>('/api/budget', owner, !!owner && !demo, revision, emptyBudget);
 const [sample, setSample] = useState<BudgetState>(() => demoBudget(expensePlanMonth()));
 const state = demo ? sample : remote.data;
 // Changes show at once; a failed save reloads what is really stored.
 async function change(next: (state: BudgetState) => BudgetState, action: string, data: unknown) {
  if (demo) { setSample(next); showSaved(); return; }
  remote.update(next);
  try { await saveOwnerResource('/api/budget', action, data); }
  catch (error) { remote.invalidate(); throw error; }
 }
 return {
  state,
  loading: !!owner && !demo && remote.initialLoading,
  error: demo ? '' : remote.error,
  retry: remote.retry,
  saveAmount: (category_key: string, month: string, amount: number, currency: string, applies_forward: boolean) =>
   change(current => ({ ...current, amounts: setBudgetAmount(current.amounts, category_key, month, amount, currency, applies_forward) }), 'amount', { category_key, month, amount, currency, applies_forward }),
  saveCategory: (setting: BudgetCategorySetting) =>
   change(current => ({ ...current, categories: [...current.categories.filter(item => item.category_key !== setting.category_key), setting] }), 'category', setting),
  saveSettings: (mode: BudgetMode, applyForward: boolean) =>
   change(current => ({ ...current, mode, applyForward }), 'settings', { mode, apply_forward: applyForward }),
 };
}
