import { flexBucketKey, historyMonths, type BudgetAmount, type BudgetState } from './budget';
import { shiftMonth } from './calendar-days';

/** The sample workspace's budget: amounts that cover its pay, bills and day-to-day spending, with giving rolling over. */
export function demoBudget(month: string): BudgetState {
 const from = shiftMonth(month, -historyMonths);
 const amount = (category_key: string, value: number, currency = 'USD'): BudgetAmount => ({ category_key, month: from, amount: value, currency, applies_forward: true });
 return {
  mode: 'category', applyForward: false,
  categories: [
   { category_key: 'Charity', budget_type: 'flexible', group_name: null, rollover: true, rollover_start: shiftMonth(month, -3), excluded: false },
   { category_key: 'demo-cat-groceries', budget_type: 'flexible', group_name: 'Groceries', rollover: false, rollover_start: null, excluded: false },
   { category_key: 'demo-cat-household', budget_type: 'flexible', group_name: 'Household', rollover: false, rollover_start: null, excluded: false },
  ],
  amounts: [amount('Salary', 14500), amount('Other income', 1800), amount('Living expense', 3050), amount('demo-cat-groceries', 1100), amount('demo-cat-household', 450), amount('Other expense', 1300), amount('Charity', 300), amount(flexBucketKey, 4800)],
 };
}
