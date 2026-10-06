import { daysBetween, monthDays, monthEnd, shiftDay } from './calendar-days';
import { archivedIn, scheduleDates, income, type Entry } from './finance';
import { expensePlanTotals, type ExpensePlan } from './expense-plans';
import { installmentDates, installmentsFrom, isRecurringCashFlow, paidInstallmentMonths, scheduleAssets, scheduleStart, settledOccurrences, type DebtPayment, type Occurrence } from './planning';

export type RecurringStatus = 'paid' | 'skipped' | 'due' | 'overdue';
/** `installment` is a loan's monthly payment; it is paid by a repayment or mortgage payment in its month. */
/** `amount` is what was scheduled; `recorded` is what was actually received or paid (0 when nothing came), when known. */
export type RecurringItem = { key: string; record: Entry; date: string; status: RecurringStatus; direction: 'income' | 'expense'; amount: number; recorded?: number; installment?: boolean };

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
 // What was actually recorded for each settled occurrence (0 when nothing came).
 const byId = new Map(records.map(record => [record.id, record]));
 const recorded = new Map<string, number>();
 for (const item of occurrences) { const transaction = item.status !== 'paid' ? undefined : item.transaction ?? (item.transaction_id ? byId.get(item.transaction_id) : undefined); if (transaction) recorded.set(item.record_id + ':' + item.due_on, Number(transaction.amount)); }
 for (const record of records) if (record.kind === 'Salary' && record.frequency === 'Once' && record.income_source_id) recorded.set(record.income_source_id + ':' + (record.income_due_on ?? record.date), Number(record.amount));
 // Later payments add to what the first one recorded: totalled by the read, or found among the loaded records.
 const extras = new Map<string, number>();
 for (const record of records) if (record.occurrence_record_id && record.occurrence_due_on) { const key = record.occurrence_record_id + ':' + record.occurrence_due_on; extras.set(key, (extras.get(key) ?? 0) + Number(record.amount)); }
 for (const item of occurrences) { const key = item.record_id + ':' + item.due_on; if (item.extra !== undefined) extras.set(key, item.extra); }
 for (const [key, extra] of extras) if (recorded.has(key)) recorded.set(key, recorded.get(key)! + extra);
 const items: RecurringItem[] = [];
 for (const record of records) {
  if (!record.date || record.source_paused || record.archived || !isRecurringCashFlow(record)) continue;
  const start = scheduleStart(record, assets);
  for (const date of scheduleDates(record, start > from ? start : from, to)) {
   // Months it was archived have no payments; Restore resumes from its own month.
   if (archivedIn(record, date.slice(0, 7))) continue;
   const key = record.id + ':' + date;
   const done = status.get(key) === 'dismissed' ? 'skipped' : settled.has(key) ? 'paid' : null;
   items.push({ key, record, date, status: done ?? (date < today ? 'overdue' : 'due'), direction: income.includes(record.kind) ? 'income' : 'expense', amount: Number(record.amount), recorded: done === 'paid' ? recorded.get(key) : undefined });
  }
 }
 if (paid) for (const record of records) {
  const start = installmentsFrom(record);
  for (const date of installmentDates(record, start > from ? start : from, to)) {
   if (date === record.date) continue;
   items.push({ key: record.id + ':installment:' + date, record, date, status: paid.has(record.id + ':' + date.slice(0, 7)) ? 'paid' : date < today ? 'overdue' : 'due', direction: 'expense', amount: Number(record.estimated_monthly_payment), installment: true });
  }
 }
 return items.sort((a, b) => a.date.localeCompare(b.date) || a.record.name.localeCompare(b.record.name));
}

/** A repeating income or bill, or a spending plan, to archive or restore. */
export type ArchiveTarget = { source: 'record'; record: Entry } | { source: 'plan'; plan: ExpensePlan };

/** The transactions recorded against a schedule or spending plan: each recorded occurrence's payment and any later payment for it, or a plan's spending.
 * Deleting the schedule keeps them in history or deletes them too. */
export function scheduleHistory(target: ArchiveTarget, records: Entry[], occurrences: Occurrence[]): string[] {
 if (target.source === 'plan') return records.filter(record => record.expense_plan_id === target.plan.id).map(record => record.id);
 const id = target.record.id;
 const ids = new Set(occurrences.flatMap(item => item.record_id === id && item.status === 'paid' && item.transaction_id ? [item.transaction_id] : []));
 for (const record of records) if (record.occurrence_record_id === id) ids.add(record.id);
 return [...ids];
}

/** Repeating incomes and bills that were archived, by name; loan payments are never archived here. */
export const archivedSchedules = (records: Entry[]) => records.filter(record => record.archived && !record.source_paused && isRecurringCashFlow(record)).sort((a, b) => a.name.localeCompare(b.name));

/** A monthly spending plan (groceries, family support) beside the month's bills: what it allows and what was spent from it. */
export type RecurringPlan = { plan: ExpensePlan; planned: number; spent: number };

/** The spending plans running in a month, by name. */
export function monthPlans(plans: readonly ExpensePlan[], month: string): RecurringPlan[] {
 return plans.flatMap(plan => { const totals = expensePlanTotals(plan, month); return totals.active && !archivedIn(plan, month) ? [{ plan, planned: totals.planned, spent: totals.spent }] : []; })
  .sort((a, b) => a.plan.name.localeCompare(b.plan.name));
}

/** The list narrowed to one side when Income or Expenses is tapped; spending plans are expenses. */
export function onlyDirection(items: RecurringItem[], carried: RecurringItem[], plans: RecurringPlan[], only: RecurringItem['direction'] | null) {
 const keep = (item: RecurringItem) => !only || item.direction === only;
 return { shown: items.filter(keep), shownCarried: carried.filter(keep), shownPlans: only === 'income' ? [] : plans };
}

/** Summary bars: how much came in or went out, and how much is still to come. Skipped items count as neither. A spending plan adds what was spent and what it still allows; overspending adds nothing still to come. */
export function recurringSummary(items: RecurringItem[], convert: (amount: number, currency: string) => number | null, plans: readonly RecurringPlan[] = []) {
 const totals = { income: { done: 0, remaining: 0 }, expense: { done: 0, remaining: 0 }, missing: 0 };
 for (const item of items) {
  if (item.status === 'skipped') continue;
  // A settled payment counts what actually came in or went out.
  const value = convert(item.status === 'paid' ? item.recorded ?? item.amount : item.amount, item.record.currency);
  if (value === null) { totals.missing++; continue; }
  totals[item.direction][item.status === 'paid' ? 'done' : 'remaining'] += value;
 }
 for (const { plan, planned, spent } of plans) {
  const done = convert(spent, plan.currency), remaining = convert(Math.max(planned - spent, 0), plan.currency);
  if (done === null || remaining === null) { totals.missing++; continue; }
  totals.expense.done += done; totals.expense.remaining += remaining;
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
