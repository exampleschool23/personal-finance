import { z } from 'zod';

export const stockBenchmarkKey = z.string().regex(/^STOCK:[A-Z][A-Z0-9.-]{0,14}$/);
export const benchmarkSelectionSchema = z.array(z.union([z.enum(['BTC','SPY','HYG','depositUZS','depositUSD','CUSTOM','PORTFOLIO']), stockBenchmarkKey])).min(1).max(17).refine(items => new Set(items).size === items.length).refine(items => items.filter(key => key.startsWith('STOCK:') || key === 'CUSTOM').length <= 10);
export function stockBenchmarks(keys: readonly string[]) {
 return keys.filter(key => stockBenchmarkKey.safeParse(key).success).map(key => ({id:key,symbol:key.slice(6)}));
}
