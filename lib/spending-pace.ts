import { expenses, type Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';
import type { PortfolioSnapshot } from './portfolio-snapshots';
import { spendingAmount } from './spending';
import { monthlyReview, type TransactionSplit } from './transaction-tools';

export type SpendingPacePoint = { day: number; current: number | null; previous: number | null };
export type SpendingPace = { month: string; previousMonth: string; points: SpendingPacePoint[]; spent: number; previousToDate: number; missing: boolean; empty: boolean };
type Input = { records: Entry[]; splits: TransactionSplit[]; snapshots: PortfolioSnapshot[]; activity?: PlanningData['activity']; investmentLinks?: PlanningData['investmentLinks'] };

export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const dayOf = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`;
export function previousMonthOf(month: string) {
 const date = new Date(month + '-01T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() - 1);
 return date.toISOString().slice(0, 7);
}

/** Cumulative spending by day of the month, for this month (through today) and the month before.
 * Each point is the Monthly review's own spending total with the day as its cut-off, so the two always agree. */
export function spendingPace(input: Input, today: string, currency: string, rates?: number | Record<string, number>): SpendingPace {
 const month = today.slice(0, 7), previousMonth = previousMonthOf(month);
 const spentBy = (target: string, cutoff: string) => monthlyReview(input.records, input.splits, input.snapshots, target, currency, cutoff, input.activity ?? [], rates, input.investmentLinks ?? []);
 const length = Math.max(daysIn(month), daysIn(previousMonth)), todayDay = Number(today.slice(8, 10));
 let missing = false;
 const points: SpendingPacePoint[] = [];
 for (let day = 1; day <= length; day++) {
  const current = day <= todayDay && day <= daysIn(month) ? spentBy(month, dayOf(month, day)) : null;
  // A shorter previous month keeps its final total for the days it does not have.
  const previous = spentBy(previousMonth, dayOf(previousMonth, Math.min(day, daysIn(previousMonth))));
  if (current?.missing || previous.missing) missing = true;
  points.push({ day, current: current ? current.spent : null, previous: previous.spent });
 }
 const reached = points[Math.min(todayDay, length) - 1];
 // Nothing spent in either month: the card shows an empty state rather than a meaningless $0–$1 axis.
 const empty = !missing && points.every(point => !point.current && !point.previous);
 return { month, previousMonth, points, spent: reached.current ?? 0, previousToDate: reached.previous ?? 0, missing, empty };
}

export type SpendingItem = { id: string; name: string; kind: string; amount: number };
/** Where the money went on one day: that day's actual spending, by the Monthly review's definition, largest first.
 * An amount without a rate to `currency` is left out rather than guessed. */
export function spendingOnDay(records: Entry[], date: string, currency: string, rates?: number | Record<string, number>): SpendingItem[] {
 const items: SpendingItem[] = [];
 for (const record of records) {
  if (record.frequency !== 'Once' || record.date !== date || !expenses.includes(record.kind)) continue;
  const amount = convertAmount(spendingAmount(record), record.currency, currency, rates);
  if (amount !== null && Number.isFinite(amount) && amount > 0) items.push({ id: record.id, name: record.name, kind: record.kind, amount });
 }
 return items.sort((a, b) => b.amount - a.amount);
}
