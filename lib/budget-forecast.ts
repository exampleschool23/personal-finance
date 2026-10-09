import { budgetCategories, budgetedIn, flexBucketKey, type BudgetState } from './budget';
import type { Category } from './planning';
import type { BudgetLine } from './finance';

type Rates = number | Record<string, number> | undefined;

/** What the forecasts need from Budget: the lines of a month in `currency`, and how many could not be converted. */
export type ForecastBudget = { linesIn: (month: string, currency: string, rates: Rates) => { lines: BudgetLine[]; missing: number } };

/** The spending budgets of `month`. Fixed and flexible budgets are spent month by month; non-monthly ones are saved
 * for ahead and paid irregularly, so they are left out, as are excluded categories and budgets of zero. A budget no
 * rate converts is counted in `missing`, never as zero. */
/** A workspace's Budget: its saved state, its added categories and the built-in kinds it removed. */
export type BudgetSource = { state: BudgetState; categories: readonly Category[]; removed: readonly string[] };

export function budgetLines({ state, categories, removed }: BudgetSource, month: string, currency: string, rates: Rates) {
 const lines: BudgetLine[] = [];
 let missing = 0;
 const add = (key: string, name: string, categoryKeys: string[]) => {
  const amount = budgetedIn(state.amounts, key, month, currency, rates);
  if (amount === null) missing++;
  else if (amount > 0) lines.push({ key, name, categoryKeys, amount });
 };
 const spending = budgetCategories(categories, state.categories, removed).filter(category => category.direction === 'expense' && !category.excluded && category.type !== 'non_monthly');
 const flex = state.mode === 'flex';
 for (const category of spending) if (!flex || category.type !== 'flexible') add(category.key, category.name, [category.key]);
 if (flex) add(flexBucketKey, 'Flexible', spending.filter(category => category.type === 'flexible').map(category => category.key));
 return { lines, missing };
}

/** The forecasts' view of a Budget state. */
export const forecastBudget = (source: BudgetSource): ForecastBudget => ({
 linesIn: (month, currency, rates) => budgetLines(source, month, currency, rates),
});
