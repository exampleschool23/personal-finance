import { monthActuals, monthsBetween } from './budget';
import { shiftMonth } from './calendar-days';
import { expenses, income, type Entry } from './finance';
import { convertAmount } from './market';
import type { Category, PlanningData } from './planning';
import { spendingAmount } from './spending';
import type { TransactionSplit } from './transaction-tools';

export const reportPeriods = ['month', 'quarter', 'year'] as const;
export type ReportPeriod = typeof reportPeriods[number];

/** The calendar months of the month, quarter or year containing `month`, never past `month`. */
export function periodMonths(month: string, period: ReportPeriod) {
 const year = month.slice(0, 4), index = Number(month.slice(5, 7)) - 1;
 const first = period === 'month' ? month : period === 'year' ? year + '-01' : `${year}-${String(Math.floor(index / 3) * 3 + 1).padStart(2, '0')}`;
 return monthsBetween(first, month);
}

type Rates = number | Record<string, number> | undefined;
export type Share = { key: string; amount: number; share: number };
const shares = (totals: Map<string, number>): Share[] => {
 const sum = [...totals.values()].reduce((total, value) => total + value, 0);
 return [...totals].filter(([, amount]) => amount > 0).map(([key, amount]) => ({ key, amount, share: sum > 0 ? amount / sum : 0 })).sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
};
const add = (totals: Map<string, number>, key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);

/** Income and spending over some months: totals, savings, savings rate, and shares by category and by merchant.
 * Spending follows the shared definition (`lib/spending.ts`) through the Monthly review, exactly as on the Budget page:
 * mortgage payments count their interest only, and loan or debt principal repayments are transfers. */
export function cashFlowReport(data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks' | 'categories'>, splits: TransactionSplit[], months: string[], currency: string, today: string, rates: Rates) {
 const incomeKeys = new Set([...income, ...data.categories.filter((category: Category) => category.direction === 'income').map(category => category.id)]);
 const byCategory = { income: new Map<string, number>(), expense: new Map<string, number>() };
 const byMerchant = { income: new Map<string, number>(), expense: new Map<string, number>() };
 const series: Array<{ month: string; income: number; expenses: number }> = [];
 let missing = 0;
 for (const month of months) {
  const actual = monthActuals(data, splits, month, currency, today, rates);
  missing += actual.missing;
  let monthIncome = 0, monthSpending = 0;
  for (const [key, amount] of actual.byCategory) {
   if (incomeKeys.has(key)) { add(byCategory.income, key, amount); monthIncome += amount; }
   else { add(byCategory.expense, key, amount); monthSpending += amount; }
  }
  series.push({ month, income: monthIncome, expenses: monthSpending });
 }
 const first = months[0], last = months.at(-1);
 for (const record of data.records as Entry[]) {
  if (record.frequency !== 'Once' || !first || !last || record.date.slice(0, 7) < first || record.date.slice(0, 7) > last || record.date > today) continue;
  const direction = income.includes(record.kind) ? 'income' : expenses.includes(record.kind) ? 'expense' : null;
  const value = direction && convertAmount(direction === 'income' ? Number(record.amount) : spendingAmount(record), record.currency, currency, rates);
  if (direction && value !== null && value !== undefined) add(byMerchant[direction], record.name.trim() || record.kind, value);
 }
 const totalIncome = series.reduce((sum, item) => sum + item.income, 0), totalSpending = series.reduce((sum, item) => sum + item.expenses, 0);
 const savings = totalIncome - totalSpending;
 return {
  income: totalIncome, expenses: totalSpending, savings, savingsRate: totalIncome > 0 ? savings / totalIncome * 100 : null, missing, series,
  categories: { income: shares(byCategory.income), expense: shares(byCategory.expense) },
  merchants: { income: shares(byMerchant.income), expense: shares(byMerchant.expense) },
 };
}

/** The twelve months ending with `month`, for the income and spending bars. */
export const trailingMonths = (month: string, count = 12) => monthsBetween(shiftMonth(month, 1 - count), month);

export type SankeyData = { nodes: Array<{ name: string; kind: 'income' | 'total' | 'expense' | 'savings' }>; links: Array<{ source: number; target: number; value: number }> };
/** Income sources flow into one total, which flows out to spending categories and savings. Small flows merge into "Other". */
export function sankeyFlows(report: Pick<ReturnType<typeof cashFlowReport>, 'categories' | 'savings'>, label: (key: string) => string, limit = 8): SankeyData {
 const top = (items: Share[], other: string) => items.length <= limit ? items.map(item => ({ name: label(item.key), amount: item.amount })) : [...items.slice(0, limit - 1).map(item => ({ name: label(item.key), amount: item.amount })), { name: other, amount: items.slice(limit - 1).reduce((sum, item) => sum + item.amount, 0) }];
 const sources = top(report.categories.income, label('Other income')), outflows = top(report.categories.expense, label('Other expense'));
 const nodes: SankeyData['nodes'] = [...sources.map(item => ({ name: item.name, kind: 'income' as const })), { name: label('Income'), kind: 'total' }, ...outflows.map(item => ({ name: item.name, kind: 'expense' as const }))];
 const total = sources.length;
 const links = [...sources.map((item, index) => ({ source: index, target: total, value: item.amount })), ...outflows.map((item, index) => ({ source: total, target: total + 1 + index, value: item.amount }))];
 if (report.savings > 0) { nodes.push({ name: label('Savings'), kind: 'savings' }); links.push({ source: total, target: nodes.length - 1, value: report.savings }); }
 return { nodes, links: links.filter(link => link.value > 0) };
}
