export type PricePoint = { date: string; close: number };
export type FxPoint = { date: string; rates: Record<string, number> };
export type BenchmarkData = { start: string; end: string; prices: Record<string, PricePoint[]>; fx: FxPoint[]; errors: Record<string, string> };
export const dayMillis = 86400000;
export const dateMillis = (date: string) => Date.parse(date + 'T00:00:00Z');
export const shiftDay = (date: string, days: number) => new Date(dateMillis(date) + days * dayMillis).toISOString().slice(0, 10);
export function validDay(date: string) {
 return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(dateMillis(date)) && new Date(dateMillis(date)).toISOString().slice(0, 10) === date;
}
export function checkpointDates(start: string, end: string) {
 const days = Math.round((dateMillis(end) - dateMillis(start)) / dayMillis);
 const step = Math.max(1, Math.ceil(days / 24));
 const dates: string[] = [];
 for (let day = 0; day < days; day += step) dates.push(shiftDay(start, day));
 return [...dates, end];
}
export function latestOn<T extends { date: string }>(points: T[], date: string): T | undefined {
 // Inputs are sorted by their source adapter.
 return points.findLast(point => point.date <= date);
}
export function historicalRate(fx: FxPoint[], currency: string, date: string) {
 if (currency === 'USD') return 1;
 const point = latestOn(fx, date);
 const rate = point?.rates[currency];
 return rate && Number.isFinite(rate) && rate > 0 ? rate : null;
}
