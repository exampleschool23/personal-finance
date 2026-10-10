// Pure: where a Budget category's money went in one month, by the same walk the Budget's actuals take
// (`cashFlowItems`, as `monthActuals` reads it), so the details add up to the row's Actual figure.
import { monthEnd } from './calendar-days';
import type { Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';
import { cashFlowItems } from './spending';
import type { TransactionSplit } from './transaction-tools';

type Rates = number | Record<string, number> | undefined;
/** One payment in the category: `amount` is in the display currency, null when no rate converts it; `entered` is what
 * was recorded, in its own currency (the dialog's transaction list shows this one), null for a payment with no currency.
 * `record` is null for a Tracker expense on an investment that no record copies yet. */
export type CategoryPayment = { id: string; date: string; name: string; amount: number | null; entered: { amount: number; currency: string } | null; record: Entry | null };
/** Payments grouped by name, largest first: who the money went to or came from. `amount` is in the display currency (it
 * orders the list and gives the share); `entered` is the same payments as entered when they share one currency. */
export type CategoryPayee = { name: string; amount: number; count: number; entered?: { amount: number; currency: string } | null };
export type CategoryMonth = { payments: CategoryPayment[]; payees: CategoryPayee[]; total: number; missing: number };
/** How the month is read: transaction splits, the last day counted, and the display currency with its rates. */
export type CategoryMonthView = { splits: readonly TransactionSplit[]; today: string; currency: string; rates: Rates };

/** The category's payments dated in `month` up to `today`, newest first, and the same payments grouped by name.
 * A split transaction counts only its part in this category. Payments no rate converts are counted in `missing`. */
export function categoryMonth(data: Pick<PlanningData, 'records' | 'investmentLinks'>, key: string, month: string, { splits, today, currency, rates }: CategoryMonthView): CategoryMonth {
 const end = monthEnd(month);
 const payments: CategoryPayment[] = [];
 for (const item of cashFlowItems(data.records, month + '-01', today < end ? today : end, { splits, investmentLinks: data.investmentLinks ?? [] })) {
  const own = item.income ? (item.record && (item.record.custom_category_id ?? item.record.kind) === key ? item.amount : null) : item.parts.filter(part => part.category === key).reduce<number | null>((sum, part) => (sum ?? 0) + part.amount, null);
  if (own === null) continue;
  const amount = item.currency === null ? null : convertAmount(own, item.currency, currency, rates);
  payments.push({ id: item.id, date: item.date, name: item.record?.name.trim() ?? '', amount: amount !== null && Number.isFinite(amount) ? amount : null, entered: item.currency === null ? null : { amount: own, currency: item.currency }, record: item.record });
 }
 payments.sort((a, b) => b.date.localeCompare(a.date));
 const counted = payments.filter(payment => payment.amount !== null);
 return { payments, payees: byPayee(counted), total: counted.reduce((sum, payment) => sum + payment.amount!, 0), missing: payments.length - counted.length };
}

/** Payments grouped by name, largest first. Names differing only in letter case are the same payee; the first spelling
 * seen (the newest) is shown. `entered` adds them as entered while they share one currency; a mix leaves it null. */
function byPayee(payments: readonly CategoryPayment[]): CategoryPayee[] {
 const payees = new Map<string, CategoryPayee>();
 for (const payment of payments) {
  const id = payment.name.toLocaleLowerCase();
  const payee = payees.get(id) ?? { name: payment.name, amount: 0, count: 0, entered: undefined };
  const entered = payee.entered === null || !payment.entered || (payee.entered && payee.entered.currency !== payment.entered.currency) ? null
   : { amount: (payee.entered?.amount ?? 0) + payment.entered.amount, currency: payment.entered.currency };
  payees.set(id, { ...payee, amount: payee.amount + payment.amount!, count: payee.count + 1, entered });
 }
 return [...payees.values()].sort((a, b) => b.amount - a.amount);
}
