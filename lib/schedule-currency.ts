import type { ExtraPayment, Occurrence } from './planning';

/** The official rate of a day: units of `to` for one unit of `from`. */
export type DayRate = (from: string, to: string, date: string) => Promise<number>;

/** Payments made in another currency than their schedule count in the schedule's currency at the official rate of the
 * payment's day (migration 120); what was saved keeps its own amount and currency. Without a rate, a first payment's
 * amount is unknown (null) and a later payment is left out, rather than counted in the wrong currency. */
export async function inScheduleCurrency(occurrences: Occurrence[], payments: ExtraPayment[], currencyOf: Map<string, string>, rate: DayRate): Promise<{ occurrences: Occurrence[]; payments: ExtraPayment[] }> {
 const quotes = new Map<string, Promise<number | null>>();
 const convert = async (amount: number, from: string | null | undefined, to: string | undefined, date: string | null | undefined): Promise<number | null> => {
  if (!from || !to || from === to) return Number(amount);
  if (!date) return null;
  const key = from + ':' + to + ':' + date;
  if (!quotes.has(key)) quotes.set(key, rate(from, to, date).then(value => Number.isFinite(value) && value > 0 ? value : null, () => null));
  const value = await quotes.get(key)!;
  return value === null ? null : Number(amount) * value;
 };
 const [converted, later] = await Promise.all([
  Promise.all(occurrences.map(async item => item.transaction ? { ...item, transaction: { ...item.transaction, amount: await convert(item.transaction.amount ?? 0, item.transaction.currency, currencyOf.get(item.record_id), item.transaction.date) } } : item)),
  Promise.all(payments.map(async payment => ({ ...payment, amount: await convert(payment.amount, payment.currency, currencyOf.get(payment.occurrence_record_id), payment.date) }))),
 ]);
 return { occurrences: converted, payments: later.filter((payment): payment is ExtraPayment => payment.amount !== null) };
}
