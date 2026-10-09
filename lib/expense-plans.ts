import { depositToday } from './deposit-interest';
export const expensePlanCategories = ['Groceries', 'Family support', 'Household', 'Other'] as const;
export type ExpensePlan = {
 id: string; name: string; category: typeof expensePlanCategories[number]; currency: string;
 amount: number; start_date: string; end_date: string | null; spent?: number; base_amount?: number; carryover?: number; rollover?: boolean;
 /** An archived plan leaves budgets, forecasts and the plan picker; its spending stays. */
 archived?: boolean;
 /** When it was archived; see `archivedIn`. */
 archive_pauses?: { from: string; to: string | null }[] | null;
};
export const expensePlanMonth = (now = new Date()) => depositToday(now).slice(0, 7);
// Full monthly allowance for every calendar month overlapping the plan's dates. Callers pass the plans of the month,
// without those archived in it (`plansOfMonth` in archive-pauses); in those months the server's allowance is 0 too.
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

/** The spending plans a month's preview lists: every plan running that month, in its own currency, at most `limit`; View all shows the rest. */
export const previewPlans = (plans: readonly ExpensePlan[], month: string, limit = 5) => plans.filter(plan => expensePlanTotals(plan, month).active).slice(0, limit);

/** Spent and planned over every plan running that month, one line per currency: totals in different currencies are listed, never added. */
export function planTotalsByCurrency(plans: readonly ExpensePlan[], month: string) {
 const lines = new Map<string, { currency: string; spent: number; planned: number }>();
 for (const plan of plans) {
  const totals = expensePlanTotals(plan, month);
  if (!totals.active) continue;
  const line = lines.get(plan.currency) ?? { currency: plan.currency, spent: 0, planned: 0 };
  line.spent += totals.spent; line.planned += totals.planned;
  lines.set(plan.currency, line);
 }
 return [...lines.values()];
}
