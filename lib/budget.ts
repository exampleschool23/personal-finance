import { expenses, income, type Entry } from './finance';
import { convertAmount } from './market';
import type { Category, Goal, PlanningData } from './planning';
import { monthlyReview, type TransactionSplit } from './transaction-tools';

/** Monarch's three spending buckets. Fixed: the same every month (rent, loans). Flexible: day-to-day spending.
 * Non-monthly: yearly or irregular costs that are saved for ahead. */
export const budgetTypes = ['fixed', 'flexible', 'non_monthly'] as const;
export type BudgetType = typeof budgetTypes[number];
export type BudgetMode = 'category' | 'flex';
export type BudgetDirection = 'income' | 'expense';

/** Per-category settings. `category_key` is a built-in kind ("Rent expense") or a custom category id. */
export type BudgetCategorySetting = { category_key: string; budget_type: BudgetType; group_name: string | null; rollover: boolean; rollover_start: string | null; excluded: boolean };
/** A budgeted amount from `month` (YYYY-MM). A forward amount also covers every later month until the next saved amount. */
export type BudgetAmount = { category_key: string; month: string; amount: number; currency: string; applies_forward: boolean };
export type BudgetState = { mode: BudgetMode; applyForward: boolean; categories: BudgetCategorySetting[]; amounts: BudgetAmount[] };
export const emptyBudget: BudgetState = { mode: 'category', applyForward: false, categories: [], amounts: [] };

/** The Flexible bucket's single amount in flex mode. */
export const flexBucketKey = 'flex:flexible';
/** Repayments arrive as their own spending categories. */
const repaymentKinds = ['Mortgage', 'Loan', 'Debt'];
const fixedKinds = ['Rent expense', ...repaymentKinds];
export const defaultGroups: Record<BudgetDirection | BudgetType, string> = { income: 'Income', expense: 'Everyday spending', fixed: 'Bills & recurring', flexible: 'Everyday spending', non_monthly: 'Future spending' };
export const budgetTypeLabels: Record<BudgetType, string> = { fixed: 'Fixed', flexible: 'Flexible', non_monthly: 'Non-monthly' };
export const historyMonths = 6;

export type BudgetCategory = { key: string; name: string; custom: boolean; direction: BudgetDirection; type: BudgetType; group: string; rollover: boolean; rolloverStart: string | null; excluded: boolean };

export function shiftMonth(month: string, by: number) {
 const date = new Date(month + '-01T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() + by);
 return date.toISOString().slice(0, 7);
}
export function monthsBetween(from: string, to: string) {
 const months: string[] = [];
 for (let month = from; month <= to && months.length < 600; month = shiftMonth(month, 1)) months.push(month);
 return months;
}

/** Every category that can carry a budget: built-in kinds, custom categories, and any other key that has spending. */
export function budgetCategories(categories: readonly Category[], settings: readonly BudgetCategorySetting[], seen: readonly string[] = []): BudgetCategory[] {
 const byKey = new Map(settings.map(setting => [setting.category_key, setting]));
 const build = (key: string, name: string, custom: boolean, direction: BudgetDirection): BudgetCategory => {
  const setting = byKey.get(key);
  const type: BudgetType = direction === 'income' ? 'fixed' : setting?.budget_type ?? (fixedKinds.includes(key) ? 'fixed' : 'flexible');
  return { key, name, custom, direction, type, group: setting?.group_name?.trim() || (direction === 'income' ? defaultGroups.income : defaultGroups[type]), rollover: direction === 'expense' && !!setting?.rollover, rolloverStart: setting?.rollover_start?.slice(0, 7) ?? null, excluded: !!setting?.excluded };
 };
 const list = [
  ...income.map(kind => build(kind, kind, false, 'income')),
  ...categories.filter(category => category.direction === 'income').map(category => build(category.id, category.name, true, 'income')),
  ...expenses.map(kind => build(kind, kind, false, 'expense')),
  ...categories.filter(category => category.direction === 'expense').map(category => build(category.id, category.name, true, 'expense')),
 ];
 for (const key of seen) if (!list.some(item => item.key === key) && repaymentKinds.includes(key)) list.push(build(key, key, false, 'expense'));
 return list;
}

/** The amount saved for exactly this month, or else the latest forward amount before it. */
export function budgetAmountFor(amounts: readonly BudgetAmount[], key: string, month: string): BudgetAmount | null {
 let best: BudgetAmount | null = null;
 for (const amount of amounts) {
  if (amount.category_key !== key || amount.month > month) continue;
  if (amount.month === month) return amount;
  if (amount.applies_forward && (!best || amount.month > best.month)) best = amount;
 }
 return best;
}

/** Saving for "this month only" keeps later months as they were; "all future months" replaces them.
 * Mirrors `public.set_budget_amount` so the sample workspace behaves like a saved account. */
export function setBudgetAmount(amounts: readonly BudgetAmount[], key: string, month: string, amount: number, currency: string, forward: boolean): BudgetAmount[] {
 const existing = amounts.find(item => item.category_key === key && item.month === month);
 const kept = amounts.filter(item => item.category_key !== key || (item.month !== month && !(forward && item.month > month)));
 // A one-month change must not cut off a forward amount saved for this same month: it moves on to the next month.
 const next = shiftMonth(month, 1);
 if (!forward && existing?.applies_forward && !kept.some(item => item.category_key === key && item.month === next)) kept.push({ ...existing, month: next });
 return [...kept, { category_key: key, month, amount, currency, applies_forward: forward }].sort((a, b) => a.category_key.localeCompare(b.category_key) || a.month.localeCompare(b.month));
}

type Rates = number | Record<string, number> | undefined;
type Actuals = Map<string, number>;
export type MonthActuals = { month: string; byCategory: Actuals; missing: number };

/** Received and spent per category for one month, in `currency`. Spending reuses the Monthly review, so the figures agree. */
export function monthActuals(data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks'>, splits: TransactionSplit[], month: string, currency: string, today: string, rates: Rates): MonthActuals {
 const review = monthlyReview(data.records, splits, [], month, currency, today, data.activity ?? [], rates, data.investmentLinks ?? []);
 const byCategory: Actuals = new Map(review.categories.map(item => [item.id, item.amount]));
 const seen = new Set<string>();
 for (const record of data.records as Entry[]) {
  if (seen.has(record.id) || record.frequency !== 'Once' || !income.includes(record.kind) || record.date.slice(0, 7) !== month || record.date > today) continue;
  seen.add(record.id);
  const value = convertAmount(Number(record.amount), record.currency, currency, rates);
  // The review already counted an income amount it could not convert.
  if (value === null) continue;
  const key = record.custom_category_id ?? record.kind;
  byCategory.set(key, (byCategory.get(key) ?? 0) + value);
 }
 return { month, byCategory, missing: review.missing };
}

/** The budget in display currency; null when its currency cannot be converted. */
export function budgetedIn(amounts: readonly BudgetAmount[], key: string, month: string, currency: string, rates: Rates) {
 const saved = budgetAmountFor(amounts, key, month);
 if (!saved) return 0;
 return convertAmount(Number(saved.amount), saved.currency, currency, rates);
}

/** Unspent (or overspent) money carried into `month` from earlier months of a rollover category. */
export function rolloverBalance(category: BudgetCategory, amounts: readonly BudgetAmount[], history: ReadonlyMap<string, MonthActuals>, month: string, currency: string, rates: Rates) {
 if (!category.rollover || !category.rolloverStart || category.rolloverStart >= month) return 0;
 let balance = 0;
 for (const past of monthsBetween(category.rolloverStart, shiftMonth(month, -1))) {
  balance += (budgetedIn(amounts, category.key, past, currency, rates) ?? 0) - (history.get(past)?.byCategory.get(category.key) ?? 0);
 }
 return balance;
}

export type BudgetHistory = { months: Array<{ month: string; amount: number }>; lastMonth: number; average: number };
/** The six months before `month`: Monarch's History popover. */
export function budgetHistory(key: string, month: string, history: ReadonlyMap<string, MonthActuals>): BudgetHistory {
 const months = monthsBetween(shiftMonth(month, -historyMonths), shiftMonth(month, -1)).map(past => ({ month: past, amount: history.get(past)?.byCategory.get(key) ?? 0 }));
 return { months, lastMonth: months.at(-1)?.amount ?? 0, average: months.reduce((sum, item) => sum + item.amount, 0) / months.length };
}
/** Suggested budgets are whole amounts, rounded up so the suggestion covers the average. */
export const suggestedBudget = (average: number) => Math.max(0, Math.ceil(average - 1e-9));

export type BudgetRow = BudgetCategory & { budget: number | null; actual: number; rolloverIn: number; remaining: number | null; progress: number };
export type BudgetGroup = { name: string; direction: BudgetDirection; type: BudgetType | null; rows: BudgetRow[]; budget: number; actual: number; remaining: number };

/** Each category's budget, actual and remaining for one month. Remaining includes money rolled over from earlier months. */
export function budgetRows(categories: readonly BudgetCategory[], amounts: readonly BudgetAmount[], history: ReadonlyMap<string, MonthActuals>, month: string, currency: string, rates: Rates): BudgetRow[] {
 const actuals = history.get(month)?.byCategory ?? new Map<string, number>();
 return categories.map(category => {
  const budget = budgetedIn(amounts, category.key, month, currency, rates);
  const rolloverIn = rolloverBalance(category, amounts, history, month, currency, rates);
  const actual = actuals.get(category.key) ?? 0;
  const available = budget === null ? null : budget + rolloverIn;
  return { ...category, budget, actual, rolloverIn, remaining: available === null ? null : available - actual, progress: available && available > 0 ? actual / available : actual > 0 ? 1 : 0 };
 });
}

/** A row is "unbudgeted" when nothing is planned and nothing happened; those hide behind "Show N unbudgeted". */
export const isUnbudgeted = (row: BudgetRow) => !row.budget && !row.actual && !row.rolloverIn;

export function groupRows(rows: readonly BudgetRow[], byType: boolean): BudgetGroup[] {
 const groups = new Map<string, BudgetGroup>();
 for (const row of rows) {
  if (row.excluded) continue;
  const name = row.direction === 'income' ? defaultGroups.income : byType ? budgetTypeLabels[row.type] : row.group;
  const id = row.direction + ':' + name;
  const group = groups.get(id) ?? { name, direction: row.direction, type: byType && row.direction === 'expense' ? row.type : null, rows: [], budget: 0, actual: 0, remaining: 0 };
  group.rows.push(row); group.budget += (row.budget ?? 0) + row.rolloverIn; group.actual += row.actual; group.remaining += row.remaining ?? 0;
  groups.set(id, group);
 }
 const typeOrder = (group: BudgetGroup) => group.direction === 'income' ? 0 : 1 + budgetTypes.indexOf(group.type ?? 'flexible');
 return [...groups.values()].sort((a, b) => typeOrder(a) - typeOrder(b));
}

/** A goal's planned monthly saving: the Contributions section. */
export const goalContribution = (goal: Goal) => goal.archived || goal.completed_on ? 0 : Math.max(0, Number(goal.funding_monthly ?? goal.monthly_contribution ?? 0));

export type LeftToBudget = { income: number; expenses: number; contributions: number; left: number; flexible: number | null; unallocatedFlexible: number | null };
/** Budgeted income minus budgeted spending and goal contributions. Green when positive, grey at zero, red when negative.
 * In flex mode the Flexible bucket replaces the sum of its categories, which become optional limits inside it. */
export function leftToBudget(rows: readonly BudgetRow[], mode: BudgetMode, flexibleBudget: number | null, contributions: number): LeftToBudget {
 const active = rows.filter(row => !row.excluded);
 const plannedIncome = active.filter(row => row.direction === 'income').reduce((sum, row) => sum + (row.budget ?? 0), 0);
 const spending = active.filter(row => row.direction === 'expense');
 const limits = spending.filter(row => row.type === 'flexible').reduce((sum, row) => sum + (row.budget ?? 0), 0);
 const others = spending.filter(row => mode === 'category' || row.type !== 'flexible').reduce((sum, row) => sum + (row.budget ?? 0), 0);
 const flexible = mode === 'flex' ? flexibleBudget ?? 0 : null;
 const planned = others + (flexible ?? 0);
 return { income: plannedIncome, expenses: planned, contributions, left: plannedIncome - planned - contributions, flexible, unallocatedFlexible: flexible === null ? null : flexible - limits };
}

export type BudgetTone = 'positive' | 'negative' | 'neutral';
/** Remaining money is green and overspending red; a zeroed-out amount stays grey.
 * Income still to come is grey too, and income above plan is green: red marks only overspending. */
export function remainingTone(remaining: number | null, direction: BudgetDirection = 'expense'): BudgetTone {
 if (remaining === null || Math.abs(remaining) < 0.005) return 'neutral';
 if (direction === 'income') return remaining < 0 ? 'positive' : 'neutral';
 return remaining > 0 ? 'positive' : 'negative';
}

/** Months of actuals a view needs: the year, or the History window, extended back to the earliest rollover start. */
export function budgetReadRange(month: string, view: 'month' | 'year', categories: readonly BudgetCategory[]) {
 let from = view === 'year' ? month.slice(0, 4) + '-01' : shiftMonth(month, -historyMonths);
 const to = view === 'year' ? month.slice(0, 4) + '-12' : month;
 for (const category of categories) if (category.rollover && category.rolloverStart && category.rolloverStart < from) from = category.rolloverStart;
 // Reads stay bounded: two years at most.
 const earliest = shiftMonth(to, -23);
 return { from: from < earliest ? earliest : from, to };
}

/** The sample workspace's budget: amounts that cover its bills and pay, with giving rolling over. */
export function demoBudget(month: string): BudgetState {
 const from = shiftMonth(month, -historyMonths);
 const amount = (category_key: string, value: number, currency = 'USD'): BudgetAmount => ({ category_key, month: from, amount: value, currency, applies_forward: true });
 return {
  mode: 'category', applyForward: false,
  categories: [{ category_key: 'Charity', budget_type: 'flexible', group_name: null, rollover: true, rollover_start: shiftMonth(month, -3), excluded: false }],
  amounts: [amount('Salary', 18000000, 'UZS'), amount('Other income', 300), amount('Rent expense', 4500000, 'UZS'), amount('Living expense', 450), amount('Other expense', 50), amount('Charity', 25), amount(flexBucketKey, 520)],
 };
}
