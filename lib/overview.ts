import { assets, totalValue, type Entry } from './finance';
import type { DueItem } from './planning';

/** Entries must already be expressed in the display currency. Shares stay precise; round only when displaying. */
export function assetAllocation(entries: readonly Entry[]) {
 const total = totalValue(entries, assets);
 return assets.map(kind => ({ kind, total: totalValue(entries, [kind]) }))
  .filter(item => item.total > 0)
  .sort((a, b) => b.total - a.total)
  .map(item => ({ ...item, share: item.total / total * 100 }));
}

/** Percentage change against the opening value; null when the opening value is not positive. */
export function changePercent(current: number, change: number | null) {
 if (change === null) return null;
 const opening = current - change;
 return opening > 0 ? change / opening * 100 : null;
}

/** Overdue items come first, then the nearest due dates. */
export function nextPayments(due: readonly DueItem[], limit = 5) {
 return [...due].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date) || a.record.name.localeCompare(b.record.name)).slice(0, limit);
}
