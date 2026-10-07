/** An amount always travels with its currency. A bare number is only ever an amount in a currency the caller
 * already knows; whenever the currency can differ, pass `Money` and convert it here. */
export type Money = { amount: number; currency: string };

/** Units of each currency for one unit of a shared base (the market feed's USD table, a day's rates). */
export type RateTable = Readonly<Record<string, number | null | undefined>>;
/** Units of `to` for one unit of `from` (a dated official rate). */
export type PairRate = (from: string, to: string) => number | null | undefined;

const usable = (rate: number | null | undefined): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0;

/** `money` in `to`, or null when no usable rate converts it. Never returns the original figure under another currency. */
export function convertMoney(money: Money, to: string, rates?: RateTable | PairRate | null): Money | null {
 const amount = Number(money.amount);
 if (!Number.isFinite(amount)) return null;
 if (money.currency === to) return { amount, currency: to };
 if (!rates) return null;
 if (typeof rates === 'function') {
  const rate = rates(money.currency, to);
  return usable(rate) ? { amount: amount * rate, currency: to } : null;
 }
 const from = rates[money.currency], target = rates[to];
 return usable(from) && usable(target) ? { amount: amount / from * target, currency: to } : null;
}

/** The amount of `money` in `currency`, or null when it is in another currency and no rate is given. */
export const amountIn = (money: Money, currency: string, rates?: RateTable | PairRate | null): number | null => convertMoney(money, currency, rates)?.amount ?? null;
