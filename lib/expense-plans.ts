export const expensePlanCategories = ['Groceries', 'Family support', 'Household', 'Other'] as const;
export type ExpensePlan = {
 id: string; name: string; category: typeof expensePlanCategories[number]; currency: string;
 amount: number; start_date: string; end_date: string | null; spent?: number; base_amount?: number; carryover?: number; rollover?: boolean;
};
export const expensePlanMonth = (now = new Date()) => new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 7);
// Full monthly allowance for every calendar month overlapping the plan's dates.
export function expensePlanTotals(plan: ExpensePlan, month = expensePlanMonth()) {
 const active = plan.start_date.slice(0, 7) <= month && (!plan.end_date || plan.end_date.slice(0, 7) >= month);
 const planned = active ? Number(plan.amount) + Number(plan.carryover ?? 0) : 0;
 const spent = Number(plan.spent ?? 0);
 return { active, planned, spent, remaining: planned - spent, projected: Math.max(planned, spent) };
}

/** Convert each plan before adding it; null signals incomplete currency coverage.
 * Partial totals are exposed separately for views that explicitly disclose exclusions.
 */
export function monthlyBudgetTotals(plans: readonly ExpensePlan[], month: string, convert: (amount: number, currency: string) => number | null) {
 const partial = { planned: 0, spent: 0, remaining: 0, projected: 0 };
 const missingCurrencies = new Set<string>();
 for (const plan of plans) {
  const totals = expensePlanTotals(plan, month);
  for (const key of ['planned', 'spent', 'remaining', 'projected'] as const) {
   const amount = convert(totals[key], plan.currency);
   if (amount === null) missingCurrencies.add(plan.currency);
   else partial[key] += amount;
  }
 }
 const complete = missingCurrencies.size === 0;
 return { planned: complete ? partial.planned : null, spent: complete ? partial.spent : null, remaining: complete ? partial.remaining : null, projected: complete ? partial.projected : null, partial, missingCurrencies: [...missingCurrencies] };
}
