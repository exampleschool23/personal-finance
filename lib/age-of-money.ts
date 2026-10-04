import { daysBetween, shiftDay } from './calendar-days';
import { expenses, income, type Entry } from './finance';
import { convertAmount } from './market';
import { spendingAmount } from './spending';

type Rates = number | Record<string, number> | undefined;
type MoneyRow = Pick<Entry, 'id' | 'kind' | 'amount' | 'currency' | 'date' | 'frequency'> & Partial<Pick<Entry, 'account_id' | 'mortgage_payment_id' | 'payment_principal' | 'payment_interest'>>;

/** How many of the latest cash outflows the average covers. */
export const ageOfMoneyOutflows = 10;

export type AgeOfMoney = {
 /** Average age in days of the money behind the latest outflows; null until an outflow can be matched to income. */
 days: number | null;
 /** Outflows the average covers (at most `ageOfMoneyOutflows`). */
 outflows: number;
 /** Records left out because their currency has no exchange rate to the primary currency. */
 skipped: number;
};


/**
 * Age of Money: how long money sits in your cash accounts before it is spent.
 * Income is matched to spending first in, first out across every cash account, in the primary
 * currency with the rates already on hand (never an inferred rate). Each outflow's age is the
 * amount-weighted age of the income it used; the result averages the latest ten outflows.
 * Spending older than any recorded income is left out of its outflow's age, and an outflow that
 * no recorded income covers is not counted. Only one-time records dated on or before `asOf` count;
 * spending follows the shared definition, so loan principal and transfers are not outflows.
 */
export function ageOfMoney(records: readonly MoneyRow[], currency: string, asOf: string, rates: Rates, cashAccounts?: ReadonlySet<string>): AgeOfMoney {
 type Flow = { id: string; date: string; amount: number; inflow: boolean };
 const flows: Flow[] = [];
 let skipped = 0;
 for (const record of records) {
  if (record.frequency !== 'Once' || !record.date || record.date > asOf) continue;
  const inflow = income.includes(record.kind);
  if (!inflow && !expenses.includes(record.kind)) continue;
  if (cashAccounts && record.account_id && !cashAccounts.has(record.account_id)) continue;
  const raw = inflow ? Number(record.amount) : spendingAmount(record);
  if (!(raw > 0)) continue;
  const amount = convertAmount(raw, record.currency, currency, rates);
  if (amount === null) { skipped++; continue; }
  flows.push({ id: record.id, date: record.date, amount, inflow });
 }
 // Money received on a day can be spent that same day.
 flows.sort((a, b) => a.date.localeCompare(b.date) || Number(b.inflow) - Number(a.inflow) || a.id.localeCompare(b.id));
 const queue: Array<{ date: string; left: number }> = [];
 let head = 0;
 const ages: number[] = [];
 for (const flow of flows) {
  if (flow.inflow) { queue.push({ date: flow.date, left: flow.amount }); continue; }
  let remaining = flow.amount, matched = 0, weighted = 0;
  while (remaining > 1e-9 && head < queue.length) {
   const lot = queue[head];
   const take = Math.min(lot.left, remaining);
   matched += take; weighted += take * daysBetween(lot.date, flow.date);
   lot.left -= take; remaining -= take;
   if (lot.left <= 1e-9) head++;
  }
  if (matched > 0) ages.push(weighted / matched);
 }
 const latest = ages.slice(-ageOfMoneyOutflows);
 return { days: latest.length ? latest.reduce((sum, age) => sum + age, 0) / latest.length : null, outflows: latest.length, skipped };
}

/** Today's Age of Money and its change against 30 days earlier, in whole days. */
export function ageOfMoneyTrend(records: readonly MoneyRow[], currency: string, today: string, rates: Rates, cashAccounts?: ReadonlySet<string>) {
 const now = ageOfMoney(records, currency, today, rates, cashAccounts);
 const before = ageOfMoney(records, currency, shiftDay(today, -30), rates, cashAccounts);
 const change = now.days === null || before.days === null ? null : Math.round(now.days) - Math.round(before.days);
 return { ...now, change };
}
