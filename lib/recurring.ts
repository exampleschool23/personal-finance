import { daysBetween, monthDays, monthEnd, shiftDay } from './calendar-days';
import { archivedIn, scheduleDates, income, type Entry } from './finance';
import { amountIn, type Money } from './money';
import { installmentDates, installmentsFrom, isRecurringCashFlow, laterPayments, paidInstallmentAmounts, paidInstallmentMonths, scheduleAssets, scheduleStart, settledOccurrences, type DebtPayment, type Occurrence } from './planning';

export type RecurringStatus = 'paid' | 'skipped' | 'due' | 'overdue';
/** `installment` is a loan's monthly payment; it is paid by a repayment or mortgage payment in its month. */
/** `amount` is what was scheduled; `recorded` is what was actually received or paid (0 when nothing came), when known;
 * null when a payment in another currency could not be converted into the schedule's. */
/** `entered` is what was recorded as it was entered, in its own currency, when every payment of the due date shares one
 * currency and all of them are loaded; otherwise undefined and `recorded` (in the schedule's currency) is shown. */
export type RecurringItem = { key: string; record: Entry; date: string; status: RecurringStatus; direction: 'income' | 'expense'; amount: number; recorded?: number | null; entered?: Money; installment?: boolean };

/** Every scheduled income and expense in a month and, when the loan payments are known, each loan's monthly payment, with whether it was paid, skipped, is still due or is overdue. */
export function monthOccurrences(records: Entry[], occurrences: Occurrence[], month: string, today: string, debtPayments?: DebtPayment[]): RecurringItem[] {
 return occurrencesBetween(records, occurrences, month + '-01', monthEnd(month), today, debtPayments);
}

/** Scheduled incomes and bills still open from the months before `month`: overdue, neither recorded (a recorded 0 counts) nor skipped, oldest first. They stay in sight in the current month until settled. Loan payments are left out: their reminders list them. */
export function carriedOverdue(records: Entry[], occurrences: Occurrence[], month: string, today: string): RecurringItem[] {
 return occurrencesBetween(records, occurrences, '', shiftDay(month + '-01', -1), today).filter(item => item.status === 'overdue');
}

/** The occurrences from `from` (inclusive; empty for each schedule's start) to `to`. */
export function occurrencesBetween(records: Entry[], occurrences: Occurrence[], from: string, to: string, today: string, debtPayments?: DebtPayment[]): RecurringItem[] {
 const settled = settledOccurrences(records, occurrences), paid = debtPayments && paidInstallmentMonths(debtPayments);
 const status = new Map(occurrences.map(item => [item.record_id + ':' + item.due_on, item.status]));
 const assets = scheduleAssets(records);
 // What was actually recorded for each settled occurrence (0 when nothing came), counted only in its schedule's
 // currency: the read converts payments made in another currency; one it could not convert stays unknown.
 const byId = new Map(records.map(record => [record.id, record]));
 const currencyOf = new Map(records.map(record => [record.id, record.currency]));
 const recorded = new Map<string, number | null>();
 const record = (key: string, scheduleId: string, payment: { amount: number | null; currency?: string }) => {
  const currency = currencyOf.get(scheduleId);
  recorded.set(key, payment.amount === null ? null : currency && payment.currency ? amountIn({ amount: payment.amount, currency: payment.currency }, currency) : Number(payment.amount));
 };
 for (const item of occurrences) { const transaction = item.status !== 'paid' ? undefined : item.transaction ?? (item.transaction_id ? byId.get(item.transaction_id) : undefined); if (transaction) record(item.record_id + ':' + item.due_on, item.record_id, transaction); }
 // Later payments add to what the first one recorded: totalled by the read, or found among the loaded records.
 const extras = laterPayments(occurrences, records.flatMap(entry => entry.occurrence_record_id && entry.occurrence_due_on ? [{ id: entry.id, occurrence_record_id: entry.occurrence_record_id, occurrence_due_on: entry.occurrence_due_on, amount: entry.amount, currency: entry.currency }] : []), currencyOf);
 const entered = enteredPayments(records, occurrences, byId, extras);
 for (const item of occurrences) { const key = item.record_id + ':' + item.due_on; if (item.extra !== undefined) extras.set(key, item.extra); }
 for (const [key, extra] of extras) if (recorded.has(key)) { const first = recorded.get(key)!; recorded.set(key, first === null || extra === null ? null : first + extra); }
 const items: RecurringItem[] = [];
 for (const record of records) {
  if (!record.date || record.source_paused || record.archived || !isRecurringCashFlow(record)) continue;
  const start = scheduleStart(record, assets);
  for (const date of scheduleDates(record, start > from ? start : from, to)) {
   // Months it was archived have no payments; Restore resumes from its own month.
   if (archivedIn(record, date.slice(0, 7))) continue;
   const key = record.id + ':' + date;
   const done = status.get(key) === 'dismissed' ? 'skipped' : settled.has(key) ? 'paid' : null;
   items.push({ key, record, date, status: done ?? (date < today && date >= installmentsFrom(record) ? 'overdue' : 'due'), direction: income.includes(record.kind) ? 'income' : 'expense', amount: Number(record.amount), recorded: done === 'paid' ? recorded.get(key) : undefined, entered: done === 'paid' ? entered.get(key) ?? undefined : undefined });
  }
 }
 // A loan month counts what its payments actually paid: a $450 payment does not settle a $1,600 installment in full.
 const paidAmounts = debtPayments && paidInstallmentAmounts(debtPayments, currencyOf);
 if (paid) for (const record of records) {
  const start = installmentsFrom(record);
  for (const date of installmentDates(record, start > from ? start : from, to)) {
   if (date === record.date) continue;
   const month = record.id + ':' + date.slice(0, 7), settled = paid.has(month);
   items.push({ key: record.id + ':installment:' + date, record, date, status: settled ? 'paid' : date < today ? 'overdue' : 'due', direction: 'expense', amount: Number(record.estimated_monthly_payment), recorded: settled ? paidAmounts?.get(month) : undefined, installment: true });
  }
 }
 return items.sort((a, b) => a.date.localeCompare(b.date) || a.record.name.localeCompare(b.record.name));
}

/** Each settled due date's payments as they were entered, in their own currency: the first payment and the later ones
 * among the loaded records. Null when they mix currencies, one has no amount, or the read totalled later payments it did
 * not load (those are known only in the schedule's currency, so `recorded` is shown instead). */
function enteredPayments(records: readonly Entry[], occurrences: readonly Occurrence[], byId: ReadonlyMap<string, Entry>, loadedExtras: ReadonlyMap<string, number | null>) {
 const entered = new Map<string, Money | null>();
 const enter = (key: string, payment: { amount: number | null; currency?: string }) => entered.set(key, addEntered(entered.get(key), payment));
 const firsts = new Set<string>();
 for (const item of occurrences) {
  const transaction = item.status !== 'paid' ? undefined : item.transaction ?? (item.transaction_id ? byId.get(item.transaction_id) : undefined);
  if (item.transaction_id) firsts.add(item.transaction_id);
  // The read hands on a payment converted into its schedule's currency with what was entered beside it.
  if (transaction) enter(item.record_id + ':' + item.due_on, ('entered' in transaction && transaction.entered) || transaction);
 }
 laterEntered({ records, occurrences, firsts, loadedExtras }, enter, key => entered.set(key, null));
 return entered;
}

/** Later payments as entered: as the read handed them on (`extraEntered`), else as found among the loaded records. A due
 * date whose later payments the read totalled but did not load is unknown as entered (`unknown`). */
function laterEntered({ records, occurrences, firsts, loadedExtras }: { records: readonly Entry[]; occurrences: readonly Occurrence[]; firsts: ReadonlySet<string>; loadedExtras: ReadonlyMap<string, number | null> },
 enter: (key: string, payment: { amount: number | null; currency?: string }) => void, unknown: (key: string) => void) {
 const fromRead = new Set<string>();
 for (const item of occurrences) if (item.extraEntered !== undefined) { const key = item.record_id + ':' + item.due_on; fromRead.add(key); enter(key, item.extraEntered ?? { amount: null }); }
 for (const entry of records) { const key = entry.occurrence_record_id + ':' + entry.occurrence_due_on; if (entry.occurrence_record_id && entry.occurrence_due_on && !firsts.has(entry.id) && !fromRead.has(key)) enter(key, entry); }
 for (const item of occurrences) { const key = item.record_id + ':' + item.due_on; if (!fromRead.has(key) && item.extra !== undefined && item.extra !== (loadedExtras.get(key) ?? 0)) unknown(key); }
}

/** One more payment added to what was entered so far: one currency adds up; a second currency, or no amount, ends it (null). */
function addEntered(before: Money | null | undefined, payment: { amount: number | null; currency?: string }): Money | null {
 if (before === null || payment.amount === null || !payment.currency || (before && before.currency !== payment.currency)) return null;
 return { amount: (before?.amount ?? 0) + Number(payment.amount), currency: payment.currency };
}

/** A repeating income or bill to archive or restore. */
export type ArchiveTarget = { source: 'record'; record: Entry };

/** The transactions recorded against a schedule: each recorded occurrence's payment and any later payment for it.
 * Deleting the schedule keeps them in history or deletes them too. */
export function scheduleHistory(target: ArchiveTarget, records: Entry[], occurrences: Occurrence[]): string[] {
 const id = target.record.id;
 const ids = new Set(occurrences.flatMap(item => item.record_id === id && item.status === 'paid' && item.transaction_id ? [item.transaction_id] : []));
 for (const record of records) if (record.occurrence_record_id === id) ids.add(record.id);
 return [...ids];
}

/** Repeating incomes and bills that were archived, by name; loan payments are never archived here. */
export const archivedSchedules = (records: Entry[]) => records.filter(record => record.archived && !record.source_paused && isRecurringCashFlow(record)).sort((a, b) => a.name.localeCompare(b.name));

/** The list narrowed to one side when Income or Expenses is tapped. */
export function onlyDirection(items: RecurringItem[], carried: RecurringItem[], only: RecurringItem['direction'] | null) {
 const keep = (item: RecurringItem) => !only || item.direction === only;
 return { shown: items.filter(keep), shownCarried: carried.filter(keep) };
}

/** Summary bars: how much came in or went out, and how much is still to come. Skipped items count as neither. */
export function recurringSummary(items: RecurringItem[], convert: (amount: number, currency: string) => number | null) {
 const totals = { income: { done: 0, remaining: 0 }, expense: { done: 0, remaining: 0 }, missing: 0 };
 for (const item of items) {
  if (item.status === 'skipped') continue;
  // A settled payment counts what actually came in or went out.
  if (item.recorded === null) { totals.missing++; continue; }
  const value = convert(item.status === 'paid' ? item.recorded ?? item.amount : item.amount, item.record.currency);
  if (value === null) { totals.missing++; continue; }
  totals[item.direction][item.status === 'paid' ? 'done' : 'remaining'] += value;
 }
 return totals;
}

/** Whole days from today to a date: positive ahead, negative behind. */
// Kept for components/planning/upcoming-page.tsx, which imports `daysFrom` from here.
export const daysFrom = (today: string, date: string) => daysBetween(today, date);

/** The weeks of a month for a Monday-first calendar; days outside the month are null. */
export function calendarWeeks(month: string) {
 const first = new Date(month + '-01T00:00:00Z'), days = monthDays(month);
 const offset = (first.getUTCDay() + 6) % 7;
 const cells: Array<string | null> = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)];
 while (cells.length % 7) cells.push(null);
 return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}
