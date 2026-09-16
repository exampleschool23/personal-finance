import type { Entry } from './finance';

export const coins = [
  ['BTC', 'Bitcoin'], ['ETH', 'Ethereum'], ['SOL', 'Solana'], ['USDT', 'Tether'],
  ['USDC', 'USD Coin'], ['XRP', 'XRP'], ['DOGE', 'Dogecoin'], ['ADA', 'Cardano'],
  ['AVAX', 'Avalanche'], ['LINK', 'Chainlink'], ['LTC', 'Litecoin'], ['BCH', 'Bitcoin Cash'],
  ['DOT', 'Polkadot'], ['XLM', 'Stellar'], ['SHIB', 'Shiba Inu'], ['UNI', 'Uniswap'],
] as const;
export const coinName = (coin: readonly [string, string]) => `${coin[1]} (${coin[0]})`;
export type Instrument = { kind: 'Crypto' | 'Stock'; symbol: string };
export type Quote = { usd: number; source: string; fetchedAt: string; marketTime?: string };
export type MarketData = { rates?: Record<string, number>; ratesDate?: string; fx: { rate: number; date: string; source: string } | null; quotes: Record<string, Quote>; errors: Record<string, string>; stocksConfigured: boolean };
export const instrumentKey = (instrument: Instrument) => `${instrument.kind}:${instrument.symbol}`;
export function instrumentFor(entry: Pick<Entry, 'kind' | 'name'>): Instrument | null {
  if (entry.kind === 'Crypto') {
    const name = entry.name.trim().toLowerCase();
    const coin = coins.find(c => [c[0], c[1], coinName(c)].some(v => v.toLowerCase() === name));
    return coin ? { kind: 'Crypto', symbol: coin[0] } : null;
  }
  if (entry.kind === 'Stock' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(entry.name.trim())) {
    return { kind: 'Stock', symbol: entry.name.trim() };
  }
  return null;
}
export function convertAmount(amount: number, from: Entry['currency'], to: Entry['currency'], rate?: number | Record<string, number>) {
  if (from === to) return amount;
  const rates = typeof rate === 'number' ? { USD: 1, UZS: rate } as Record<string, number> : rate;
  const fromRate = from === 'USD' ? 1 : rates?.[from];
  const toRate = to === 'USD' ? 1 : rates?.[to];
  if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
  return amount / fromRate * toRate;
}
export function marketEntry(entry: Entry, currency: Entry['currency'], market: MarketData | null): Entry | null {
  const instrument = instrumentFor(entry);
  const quote = instrument ? market?.quotes[instrumentKey(instrument)] : undefined;
  const amount = (quote ? convertAmount(quote.usd, 'USD', currency, (market?.rates ?? market?.fx?.rate)) : null) ?? convertAmount(entry.amount, entry.currency, currency, (market?.rates ?? market?.fx?.rate));
  const cost = convertAmount(entry.cost, entry.currency, currency, (market?.rates ?? market?.fx?.rate));
  const estimatedMonthlyIncome = convertAmount(entry.estimated_monthly_income ?? 0, entry.currency, currency, market?.rates ?? market?.fx?.rate);
  // Never mix currencies when the exchange-rate feed is unavailable.
  return amount === null || cost === null || estimatedMonthlyIncome === null ? null : { ...entry, amount, cost, currency, estimated_monthly_income: estimatedMonthlyIncome };
}
