import { expenses, income, type Entry } from './finance';

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

/** A record the cash-flow walk reads. Without an `id` it can never be told apart from another, so it is never skipped as a repeat. */
type FlowRecord = SpendingRow & Pick<Entry, 'currency' | 'date' | 'frequency'> & Partial<Pick<Entry, 'id' | 'custom_category_id' | 'history_event_id'>>;
/** Part of a record's amount in one category: `category_id` is an added category's id or a built-in kind. */
export type SpendingSplit = { record_id: string; category_id: string; amount: number | string };
/** A Tracker cash movement on an account (`investment_account_links`). An expense event's movement is spending, until
 * it is copied into an expense record of its own (`history_event_id`). */
export type SpendingLink = { id: string; account_id: string; account_currency?: string | null; amount: number | string; investment_history: { occurred_on: string; record_id?: string; event_type: string } | null };
/** One actual income or spending, in its own `currency` (null when it cannot be told). `parts` split spending into
 * categories and add up to `amount`; income has none. */
export type CashFlowItem<R> = { id: string; income: boolean; date: string; amount: number; currency: string | null; parts: Array<{ category: string; amount: number }>; record: R | null; link: SpendingLink | null };
export type CashFlowExtras = { splits?: readonly SpendingSplit[]; investmentLinks?: readonly SpendingLink[] };

/** The Tracker expenses dated from..to that no expense record copies yet. */
function trackerExpenses(links: readonly SpendingLink[], from: string, to: string, copied: Set<string>) {
 const seen = new Set<string>();
 return links.filter(link => {
  const event = link.investment_history;
  if (seen.has(link.id) || !event || event.event_type !== 'expense' || event.occurred_on < from || event.occurred_on > to || Number(link.amount) >= 0 || copied.has(link.id)) return false;
  seen.add(link.id);
  return true;
 });
}

/** The categories a spending record's amount falls in: its splits, or its own category. A mortgage payment is never split. */
function spendingParts(record: FlowRecord, splits: Map<string, SpendingSplit[]>) {
 const parts = isMortgagePayment(record) || !record.id ? undefined : splits.get(record.id);
 return parts?.length ? parts.map(part => ({ category: part.category_id, amount: Number(part.amount) })) : [{ category: record.custom_category_id ?? record.kind, amount: spendingAmount(record) }];
}

const cashFlowKind = (record: FlowRecord) => income.includes(record.kind) || expenses.includes(record.kind);
/** An income or expense record as a cash-flow item, in its own currency. */
function recordItem<R extends FlowRecord>(record: R, splits: Map<string, SpendingSplit[]>): CashFlowItem<R> {
 const base = { id: record.id ?? '', date: record.date, currency: record.currency, record, link: null };
 return income.includes(record.kind) ? { ...base, income: true, amount: Number(record.amount), parts: [] } : { ...base, income: false, amount: spendingAmount(record), parts: spendingParts(record, splits) };
}

/** Every actual income and spending dated from..to inclusive, by the one definition above: one-time income and expense
 * records (a record split into categories counts once, in its parts) and the Tracker's expenses on investments that no
 * record copies yet. Cash flow, the Monthly review, the Dashboard's spending card and the Telegram digest and recap all
 * walk this, then convert each item themselves. */
export function* cashFlowItems<R extends FlowRecord>(records: readonly R[], from: string, to: string, extras: CashFlowExtras = {}): Generator<CashFlowItem<R>> {
 const splits = new Map<string, SpendingSplit[]>();
 for (const part of extras.splits ?? []) splits.set(part.record_id, [...splits.get(part.record_id) ?? [], part]);
 const seen = new Set<string>(), copied = new Set<string>();
 for (const record of records) {
  if (record.frequency !== 'Once' || !record.date || record.date < from || record.date > to || !cashFlowKind(record)) continue;
  if (record.id) { if (seen.has(record.id)) continue; seen.add(record.id); }
  if (!income.includes(record.kind) && record.history_event_id) copied.add(record.history_event_id);
  yield recordItem(record, splits);
 }
 // Loan, debt and mortgage principal repayments (account activity and Tracker withdrawals) are transfers, not
 // spending; their fees are expense records. Tracker expenses on investments have no record of their own until copied.
 const accounts = new Map(records.filter(record => record.id).map(record => [record.id, record.currency]));
 for (const link of trackerExpenses(extras.investmentLinks ?? [], from, to, copied)) {
  const amount = -Number(link.amount);
  yield { id: link.id, income: false, date: link.investment_history!.occurred_on, amount, currency: link.account_currency ?? accounts.get(link.account_id) ?? null, parts: [{ category: 'Other expense', amount }], record: null, link };
 }
}
