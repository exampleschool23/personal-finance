import { budgetedIn, flexBucketPlan, isFlexibleCategory, setBudgetAmount, type BudgetAmount, type BudgetCategory } from './budget';
import { shiftMonth } from './calendar-days';
import { budgetKey, expenses, scheduledByKey, type Entry } from './finance';
import { isLinkedTransaction } from './linked-transactions';
import { convertAmount } from './market';
import { isRecurringCashFlow } from './planning';

// How Budget meets Recurring: the schedules a category plans for, the plan of a month that counts them, where a bill
// made from a category starts, and how a saved amount repeats.
type Rates = number | Record<string, number> | undefined;

/** What the recurring incomes and bills of each category come to in `month`, in `currency`; null when one has no rate.
 * A paused schedule and an archived month add nothing (`monthly`); the rule itself is `scheduledByKey`, which the
 * monthly estimate reads too. */
export function scheduledByCategory(schedules: readonly Entry[], month: string, currency: string, rates: Rates) {
 return scheduledByKey(schedules, month, isRecurringCashFlow, (amount, from) => convertAmount(amount, from, currency, rates));
}

/** A recurring income or bill that still runs: neither archived nor paused, as Recurring and `paymentSchedules` count them. */
export const activeSchedule = (record: Entry) => isRecurringCashFlow(record) && !record.archived && !record.source_paused;

/** The running recurring bills Budget counts under a category (`budgetKey`): one at most for a custom category (migration 137). */
export const categoryBills = (records: readonly Entry[], key: string) => records.filter(record => activeSchedule(record) && expenses.includes(record.kind) && budgetKey(record) === key);

/** Where a recurring bill made from a custom category starts: the first payment of the unbroken run of months with
 * spending in it that reaches this month or last month, so those payments settle the bill (migration 137). Any spending
 * kind counts, as Budget counts the category. Null without one. */
export function firstRecentPayment(records: readonly Entry[], categoryId: string, today: string): string | null {
 const payments = records.filter(record => record.frequency === 'Once' && record.custom_category_id === categoryId && expenses.includes(record.kind)
  && !record.occurrence_record_id && !record.earning_source_id && !isLinkedTransaction(record) && !!record.date && record.date <= today);
 const months = new Set(payments.map(record => record.date.slice(0, 7)));
 let month = today.slice(0, 7);
 if (!months.has(month)) month = shiftMonth(month, -1);
 if (!months.has(month)) return null;
 while (months.has(shiftMonth(month, -1))) month = shiftMonth(month, -1);
 return payments.filter(record => record.date.startsWith(month)).map(record => record.date).sort()[0];
}

/** The Flexible bucket's plan in flex mode is at least the bills of its categories (`scheduled`, from
 * `scheduledByCategory`), as the forecasts count it; null when the plan or one of those bills has no rate. */
export function flexPlanWithBills(plan: number | null, flexibleKeys: readonly string[], scheduled: ReadonlyMap<string, number | null>) {
 let bills: number | null = 0;
 for (const key of flexibleKeys) { const value = scheduled.has(key) ? scheduled.get(key)! : 0; bills = bills === null || value === null ? null : bills + value; }
 return plan === null || bills === null ? null : Math.max(plan, bills);
}

/** What a month is planned from: the saved amounts and the recurring incomes and bills (`scheduledByCategory`). */
export type PlanSource = { amounts: readonly BudgetAmount[]; schedules: readonly Entry[] };

/** The plan of `key` for `month`: its budget, or what its recurring incomes and bills come to when that is more; a bill is
 * part of its budget, never added to it. Rows, rollover and History all read this one rule. Null when either cannot be converted. */
export function plannedIn(plan: PlanSource, key: string, month: string, currency: string, rates: Rates) {
 const saved = budgetedIn(plan.amounts, key, month, currency, rates), scheduled = scheduledByCategory(plan.schedules, month, currency, rates);
 // A null entry is a bill without a rate: unknown, never 0.
 const bills = scheduled.has(key) ? scheduled.get(key)! : 0;
 return saved === null || bills === null ? null : Math.max(saved, bills);
}

/** The Flexible plan as Budget shows it and the forecasts count it: `flexBucketPlan`, or the bills of its categories when
 * they come to more (`flexPlanWithBills`). Null when the plan or one of those bills has no rate. */
export function flexPlan(plan: PlanSource, categories: readonly BudgetCategory[], month: string, currency: string, rates: Rates) {
 return flexPlanWithBills(flexBucketPlan(plan.amounts, categories, month, currency, rates), categories.filter(isFlexibleCategory).map(category => category.key), scheduledByCategory(plan.schedules, month, currency, rates));
}

export type BudgetSave = [action: 'amount' | 'amount_once', data: { category_key: string; month: string; amount: number; currency: string; applies_forward?: boolean }];
/** The "Apply to all future months" tick (BUD-027) as one change and one save. Ticked, this month's amount replaces
 * every later month. Unticked, it is this month's only and later months plan nothing (`public.set_budget_amount_once`,
 * in one transaction): "this month only" alone would keep them at the same amount, so the box would read unticked
 * while every later month still planned it. `apply` makes the same change on a state's amounts. */
export function repeatBudgetAmount(key: string, month: string, amount: number, currency: string, forward: boolean): { apply: (amounts: readonly BudgetAmount[]) => BudgetAmount[]; save: BudgetSave } {
 if (forward) return { apply: amounts => setBudgetAmount(amounts, key, month, amount, currency, true), save: ['amount', { category_key: key, month, amount, currency, applies_forward: true }] };
 return { apply: amounts => setBudgetAmount(setBudgetAmount(amounts, key, month, amount, currency, false), key, shiftMonth(month, 1), 0, currency, true), save: ['amount_once', { category_key: key, month, amount, currency }] };
}
