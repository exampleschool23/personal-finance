import type { HistoryEvent } from './investment-history';

// Use the account's reporting timezone, independent of the server/browser timezone.
export const depositToday = (now = new Date()) => new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Simple annual-rate / 12 estimate, weighted by calendar days at each balance.
 * A change applies from its date. Unknown days before the first snapshot earn zero.
 * No compounding; the current annual rate applies to the entire selected month.
 */
export function depositInterest(events: HistoryEvent[], annualRate: number, month = depositToday().slice(0, 7)) {
 const start = Date.parse(month + '-01T00:00:00Z');
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(start) || !Number.isFinite(annualRate) || annualRate < 0) return 0;
 const endDate = new Date(start); endDate.setUTCMonth(endDate.getUTCMonth() + 1);
 const end = endDate.getTime();
 const sorted = events.filter(e => e.balance !== null && e.occurred_on < endDate.toISOString().slice(0,10))
  .sort((a,b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
 let balance = 0, cursor = start, weighted = 0;
 for (const event of sorted) {
  const at = Date.parse(event.occurred_on + 'T00:00:00Z');
  if (!Number.isFinite(at)) continue;
  if (at > start) { weighted += balance * (at - cursor); cursor = at; }
  balance = Number(event.balance);
 }
 weighted += balance * (end - cursor);
 return weighted / (end - start) * annualRate / 1200;
}
