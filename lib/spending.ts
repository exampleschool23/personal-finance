import { expenses, type Entry } from './finance';

// The one definition of "spending", shared by Cash flow, Transactions, the
// Dashboard, Budget actuals, reports and the Telegram digest:
// - expense records count in full, including transfer and repayment fees,
//   which are saved as their own expense records;
// - a mortgage payment counts only its interest: the principal reduces the
//   debt, so it is a transfer between your own balances, not spending;
// - loan and debt repayments (principal) are transfers and never count.
type SpendingRow = Pick<Entry, 'kind' | 'amount'> & Partial<Pick<Entry, 'mortgage_payment_id' | 'payment_principal' | 'payment_interest'>>;

/** True for a saved mortgage payment copy, whose amount is principal plus interest. */
export const isMortgagePayment = (row: Pick<SpendingRow, 'mortgage_payment_id'>) => !!row.mortgage_payment_id;

/** The part of a record that is spending, in the record's own currency. Zero for income and holdings. */
export function spendingAmount(row: SpendingRow): number {
 if (!expenses.includes(row.kind)) return 0;
 if (!isMortgagePayment(row)) return Number(row.amount);
 if (row.payment_interest != null) return Number(row.payment_interest);
 return Math.max(0, Number(row.amount) - Number(row.payment_principal ?? 0));
}

/** The part of a record that moves money to a debt rather than spending it (a mortgage payment's principal). */
export const transferAmount = (row: SpendingRow) => expenses.includes(row.kind) && isMortgagePayment(row) ? Number(row.amount) - spendingAmount(row) : 0;
