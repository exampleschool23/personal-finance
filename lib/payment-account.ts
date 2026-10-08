import type { Entry } from './finance';
import type { DebtPayment } from './planning';

/** One account operation: which account paid which record, and when. */
export type Paid = { account_id: string; target_id: string | null; occurred_on: string };

/** Account operations and loan payments, as the payments `suggestedPaymentAccount` learns from. */
export const paymentsFrom = (activity: readonly Paid[] = [], debtPayments: readonly DebtPayment[] = []): Paid[] =>
 [...activity, ...debtPayments.flatMap(payment => payment.account_id ? [{ account_id: payment.account_id, target_id: payment.record_id, occurred_on: payment.date }] : [])];

/** The cash account to start a payment from, so Record payment is ready to save: the one that last paid this loan, bill or
 * income (a repayment, a mortgage payment or a scheduled payment), else the only cash account in its currency, else the
 * only cash account. Empty when the choice is the person's to make. */
export function suggestedPaymentAccount(accounts: readonly Entry[], target: Entry | undefined, records: readonly Entry[], activity: readonly Paid[] = []): string {
 if (!target) return '';
 const usable = new Set(accounts.map(account => account.id));
 const payments = [
  ...activity.filter(row => row.target_id === target.id && usable.has(row.account_id)).map(row => ({ id: row.account_id, date: row.occurred_on })),
  ...records.filter(record => record.occurrence_record_id === target.id && record.account_id && usable.has(record.account_id)).map(record => ({ id: record.account_id!, date: record.date })),
 ].sort((a, b) => b.date.localeCompare(a.date));
 if (payments.length) return payments[0].id;
 const sameCurrency = accounts.filter(account => account.currency === target.currency);
 return sameCurrency.length === 1 ? sameCurrency[0].id : accounts.length === 1 ? accounts[0].id : '';
}
