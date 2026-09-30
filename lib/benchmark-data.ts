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
// A published rate stays in force until the next one, so a checkpoint the feed
// fails to serve uses the closest earlier day it does serve. Each point keeps the
// day it was actually loaded for.
export async function loadFxCheckpoints(dates: string[], load: (date: string) => Promise<FxPoint>, lookback = 2): Promise<FxPoint[]> {
 async function near(date: string) {
  let failure: unknown;
  for (let back = 0; back <= lookback; back++) {
   try { return await load(shiftDay(date, -back)); } catch (error) { failure = error; }
  }
  throw failure;
 }
 // Check the source before scheduling the rest; a failed FX feed stays unavailable.
 const points = new Map<string, FxPoint>();
 const first = await near(dates[0]);
 points.set(first.date, first);
 let index = 1;
 await Promise.all(Array.from({ length: 3 }, async () => { while (index < dates.length) { const point = await near(dates[index++]); points.set(point.date, point); } }));
 return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
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
