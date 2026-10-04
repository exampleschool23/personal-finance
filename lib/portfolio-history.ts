import { shiftDay } from './calendar-days';
import { assets, liabilities, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { convertAmount } from './market';

export type PortfolioPoint = { date: string; assets: number; debt: number; net: number; partial?: boolean };
// Require known balances; an explicit zero opening contributes nothing before it opens.
export function portfolioHistory(records: Entry[], events: HistoryEvent[], currency: string, rates: number | Record<string, number> | undefined, today: string, includePartial = false) {
 const eligible = records.filter(record => assets.includes(record.kind) || liabilities.includes(record.kind));
 const included = eligible.filter(record => convertAmount(1, record.currency, currency, rates) !== null);
 const byId = new Map(included.map(record => [record.id, record]));
 const balances = new Map<string, number>();
 const days = new Map<string, PortfolioPoint>();
 const sorted = events.filter(event => byId.has(event.record_id) && event.balance !== null && event.occurred_on <= today)
  .sort((a,b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
 // A newly opened empty holding must not erase the history of existing holdings.
 // Only an explicit, dated zero baseline establishes this; positive observations
 // and records with unknown opening dates still require full historical coverage.
 const firstBalances = new Map<string, HistoryEvent>();
 for (const event of sorted) if (!firstBalances.has(event.record_id)) firstBalances.set(event.record_id, event);
 for (const record of included) {
  const first = firstBalances.get(record.id);
  const openedOn = record.opened_on || (['Business', 'Property', 'Valuables'].includes(record.kind) ? record.date : undefined);
  if (first?.event_type === 'baseline' && Number(first.balance) === 0 && openedOn === first.occurred_on
   && !events.some(event => event.record_id === record.id && event.occurred_on < openedOn)) balances.set(record.id, 0);
 }
 for (const event of sorted) {
  const record = byId.get(event.record_id)!;
  const balance = convertAmount(Number(event.balance) * Number(event.ownership_percentage) / 100, record.currency, currency, rates);
  if (balance === null || !Number.isFinite(balance)) continue;
  balances.set(record.id, balance);
  if (!includePartial && balances.size !== included.length) continue;
  let assetTotal = 0, debt = 0;
  for (const [id, amount] of balances) {
   if (assets.includes(byId.get(id)!.kind)) assetTotal += amount;
   else debt += amount;
  }
  days.set(event.occurred_on, { date: event.occurred_on, assets: assetTotal, debt, net: assetTotal - debt, ...(balances.size !== included.length ? {partial:true} : {}) });
 }
 return { points: [...days.values()], missing: included.length - balances.size, excluded: eligible.length - included.length };
}

// The first day a history period shows: the period's own start, or the owner's
// tracking start when that is later. '0000-01-01' shows every recorded day.
export function trackingWindowStart(days: number | null, today: string, origin?: string | null) {
 const period = days === null ? '0000-01-01' : shiftDay(today, -days);
 return origin && origin > period ? origin : period;
}
export function portfolioWindow(points: PortfolioPoint[], days: number | null, today: string, origin?: string | null) {
 const start = trackingWindowStart(days, today, origin);
 if (start === '0000-01-01' || !points.length) return points;
 const previous = points.filter(point => point.date < start).at(-1);
 return [...(previous ? [{ ...previous, date: start }] : []), ...points.filter(point => point.date >= start)];
}

