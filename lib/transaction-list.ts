import { shiftMonth } from './budget';
import { inBusinessFilter } from './business';
import { income, type Entry } from './finance';
import { spendingAmount } from './spending';
import { matchesTags, type TagMatch } from './tags';
import { isTransactionHistory } from './transaction-history';

/** `two_years` is the longest a transaction read covers; links from a tag or a business open it so older history is in view. */
export const transactionPeriods = ['this_month', 'last_month', 'three_months', 'this_year', 'twelve_months', 'two_years'] as const;
export type TransactionPeriod = typeof transactionPeriods[number];
export const transactionPeriodLabels: Record<TransactionPeriod, string> = { this_month: 'This month', last_month: 'Last month', three_months: 'Last 3 months', this_year: 'This year', twelve_months: 'Last 12 months', two_years: 'Last 24 months' };

/** The months a period covers, ending no later than today. */
export function periodRange(period: TransactionPeriod, today: string) {
 const month = today.slice(0, 7);
 const from = period === 'this_month' ? month : period === 'last_month' ? shiftMonth(month, -1) : period === 'three_months' ? shiftMonth(month, -2) : period === 'this_year' ? month.slice(0, 4) + '-01' : shiftMonth(month, period === 'two_years' ? -23 : -11);
 const to = period === 'last_month' ? shiftMonth(month, -1) : month;
 return { from, to };
}

/** `businesses` holds business ids and `household`, `tags` holds tag ids (none means all); `tagMatch` says whether a row needs any or all of the tags. */
export type TransactionFilter = { query: string; direction: 'all' | 'income' | 'expense'; category: string; businesses: string[]; tags: string[]; tagMatch: TagMatch };
export const emptyTransactionFilter: TransactionFilter = { query: '', direction: 'all', category: 'all', businesses: [], tags: [], tagMatch: 'any' };
export const filtersTransactions = (filter: TransactionFilter) => !!filter.query || filter.category !== 'all' || filter.direction !== 'all' || filter.businesses.length > 0 || filter.tags.length > 0;

/** Recorded income and spending in the period, newest first, matching the search and filters. */
export function transactionsIn(records: readonly Entry[], range: { from: string; to: string }, today: string, filter: TransactionFilter, categoryName: (record: Entry) => string, tagsOf: (id: string) => readonly string[] = () => []) {
 const query = filter.query.trim().toLowerCase();
 return records.filter(record => isTransactionHistory(record) && record.date <= today && record.date.slice(0, 7) >= range.from && record.date.slice(0, 7) <= range.to
  && (filter.direction === 'all' || (filter.direction === 'income') === income.includes(record.kind))
  && (filter.category === 'all' || (record.custom_category_id ?? record.kind) === filter.category)
  && inBusinessFilter(filter.businesses, record.business_id) && matchesTags(tagsOf(record.id), filter.tags, filter.tagMatch)
  && (!query || `${record.name} ${record.notes} ${categoryName(record)}`.toLowerCase().includes(query)))
  .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

type Convert = (amount: number, currency: string) => number | null;
/** The money a record moved: income counts up, outgoings down. A mortgage payment shows its whole payment, principal plus interest. */
export const signedAmount = (record: Pick<Entry, 'kind' | 'amount'>) => income.includes(record.kind) ? Number(record.amount) : -Number(record.amount);

/** Rows grouped by day; a day's total adds up its rows and is null when a currency cannot be converted. */
export function groupByDay(records: readonly Entry[], convert: Convert) {
 const days: Array<{ date: string; records: Entry[]; total: number | null }> = [];
 for (const record of records) {
  let day = days.at(-1);
  if (!day || day.date !== record.date) { day = { date: record.date, records: [], total: 0 }; days.push(day); }
  day.records.push(record);
  const value = convert(signedAmount(record), record.currency);
  day.total = value === null || day.total === null ? null : day.total + value;
 }
 return days;
}

/** Summary card: how many, money in and out, and the largest single expense. Spending follows `lib/spending.ts`, so a mortgage payment counts only its interest. */
export function summarizeTransactions(records: readonly Entry[], convert: Convert) {
 let received = 0, spent = 0, missing = 0;
 let largest: { name: string; amount: number } | null = null;
 for (const record of records) {
  const value = convert(income.includes(record.kind) ? Number(record.amount) : spendingAmount(record), record.currency);
  if (value === null) { missing++; continue; }
  if (income.includes(record.kind)) received += value;
  else { spent += value; if (!largest || value > largest.amount) largest = { name: record.name, amount: value }; }
 }
 return { count: records.length, received, spent, largest, missing };
}

/** A list cut into parts of at most `size`, for database calls that take a limited number of ids. */
export function chunks<T>(list: readonly T[], size: number): T[][] {
 const parts: T[][] = [];
 for (let index = 0; index < list.length; index += size) parts.push(list.slice(index, index + size));
 return parts;
}
