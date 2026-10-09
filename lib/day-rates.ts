/** The official rate of a day: units of `to` for one unit of `from`. */
export type DayRate = (from: string, to: string, date: string) => Promise<number>;

/** How many dated-rate requests one read keeps open at a time. */
export const dayRateConcurrency = 4;

/** A day rate asked for once per currency pair and day, with at most `limit` requests under way at a time. One planning
 * read shares it between loan payments and scheduled payments, so a payment day in several lists costs one request,
 * and a long history never opens a request per payment at once. A failed day stays failed for the read. */
export function sharedDayRate(rate: DayRate, limit = dayRateConcurrency): DayRate {
 const quotes = new Map<string, Promise<number>>();
 const waiting: Array<() => void> = [];
 let active = 0;
 const slot = () => new Promise<void>(resolve => { if (active < limit) { active++; resolve(); } else waiting.push(() => { active++; resolve(); }); });
 const release = () => { active--; waiting.shift()?.(); };
 return (from, to, date) => {
  const key = from + ':' + to + ':' + date;
  let quote = quotes.get(key);
  if (!quote) {
   quote = slot().then(() => rate(from, to, date)).finally(release);
   quotes.set(key, quote);
  }
  return quote;
 };
}
