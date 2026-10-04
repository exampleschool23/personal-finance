// Calendar arithmetic on ISO days (`YYYY-MM-DD`) and months (`YYYY-MM`).
// Every value is read and written at UTC midnight, so a date-only value stays on its calendar day
// whatever the runtime's timezone. The app's own "today" (Asia/Tashkent) is `depositToday` in lib/deposit-interest.ts.
// lib/finance.ts, lib/deposit-interest.ts and lib/investment-history.ts keep their few lines of day arithmetic
// local: tests and scripts import them natively with Node, which cannot resolve an extensionless import.

/** Milliseconds in one calendar day. */
export const dayMs = 86400000;
/** UTC midnight of an ISO day, in milliseconds (NaN for an invalid day). */
export const dayTime = (day: string) => Date.parse(day + 'T00:00:00Z');
/** The ISO day of a UTC timestamp in milliseconds. */
export const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
/** An ISO day moved by whole days; negative values move back. */
export const shiftDay = (day: string, days: number) => isoDay(dayTime(day) + days * dayMs);
/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((dayTime(to) - dayTime(from)) / dayMs);
/** An ISO month moved by whole months; negative values move back. */
export function shiftMonth(month: string, months: number) {
 const date = new Date(month + '-01T00:00:00Z');
 date.setUTCMonth(date.getUTCMonth() + months);
 return date.toISOString().slice(0, 7);
}
/** An ISO day moved by whole months, keeping its day of the month clamped to the target month's end (31 January + 1 month = 28 or 29 February). */
export function addMonths(day: string, months: number) {
 const [year, month, date] = day.split('-').map(Number), target = month - 1 + months;
 return isoDay(Date.UTC(year, target, Math.min(date, new Date(Date.UTC(year, target + 1, 0)).getUTCDate())));
}
/** The last ISO day of an ISO month. */
export const monthEnd = (month: string) => isoDay(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
/** How many days an ISO month has. */
export const monthDays = (month: string) => Number(monthEnd(month).slice(8));
