import { convertMoney } from './money';
import type { ExtraPayment, Occurrence } from './planning';

/** The official rate of a day: units of `to` for one unit of `from`. */
export type DayRate = (from: string, to: string, date: string) => Promise<number>;

/** Payments made in another currency than their schedule are counted in the schedule's currency at the official rate
 * of the payment's day (migration 120): the read hands them on as money in the schedule's currency, while the saved
 * transactions keep their own. Without a rate a payment keeps its own currency, which Recurring then leaves uncounted. */
export async function inScheduleCurrency(occurrences: Occurrence[], payments: ExtraPayment[], currencyOf: Map<string, string>, rate: DayRate): Promise<{ occurrences: Occurrence[]; payments: ExtraPayment[] }> {
 const quotes = new Map<string, Promise<number | null>>();
 const quote = (from: string, to: string, date: string) => {
  const key = from + ':' + to + ':' + date;
  if (!quotes.has(key)) quotes.set(key, rate(from, to, date).then(value => value, () => null));
  return quotes.get(key)!;
 };
 /** The payment as money in its schedule's currency, or unchanged when it already is, or no rate converts it. */
 const counted = async <T extends { amount: number | null; currency?: string; date?: string }>(payment: T, scheduleId: string): Promise<T> => {
  const to = currencyOf.get(scheduleId), from = payment.currency;
  if (!to || !from || from === to || !payment.date || payment.amount === null) return payment;
  const value = await quote(from, to, payment.date);
  const money = convertMoney({ amount: payment.amount, currency: from }, to, () => value);
  return money ? { ...payment, ...money } : payment;
 };
 const [converted, later] = await Promise.all([
  Promise.all(occurrences.map(async item => item.transaction ? { ...item, transaction: await counted(item.transaction, item.record_id) } : item)),
  Promise.all(payments.map(payment => counted(payment, payment.occurrence_record_id))),
 ]);
 return { occurrences: converted, payments: later };
}
