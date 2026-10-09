import { monthActuals, monthsBetween } from './budget';
import { intervalOf } from './business-report';
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
/** The key of the share that collects everything past the largest ones; no category, merchant or business can be named it. */
export const otherShareKey = '\u0000other';
/** The largest `limit` shares, then the rest as one "Other" share, so the rows always add up to the total. */
export function topShares(items: readonly Share[], limit = 10): Share[] {
 if (items.length <= limit) return [...items];
 const rest = items.slice(limit);
 return [...items.slice(0, limit), { key: otherShareKey, amount: rest.reduce((total, item) => total + item.amount, 0), share: rest.reduce((total, item) => total + item.share, 0) }];
}
const add = (totals: Map<string, number>, key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);

/** Income and spending over some months: totals, savings, savings rate, and shares by category and by merchant.
 * Spending follows the shared definition (`lib/spending.ts`) through the Monthly review, exactly as on the Budget page:
 * mortgage payments count their interest only, and loan or debt principal repayments are transfers. */
export function cashFlowReport(data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks' | 'categories'>, splits: TransactionSplit[], months: string[], currency: string, today: string, rates: Rates) {
 const incomeKeys = new Set([...income, ...data.categories.filter((category: Category) => category.direction === 'income').map(category => category.id)]);
 const byCategory = { income: new Map<string, number>(), expense: new Map<string, number>() };
 const byMerchant = { income: new Map<string, number>(), expense: new Map<string, number>() };
 const series: TrendMonth[] = [];
 let missing = 0;
 for (const month of months) {
  const actual = monthActuals(data, splits, month, currency, today, rates);
  missing += actual.missing;
  let monthIncome = 0, monthSpending = 0;
  for (const [key, amount] of actual.byCategory) {
   if (incomeKeys.has(key)) { add(byCategory.income, key, amount); monthIncome += amount; }
   else { add(byCategory.expense, key, amount); monthSpending += amount; }
  }
  series.push({ month, income: monthIncome, expenses: monthSpending, missing: actual.missing });
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

/** How many bars the income and spending chart shows for each period: twelve months, four quarters or two years, which
 * stays inside the 24 months `/api/planning` reads at once. */
const trendBars: Record<ReportPeriod, number> = { month: 12, quarter: 4, year: 2 };
/** The months the income and spending chart reads for a period, ending with `month`: whole quarters or years, the last one up to `month`. */
export function trendMonths(month: string, period: ReportPeriod) {
 const step = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
 return monthsBetween(periodMonths(shiftMonth(month, -step * (trendBars[period] - 1)), period)[0], month);
}
export type TrendMonth = { month: string; income: number; expenses: number; missing: number };
/** One bar: income and spending, both null when a transaction in it could not be converted (missing, never too low). */
export type TrendBar = { period: string; income: number | null; expenses: number | null; missing: number };
/** Monthly income and spending summed into one bar per month, quarter or year, keyed `2026-07`, `2026-Q3` or `2026`. */
export function trendBarsBy(series: ReadonlyArray<TrendMonth>, period: ReportPeriod): TrendBar[] {
 const bars = new Map<string, { period: string; income: number; expenses: number; missing: number }>();
 for (const item of series) {
  const key = intervalOf(item.month + '-01', period), bar = bars.get(key) ?? { period: key, income: 0, expenses: 0, missing: 0 };
  bars.set(key, { period: key, income: bar.income + item.income, expenses: bar.expenses + item.expenses, missing: bar.missing + item.missing });
 }
 return [...bars.values()].map(bar => bar.missing ? { ...bar, income: null, expenses: null } : bar);
}
/** The key of the last bar when its month, quarter or year is not over by `month` (or is still running on `today`), so
 * the chart can call it "to date" rather than compare a partial period with whole ones. Null when it is complete. */
export function partialBar(month: string, period: ReportPeriod, today: string) {
 const last = period === 'month' ? month : shiftMonth(periodMonths(month, period)[0], period === 'quarter' ? 2 : 11);
 return last > month || month >= today.slice(0, 7) ? intervalOf(month + '-01', period) : null;
}

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
