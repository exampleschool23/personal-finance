import { scheduleDates, income, type Entry } from './finance';
import { installmentDates, installmentsFrom, isRecurringCashFlow, paidInstallmentMonths, scheduleAssets, scheduleStart, settledOccurrences, type DebtPayment, type Occurrence } from './planning';

export type RecurringStatus = 'paid' | 'skipped' | 'due' | 'overdue';
/** `installment` is a loan's monthly payment; it is paid by a repayment or mortgage payment in its month. */
export type RecurringItem = { key: string; record: Entry; date: string; status: RecurringStatus; direction: 'income' | 'expense'; amount: number; installment?: boolean };

const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Every scheduled income and expense in a month and, when the loan payments are known, each loan's monthly payment, with whether it was paid, skipped, is still due or is overdue. */
export function monthOccurrences(records: Entry[], occurrences: Occurrence[], month: string, today: string, debtPayments?: DebtPayment[]): RecurringItem[] {
 const settled = settledOccurrences(records, occurrences), paid = debtPayments && paidInstallmentMonths(debtPayments);
 const status = new Map(occurrences.map(item => [item.record_id + ':' + item.due_on, item.status]));
 const assets = scheduleAssets(records);
 const items: RecurringItem[] = [];
 for (const record of records) {
  if (!record.date || record.source_paused || !isRecurringCashFlow(record)) continue;
  const start = scheduleStart(record, assets), from = month + '-01';
  for (const date of scheduleDates(record, start > from ? start : from, monthEnd(month))) {
   const key = record.id + ':' + date;
   const done = status.get(key) === 'dismissed' ? 'skipped' : settled.has(key) ? 'paid' : null;
   items.push({ key, record, date, status: done ?? (date < today ? 'overdue' : 'due'), direction: income.includes(record.kind) ? 'income' : 'expense', amount: Number(record.amount) });
  }
 }
 if (paid) for (const record of records) {
  const from = installmentsFrom(record), first = month + '-01';
  for (const date of installmentDates(record, from > first ? from : first, monthEnd(month))) {
   if (date === record.date) continue;
   items.push({ key: record.id + ':installment:' + date, record, date, status: paid.has(record.id + ':' + month) ? 'paid' : date < today ? 'overdue' : 'due', direction: 'expense', amount: Number(record.estimated_monthly_payment), installment: true });
  }
 }
 return items.sort((a, b) => a.date.localeCompare(b.date) || a.record.name.localeCompare(b.record.name));
}

/** Monarch's summary bars: how much came in or went out, and how much is still to come. Skipped items count as neither. */
export function recurringSummary(items: RecurringItem[], convert: (amount: number, currency: string) => number | null) {
 const totals = { income: { done: 0, remaining: 0 }, expense: { done: 0, remaining: 0 }, missing: 0 };
 for (const item of items) {
  if (item.status === 'skipped') continue;
  const value = convert(item.amount, item.record.currency);
  if (value === null) { totals.missing++; continue; }
  totals[item.direction][item.status === 'paid' ? 'done' : 'remaining'] += value;
 }
 return totals;
}

/** Whole days from today to a date: positive ahead, negative behind. */
export const daysFrom = (today: string, date: string) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);

/** The weeks of a month for a Monday-first calendar; days outside the month are null. */
export function calendarWeeks(month: string) {
 const first = new Date(month + '-01T00:00:00Z'), days = Number(monthEnd(month).slice(8));
 const offset = (first.getUTCDay() + 6) % 7;
 const cells: Array<string | null> = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)];
 while (cells.length % 7) cells.push(null);
 return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}
