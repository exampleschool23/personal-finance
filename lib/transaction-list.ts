import { shiftMonth } from './budget';
import { income, type Entry } from './finance';
import { isTransactionHistory } from './transaction-history';

export const transactionPeriods = ['this_month', 'last_month', 'three_months', 'this_year', 'twelve_months'] as const;
export type TransactionPeriod = typeof transactionPeriods[number];
export const transactionPeriodLabels: Record<TransactionPeriod, string> = { this_month: 'This month', last_month: 'Last month', three_months: 'Last 3 months', this_year: 'This year', twelve_months: 'Last 12 months' };

/** The months a period covers, ending no later than today. */
export function periodRange(period: TransactionPeriod, today: string) {
 const month = today.slice(0, 7);
 const from = period === 'this_month' ? month : period === 'last_month' ? shiftMonth(month, -1) : period === 'three_months' ? shiftMonth(month, -2) : period === 'this_year' ? month.slice(0, 4) + '-01' : shiftMonth(month, -11);
 const to = period === 'last_month' ? shiftMonth(month, -1) : month;
 return { from, to };
}

export type TransactionFilter = { query: string; direction: 'all' | 'income' | 'expense'; category: string };
export const emptyTransactionFilter: TransactionFilter = { query: '', direction: 'all', category: 'all' };

/** Recorded income and spending in the period, newest first, matching the search and filters. */
export function transactionsIn(records: readonly Entry[], range: { from: string; to: string }, today: string, filter: TransactionFilter, categoryName: (record: Entry) => string) {
 const query = filter.query.trim().toLowerCase();
 return records.filter(record => isTransactionHistory(record) && record.date <= today && record.date.slice(0, 7) >= range.from && record.date.slice(0, 7) <= range.to
  && (filter.direction === 'all' || (filter.direction === 'income') === income.includes(record.kind))
  && (filter.category === 'all' || (record.custom_category_id ?? record.kind) === filter.category)
  && (!query || `${record.name} ${record.notes} ${categoryName(record)}`.toLowerCase().includes(query)))
  .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

type Convert = (amount: number, currency: string) => number | null;
/** Income counts up and spending down; the day's total is null when a currency cannot be converted. */
export const signedAmount = (record: Pick<Entry, 'kind' | 'amount'>) => income.includes(record.kind) ? Number(record.amount) : -Number(record.amount);

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

/** Monarch's summary card: how many, money in and out, and the largest single expense. */
export function summarizeTransactions(records: readonly Entry[], convert: Convert) {
 let received = 0, spent = 0, missing = 0;
 let largest: { name: string; amount: number } | null = null;
 for (const record of records) {
  const value = convert(Number(record.amount), record.currency);
  if (value === null) { missing++; continue; }
  if (income.includes(record.kind)) received += value;
  else { spent += value; if (!largest || value > largest.amount) largest = { name: record.name, amount: value }; }
 }
 return { count: records.length, received, spent, largest, missing };
}
