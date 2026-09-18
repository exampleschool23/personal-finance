import { assets, liabilities, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { convertAmount } from './market';

export type PortfolioPoint = { date: string; assets: number; debt: number; net: number };
// Require a known balance for every included holding; never invent earlier balances.
export function portfolioHistory(records: Entry[], events: HistoryEvent[], currency: string, rates: number | Record<string, number> | undefined, today: string) {
 const eligible = records.filter(record => assets.includes(record.kind) || liabilities.includes(record.kind));
 const included = eligible.filter(record => convertAmount(1, record.currency, currency, rates) !== null);
 const byId = new Map(included.map(record => [record.id, record]));
 const balances = new Map<string, number>();
 const days = new Map<string, PortfolioPoint>();
 const sorted = events.filter(event => byId.has(event.record_id) && event.balance !== null && event.occurred_on <= today)
  .sort((a,b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
 for (const event of sorted) {
  const record = byId.get(event.record_id)!;
  const balance = convertAmount(Number(event.balance) * Number(event.ownership_percentage) / 100, record.currency, currency, rates);
  if (balance === null || !Number.isFinite(balance)) continue;
  balances.set(record.id, balance);
  if (balances.size !== included.length) continue;
  let assetTotal = 0, debt = 0;
  for (const [id, amount] of balances) {
   if (assets.includes(byId.get(id)!.kind)) assetTotal += amount;
   else debt += amount;
  }
  days.set(event.occurred_on, { date: event.occurred_on, assets: assetTotal, debt, net: assetTotal - debt });
 }
 return { points: [...days.values()], missing: included.length - balances.size, excluded: eligible.length - included.length };
}

export function portfolioWindow(points: PortfolioPoint[], days: number | null, today: string) {
 if (days === null || !points.length) return points;
 const start = new Date(Date.parse(today + 'T00:00:00Z') - days * 86400000).toISOString().slice(0,10);
 const previous = points.filter(point => point.date < start).at(-1);
 return [...(previous ? [{ ...previous, date: start }] : []), ...points.filter(point => point.date >= start)];
}

// Fit only the selected series, so a small balance change is not lost against zero.
export function portfolioChartDomain(points: PortfolioPoint[], keys: readonly ('net' | 'assets' | 'debt')[]): [number, number] {
 const values = points.flatMap(point => keys.map(key => point[key])).filter(Number.isFinite);
 if (!values.length) return [0, 1];
 const min = Math.min(...values), max = Math.max(...values);
 const padding = Math.max((max - min) * 0.15, Math.abs(max) * 0.001, Math.abs(min) * 0.001, 1);
 return [Math.floor(min - padding), Math.ceil(max + padding)];
}
