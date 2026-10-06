import { monthEnd, shiftMonth } from './calendar-days';
import type { PlanningData } from './planning';
import { occurrencesBetween, type RecurringItem } from './recurring';

/** The records, occurrences and loan payments a schedule's history is read from. */
export type ScheduleData = Pick<PlanningData, 'records' | 'occurrences' | 'debtPayments'>;

/** One schedule's occurrences from `from` (empty for its start) to `to`: a schedule's own, or a loan's monthly payments. */
function sameSchedule({ record, installment = false }: RecurringItem, data: ScheduleData, [from, to]: [string, string], today: string) {
 return occurrencesBetween(data.records, data.occurrences, from, to, today, installment ? data.debtPayments ?? [] : undefined).filter(item => item.record.id === record.id && !!item.installment === installment);
}

/** One month of a schedule's history: what was scheduled (skipped occurrences left out) and what actually came in or went out. */
export type ScheduleMonth = { month: string; scheduled: number; recorded: number };

/** A schedule's track record over the last `months` months, up to this month: month by month, the totals, and each occurrence, newest first.
 * The window starts no earlier than the schedule's first month, so a new schedule has no empty months before it. */
export function scheduleTrack(schedule: RecurringItem, data: ScheduleData, today: string, months: number) {
 const current = today.slice(0, 7), first = (schedule.record.date ?? today).slice(0, 7);
 const window = shiftMonth(current, -(months - 1));
 const start = first > window ? first : window;
 // The occurrences up to the end of this month, then only this schedule's (or this loan's monthly payments).
 const items = sameSchedule(schedule, data, [start + '-01', monthEnd(current)], today);
 const points: ScheduleMonth[] = [];
 for (let month = start; month <= current; month = shiftMonth(month, 1)) points.push({ month, scheduled: 0, recorded: 0 });
 const byMonth = new Map(points.map(point => [point.month, point]));
 let recorded = 0, scheduled = 0;
 for (const item of items) {
  const point = byMonth.get(item.date.slice(0, 7));
  if (!point || item.status === 'skipped') continue;
  point.scheduled += item.amount; scheduled += item.amount;
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
  history: [...items].reverse() as RecurringItem[],
 };
}

/** The next occurrence still to come or still open: the oldest overdue one, otherwise the first one due. */
export function nextOccurrence(schedule: RecurringItem, data: ScheduleData, today: string) {
 return sameSchedule(schedule, data, ['', monthEnd(shiftMonth(today.slice(0, 7), 12))], today).find(item => item.status === 'due' || item.status === 'overdue');
}
