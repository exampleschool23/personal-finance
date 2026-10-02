import { expenses, income, type Entry } from './finance';
import { convertAmount } from './market';
import { upcomingPayments, type Occurrence } from './planning';

const shift = (day: string, days: number) => new Date(Date.parse(day + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
/** Monday of the week containing `day`. */
export const weekStart = (day: string) => shift(day, -((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7));

type Rates = number | Record<string, number> | undefined;
/** Money in and out over a span of days, with the category that took the most. */
function weekTotals(records: Entry[], from: string, to: string, currency: string, rates: Rates) {
 let received = 0, spent = 0, missing = 0;
 const categories = new Map<string, number>();
 for (const record of records) {
  if (record.frequency !== 'Once' || record.date < from || record.date > to || (!income.includes(record.kind) && !expenses.includes(record.kind))) continue;
  const value = convertAmount(Number(record.amount), record.currency, currency, rates);
  if (value === null) { missing++; continue; }
  if (income.includes(record.kind)) received += value;
  else { spent += value; const key = record.custom_category_id ?? record.kind; categories.set(key, (categories.get(key) ?? 0) + value); }
 }
 const top = [...categories].sort((a, b) => b[1] - a[1])[0];
 return { received, spent, missing, top: top ? { key: top[0], amount: top[1] } : null };
}

/** Monarch's weekly recap: last full week (Monday to Sunday) against the week before, and the bills due this week. */
export function weeklyRecap(records: Entry[], occurrences: Occurrence[], today: string, currency: string, rates: Rates) {
 const thisWeek = weekStart(today), from = shift(thisWeek, -7), to = shift(thisWeek, -1);
 const last = weekTotals(records, from, to, currency, rates), before = weekTotals(records, shift(from, -7), shift(from, -1), currency, rates);
 const due = upcomingPayments(records, occurrences, today, shift(thisWeek, 6)).filter(item => item.date >= today && item.type === 'scheduled' && expenses.includes(item.record.kind));
 const dueTotal = due.reduce((sum, item) => sum + (convertAmount(Number(item.record.amount), item.record.currency, currency, rates) ?? 0), 0);
 return { from, to, ...last, spendingChange: last.spent - before.spent, upcoming: { count: due.length, total: dueTotal } };
}
