import { shiftMonth } from './calendar-days';
import { expenses, income, type Entry } from './finance';
import { convertAmount } from './market';
import { fundingBudget, inFundingPlan } from './goal-funding';
import type { Category, Goal, PlanningData } from './planning';
import { monthlyReview, type TransactionSplit } from './transaction-tools';

/** Three spending buckets. Fixed: the same every month (rent, loans). Flexible: day-to-day spending.
 * Non-monthly: yearly or irregular costs that are saved for ahead. */
export const budgetTypes = ['fixed', 'flexible', 'non_monthly'] as const;
export type BudgetType = typeof budgetTypes[number];
export type BudgetMode = 'category' | 'flex';
export type BudgetDirection = 'income' | 'expense';

/** Per-category settings. `category_key` is a built-in kind ("Rent expense") or a custom category id. */
export type BudgetCategorySetting = { category_key: string; budget_type: BudgetType; group_name: string | null; rollover: boolean; rollover_start: string | null; excluded: boolean;
 /** The fund's balance going into its start month, in `rollover_currency`. */
 rollover_balance?: number; rollover_currency?: string | null;
 /** Whether overspending carries into the next month as a negative amount; off resets an overspent fund to zero. */
 rollover_negative?: boolean };
/** A budgeted amount from `month` (YYYY-MM). A forward amount also covers every later month until the next saved amount. */
export type BudgetAmount = { category_key: string; month: string; amount: number; currency: string; applies_forward: boolean };
export type BudgetState = { mode: BudgetMode; applyForward: boolean; categories: BudgetCategorySetting[]; amounts: BudgetAmount[] };
export const emptyBudget: BudgetState = { mode: 'category', applyForward: false, categories: [], amounts: [] };

/** The Flexible bucket's single amount in flex mode. */
export const flexBucketKey = 'flex:flexible';
// Loan and mortgage principal are transfers (`lib/spending.ts`), so repayments never become budget categories.
const fixedKinds = ['Rent expense'];
export const defaultGroups: Record<BudgetDirection | BudgetType, string> = { income: 'Income', expense: 'Everyday spending', fixed: 'Bills & recurring', flexible: 'Everyday spending', non_monthly: 'Future spending' };
export const budgetTypeLabels: Record<BudgetType, string> = { fixed: 'Fixed', flexible: 'Flexible', non_monthly: 'Non-monthly' };
const historyMonths = 6;

export type RolloverFund = { rollover: boolean; rolloverStart: string | null; rolloverBalance: number; rolloverCurrency: string | null; rolloverNegative: boolean };
export type BudgetCategory = RolloverFund & { key: string; name: string; custom: boolean; direction: BudgetDirection; type: BudgetType; group: string; excluded: boolean };

export function monthsBetween(from: string, to: string) {
 const months: string[] = [];
 for (let month = from; month <= to && months.length < 600; month = shiftMonth(month, 1)) months.push(month);
 return months;
}

/** A saved setting's rollover fields. Overspending carries as a negative amount unless the person turned that off. */
function rolloverFund(setting: BudgetCategorySetting | undefined): RolloverFund {
 const rollover = !!setting?.rollover;
 return { rollover, rolloverStart: rollover ? setting?.rollover_start?.slice(0, 7) ?? null : null, rolloverBalance: rollover ? Math.max(0, Number(setting?.rollover_balance ?? 0)) || 0 : 0, rolloverCurrency: rollover ? setting?.rollover_currency ?? null : null, rolloverNegative: setting?.rollover_negative ?? true };
}

/** The Flexible bucket as a budget line of its own: in flex mode its rollover is set on the bucket, not its categories. */
export function flexBucketCategory(settings: readonly BudgetCategorySetting[]): BudgetCategory {
 return { key: flexBucketKey, name: 'Flexible', custom: false, direction: 'expense', type: 'flexible', group: defaultGroups.flexible, excluded: false, ...rolloverFund(settings.find(item => item.category_key === flexBucketKey)) };
}

/** Every category that can carry a budget: the built-in kinds this workspace kept, and custom categories. */
export function budgetCategories(categories: readonly Category[], settings: readonly BudgetCategorySetting[], removed: readonly string[] = []): BudgetCategory[] {
 const byKey = new Map(settings.map(setting => [setting.category_key, setting]));
 const build = (key: string, name: string, custom: boolean, direction: BudgetDirection): BudgetCategory => {
  const setting = byKey.get(key);
  const type: BudgetType = direction === 'income' ? 'fixed' : setting?.budget_type ?? (fixedKinds.includes(key) ? 'fixed' : 'flexible');
  return { key, name, custom, direction, type, group: setting?.group_name?.trim() || (direction === 'income' ? defaultGroups.income : defaultGroups[type]), ...rolloverFund(direction === 'expense' ? setting : undefined), excluded: !!setting?.excluded };
 };
 return [
  ...income.filter(kind => !removed.includes(kind)).map(kind => build(kind, kind, false, 'income')),
  ...categories.filter(category => category.direction === 'income').map(category => build(category.id, category.name, true, 'income')),
  ...expenses.filter(kind => !removed.includes(kind)).map(kind => build(kind, kind, false, 'expense')),
  ...categories.filter(category => category.direction === 'expense').map(category => build(category.id, category.name, true, 'expense')),
 ];
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

/** The fund's starting balance in `currency`; zero when it has none or its currency cannot be converted. */
export function startingBalanceIn(fund: RolloverFund, currency: string, rates: Rates) {
 if (!fund.rolloverBalance) return 0;
 return convertAmount(fund.rolloverBalance, fund.rolloverCurrency ?? currency, currency, rates) ?? 0;
}

/** Money carried into `month`: the starting balance, then each earlier month's budget minus what was spent.
 * Overspending is taken from the fund and can make it negative; with negative carry off an overspent month resets it to zero.
 * Nothing carries before the start month or when rollover is off. Pure, so every chain can be tested month by month. */
export function rolloverCarry(fund: RolloverFund, month: string, starting: number, budgetOf: (month: string) => number, actualOf: (month: string) => number) {
 if (!fund.rollover || !fund.rolloverStart || fund.rolloverStart > month) return 0;
 let balance = starting;
 for (const past of monthsBetween(fund.rolloverStart, shiftMonth(month, -1))) {
  balance += budgetOf(past) - actualOf(past);
  if (!fund.rolloverNegative && balance < 0) balance = 0;
 }
 return balance;
}

/** Unspent (or overspent) money carried into `month` from earlier months of a rollover category. */
export function rolloverBalance(category: BudgetCategory, amounts: readonly BudgetAmount[], history: ReadonlyMap<string, MonthActuals>, month: string, currency: string, rates: Rates) {
 return rolloverCarry(category, month, startingBalanceIn(category, currency, rates), past => budgetedIn(amounts, category.key, past, currency, rates) ?? 0, past => history.get(past)?.byCategory.get(category.key) ?? 0);
}

const isFlexibleCategory = (category: BudgetCategory) => category.direction === 'expense' && category.type === 'flexible' && !category.excluded;

/** The Flexible bucket's plan for one month without any rollover: its saved amount, or the sum of its categories' budgets. */
export function flexBucketPlan(amounts: readonly BudgetAmount[], categories: readonly BudgetCategory[], month: string, currency: string, rates: Rates) {
 if (budgetAmountFor(amounts, flexBucketKey, month)) return budgetedIn(amounts, flexBucketKey, month, currency, rates) ?? 0;
 return categories.filter(isFlexibleCategory).reduce((sum, category) => sum + (budgetedIn(amounts, category.key, month, currency, rates) ?? 0), 0);
}

/** Money the Flexible bucket carries into `month` in flex mode: its plan minus everything spent in flexible categories. */
export function flexBucketRollover(bucket: BudgetCategory, categories: readonly BudgetCategory[], amounts: readonly BudgetAmount[], history: ReadonlyMap<string, MonthActuals>, month: string, currency: string, rates: Rates) {
 const flexible = categories.filter(isFlexibleCategory);
 return rolloverCarry(bucket, month, startingBalanceIn(bucket, currency, rates), past => flexBucketPlan(amounts, categories, past, currency, rates), past => flexible.reduce((sum, category) => sum + (history.get(past)?.byCategory.get(category.key) ?? 0), 0));
}

export type BudgetHistoryMonth = { month: string; amount: number; planned: number | null };
export type BudgetHistory = { months: BudgetHistoryMonth[]; lastMonth: number; average: number };
/** The History popover: six bars ending with `month` (what came in or went out so far), each with its plan,
 * plus last month and the average of the six complete months before `month`. Several keys are summed (the Flexible bucket). */
export function budgetHistory(keys: string | readonly string[], month: string, history: ReadonlyMap<string, MonthActuals>, planOf: (month: string) => number | null = () => null): BudgetHistory {
 const list = typeof keys === 'string' ? [keys] : keys;
 const actual = (past: string) => list.reduce((sum, key) => sum + (history.get(past)?.byCategory.get(key) ?? 0), 0);
 const complete = monthsBetween(shiftMonth(month, -historyMonths), shiftMonth(month, -1)).map(actual);
 const months = monthsBetween(shiftMonth(month, 1 - historyMonths), month).map(item => ({ month: item, amount: actual(item), planned: planOf(item) }));
 return { months, lastMonth: complete.at(-1) ?? 0, average: complete.reduce((sum, value) => sum + value, 0) / complete.length };
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

export type BudgetOverall = { income: number; expenses: number; plannedIncome: number; plannedExpenses: number };
/** One month's income and spending across its categories, actual and planned. Excluded categories are left out. */
export function budgetOverall(rows: readonly BudgetRow[]): BudgetOverall {
 const overall = { income: 0, expenses: 0, plannedIncome: 0, plannedExpenses: 0 };
 for (const row of rows) {
  if (row.excluded) continue;
  if (row.direction === 'income') { overall.income += row.actual; overall.plannedIncome += row.budget ?? 0; }
  else { overall.expenses += row.actual; overall.plannedExpenses += row.budget ?? 0; }
 }
 return overall;
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

/** A goal's planned monthly saving: the Contributions section. It is what Goals › Available for goals funds, so the
 * two pages never disagree: only goals included in monthly funding count. */
export const goalContribution = (goal: Goal, today: string) => inFundingPlan(goal, today) ? Math.max(0, Number(fundingBudget(goal) ?? 0)) : 0;

const isFlexible = (row: BudgetRow) => row.direction === 'expense' && row.type === 'flexible' && !row.excluded;

/** Flex mode plans one amount for the Flexible bucket: the saved bucket amount, or until one is saved, the sum of
 * its categories' budgets, so switching style keeps the plan. Null when the saved amount cannot be converted. */
export function flexBucketBudget(amounts: readonly BudgetAmount[], rows: readonly BudgetRow[], month: string, currency: string, rates: Rates): number | null {
 if (budgetAmountFor(amounts, flexBucketKey, month)) return budgetedIn(amounts, flexBucketKey, month, currency, rates);
 return rows.filter(isFlexible).reduce((sum, row) => sum + (row.budget ?? 0) + row.rolloverIn, 0);
}

/** In flex mode flexible categories carry no budget of their own: only the bucket is planned, and they show what was spent.
 * Their saved amounts are kept for Category mode, but never shown as a plan the totals ignore. */
export function budgetRowsForMode(rows: readonly BudgetRow[], mode: BudgetMode): BudgetRow[] {
 if (mode === 'category') return [...rows];
 return rows.map(row => row.direction === 'expense' && row.type === 'flexible' ? { ...row, budget: null, rolloverIn: 0, remaining: null, progress: 0 } : row);
}

export type LeftToBudget = { income: number; expenses: number; contributions: number; left: number; flexible: number | null };
/** Budgeted income minus budgeted spending and goal contributions. Green when positive, grey at zero, red when negative.
 * In flex mode the Flexible bucket replaces the sum of its categories. */
export function leftToBudget(rows: readonly BudgetRow[], mode: BudgetMode, flexibleBudget: number | null, contributions: number): LeftToBudget {
 const active = rows.filter(row => !row.excluded);
 const plannedIncome = active.filter(row => row.direction === 'income').reduce((sum, row) => sum + (row.budget ?? 0), 0);
 const others = active.filter(row => row.direction === 'expense' && (mode === 'category' || row.type !== 'flexible')).reduce((sum, row) => sum + (row.budget ?? 0), 0);
 const flexible = mode === 'flex' ? flexibleBudget ?? 0 : null;
 const planned = others + (flexible ?? 0);
 return { income: plannedIncome, expenses: planned, contributions, left: plannedIncome - planned - contributions, flexible };
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
export function budgetReadRange(month: string, view: 'month' | 'year', categories: readonly Pick<BudgetCategory, 'rollover' | 'rolloverStart'>[]) {
 let from = view === 'year' ? month.slice(0, 4) + '-01' : shiftMonth(month, -historyMonths);
 const to = view === 'year' ? month.slice(0, 4) + '-12' : month;
 for (const category of categories) if (category.rollover && category.rolloverStart && category.rolloverStart < from) from = category.rolloverStart;
 // Reads stay bounded: two years at most.
 const earliest = shiftMonth(to, -23);
 return { from: from < earliest ? earliest : from, to };
}

/** The sample workspace's budget: amounts that cover its pay, bills and day-to-day spending, with giving rolling over. */
export function demoBudget(month: string): BudgetState {
 const from = shiftMonth(month, -historyMonths);
 const amount = (category_key: string, value: number, currency = 'USD'): BudgetAmount => ({ category_key, month: from, amount: value, currency, applies_forward: true });
 return {
  mode: 'category', applyForward: false,
  categories: [{ category_key: 'Charity', budget_type: 'flexible', group_name: null, rollover: true, rollover_start: shiftMonth(month, -3), excluded: false }],
  amounts: [amount('Salary', 14500), amount('Other income', 1800), amount('Living expense', 4600), amount('Other expense', 1300), amount('Charity', 300), amount(flexBucketKey, 4800)],
 };
}
