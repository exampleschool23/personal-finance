import { monthEnd, shiftMonth } from './calendar-days';
import { installmentAnchor, installmentDates, paidInstallmentAmounts, type PlanningData } from './planning';
import { occurrencesBetween, type RecurringItem } from './recurring';

/** The records, occurrences and loan payments a schedule's history is read from. */
export type ScheduleData = Pick<PlanningData, 'records' | 'occurrences' | 'debtPayments'>;

/** One schedule's occurrences from `from` (empty for its start) to `to`: a schedule's own, or a loan's monthly payments. */
function sameSchedule({ record, installment = false }: RecurringItem, data: ScheduleData, [from, to]: [string, string], today: string) {
 return occurrencesBetween(data.records, data.occurrences, from, to, today, installment ? data.debtPayments ?? [] : undefined).filter(item => item.record.id === record.id && !!item.installment === installment);
}

/** One month of a schedule's history: what was scheduled (skipped occurrences left out) and what actually came in or went out. */
export type ScheduleMonth = { month: string; scheduled: number; recorded: number };

/** A schedule's track record over `months` months: month by month, the totals, and each occurrence up to this month, newest first.
 * The window starts no earlier than the schedule's first month; months it cannot fill before then are replaced with the months
 * ahead, which show only what is scheduled (like Income over time). Totals and the payment list stop at this month. */
export function scheduleTrack(schedule: RecurringItem, data: ScheduleData, today: string, months: number) {
 const current = today.slice(0, 7), first = firstMonth(schedule, data, today);
 const window = shiftMonth(current, -(months - 1));
 const start = first > window ? first : window, end = shiftMonth(start, months - 1);
 // The occurrences up to the end of the window, then only this schedule's (or this loan's monthly payments).
 const items = [...sameSchedule(schedule, data, [start + '-01', monthEnd(end)], today), ...unscheduledPayments(schedule, data, start, current)]
  .sort((a, b) => a.date.localeCompare(b.date));
 const points: ScheduleMonth[] = [];
 for (let month = start; month <= end; month = shiftMonth(month, 1)) points.push({ month, scheduled: 0, recorded: 0 });
 const byMonth = new Map(points.map(point => [point.month, point]));
 let recorded = 0, scheduled = 0;
 for (const item of items) {
  const month = item.date.slice(0, 7), point = byMonth.get(month);
  if (!point || item.status === 'skipped') continue;
  point.scheduled += item.amount;
  if (month <= current) scheduled += item.amount;
  if (item.status === 'paid') { const value = item.recorded ?? item.amount; point.recorded += value; recorded += value; }
 }
 const settledMonths = points.filter(point => point.recorded > 0).length;
 return {
  points,
  recorded,
  scheduled,
  /** The average over the months something was recorded, so months before the first payment do not pull it down. */
  average: settledMonths ? recorded / settledMonths : 0,
  /** Recorded against scheduled, as a percentage; null when nothing was scheduled yet. */
  percent: scheduled > 0 ? recorded / scheduled * 100 : null,
  history: items.filter(item => item.date.slice(0, 7) <= current).reverse() as RecurringItem[],
 };
}

/** The month a schedule's history starts: a schedule's start date; for a loan's monthly payments, the loan's start (its `date`
 * is when it is due in full, years ahead), or an earlier month a payment was made in. */
function firstMonth(schedule: RecurringItem, data: ScheduleData, today: string) {
 if (!schedule.installment) return (schedule.record.date ?? today).slice(0, 7);
 const paid = (data.debtPayments ?? []).filter(payment => payment.record_id === schedule.record.id).map(payment => payment.date);
 return [installmentAnchor(schedule.record) ?? today, ...paid].sort()[0].slice(0, 7);
}

/** A loan payment made in a month with no monthly payment due (the loan's first month, before its first payment day) still
 * happened: it shows as that month's payment, against the loan's monthly payment, rather than disappearing from the history. */
function unscheduledPayments(schedule: RecurringItem, data: ScheduleData, from: string, through: string): RecurringItem[] {
 if (!schedule.installment) return [];
 const { record } = schedule, payments = (data.debtPayments ?? []).filter(payment => payment.record_id === record.id);
 const due = new Set(installmentDates(record, from + '-01', monthEnd(through)).map(date => date.slice(0, 7)));
 const amounts = paidInstallmentAmounts(payments, new Map(data.records.map(entry => [entry.id, entry.currency])));
 const firsts = new Map<string, string>();
 for (const payment of [...payments].sort((a, b) => a.date.localeCompare(b.date))) { const month = payment.date.slice(0, 7); if (month >= from && month <= through && !due.has(month) && !firsts.has(month)) firsts.set(month, payment.date); }
 return [...firsts].map(([month, date]) => ({ key: record.id + ':installment:' + date, record, date, status: 'paid', direction: 'expense', amount: Number(record.estimated_monthly_payment), recorded: amounts.get(record.id + ':' + month), installment: true }));
}

/** The next occurrence still to come or still open: the oldest overdue one, otherwise the first one due. */
export function nextOccurrence(schedule: RecurringItem, data: ScheduleData, today: string) {
 return sameSchedule(schedule, data, ['', monthEnd(shiftMonth(today.slice(0, 7), 12))], today).find(item => item.status === 'due' || item.status === 'overdue');
}
