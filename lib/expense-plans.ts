export const expensePlanCategories = ['Groceries', 'Family support', 'Household', 'Other'] as const;
export type ExpensePlan = {
 id: string; name: string; category: typeof expensePlanCategories[number]; currency: string;
 amount: number; start_date: string; end_date: string | null; spent?: number;
};
export const expensePlanMonth = (now = new Date()) => new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 7);
// Full monthly allowance for every calendar month overlapping the plan's dates.
export function expensePlanTotals(plan: ExpensePlan, month = expensePlanMonth()) {
 const active = plan.start_date.slice(0, 7) <= month && (!plan.end_date || plan.end_date.slice(0, 7) >= month);
 const planned = active ? Number(plan.amount) : 0;
 const spent = Number(plan.spent ?? 0);
 return { active, planned, spent, remaining: planned - spent, projected: Math.max(planned, spent) };
}
