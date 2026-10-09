// The figures of the personal financial report, from an owner's backup. Pure: holdings are valued the way Overview values
// them (marketEntry, financialTotals through lib/workspace-totals.ts), cash flow follows the Monthly review, and
// lib/financial-report.ts only lays the figures out in words and tables.
import { isCurrency } from './currencies';
import type { EarningSource } from './earning-sources';
import { sourceSchedule } from './earning-sources';
import type { ExpensePlan } from './expense-plans';
import { assets, expenses, financialTotals, income, liabilities, monthly, normalizeEntry, unitPricedKinds, value, type Entry } from './finance';
import { convertAmount, instrumentFor, instrumentKey, marketEntry, marketRates, quotedUnitPrice, type MarketData, type Quote } from './market';
import type { Activity, PlanningData } from './planning';
import { transferAmount } from './spending';
import { monthlyReview, normalizeSplits, type TransactionSplit } from './transaction-tools';
import { workspaceTotals } from './workspace-totals';

export type ReportRow = Record<string, unknown>;
/** A saved number, or null when it is missing or not a number (never zero in its place). */
export const reportNumber = (v: unknown): number | null => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
/** The sum, or null when any part is unknown. */
export const reportSum = (values: (number | null)[]) => values.some(v => v === null) ? null : values.reduce<number>((total, v) => total + v!, 0);
/** Whether a day falls in `period` (YYYY-MM) up to `cutoff`. */
export const inPeriod = (day: string, period: string, cutoff: string) => !!day && day.slice(0, 7) === period && day <= cutoff;

export type WealthItem = { record: Entry; amount: number | null; quote: Quote | null; valuation: unknown };
/** Every holding and debt in its own currency, valued like Overview (marketEntry): a live quote when it converts, else the
 * saved value. `amount` is null when the saved amount, quantity or currency is missing; `quote` is set when it priced the holding. */
export function reportWealth(records: readonly Entry[], byId: ReadonlyMap<unknown, ReportRow>, market: MarketData | null): WealthItem[] {
 const rates = marketRates(market);
 return records.filter(record => assets.includes(record.kind) || liabilities.includes(record.kind)).map(record => {
  const original = byId.get(record.id)!;
  const instrument = instrumentFor(record), quote = instrument ? market?.quotes[instrumentKey(instrument)] : undefined;
  const unitPrice = quotedUnitPrice(record, quote);
  const quoted = unitPrice !== null && convertAmount(unitPrice, 'USD', record.currency, rates) !== null ? quote! : null;
  const valid = reportNumber(original.amount) !== null && (!unitPricedKinds.includes(record.kind) || reportNumber(original.quantity) !== null) && isCurrency(record.currency);
  const own = valid ? marketEntry(record, record.currency, market) : null;
  // A record's date is a due or acquisition date, not a valuation timestamp.
  return { record, amount: own ? value(own) : null, quote: quoted, valuation: quoted ? quoted.marketTime ?? quoted.fetchedAt : original.valuation_date };
 });
}

export type WealthTotals = { assets: number; debt: number; net: number; excluded: string[] };
/** Assets, debt and net worth in `currency`, by Overview's totals. `native` counts only the records already in it;
 * otherwise a currency no rate converts is left out and listed in `excluded`, never added under another label. Null when
 * a record counted lacks its amount, quantity or currency. */
export function wealthTotals(wealth: readonly WealthItem[], currency: string, market: MarketData | null, native = false): WealthTotals | null {
 const items = native ? wealth.filter(item => item.record.currency === currency) : wealth;
 if (items.some(item => item.amount === null)) return null;
 const { current, excludedCurrencies } = workspaceTotals({ records: items.map(item => item.record), planningRecords: [], currency, market });
 const { totalAssets, totalDebt, netWorth } = financialTotals(current);
 return { assets: totalAssets, debt: totalDebt, net: netWorth, excluded: excludedCurrencies };
}

export type ReportLedger = { records: Entry[]; byId: ReadonlyMap<unknown, ReportRow>; splits: TransactionSplit[]; activity: Activity[]; links: NonNullable<PlanningData['investmentLinks']> };
/** A backup's records (each once, normalised) beside the rows they came from, with their splits, account activity and
 * Tracker cash movements. */
export function reportLedger(tables: Record<string, ReportRow[]>): ReportLedger {
 const raw = tables.finance_records, byId = new Map(raw.map(row => [row.id, row]));
 const records = ([...byId.values()] as Entry[]).map(normalizeEntry);
 const history = new Map((tables.investment_history ?? []).map(row => [row.id, row]));
 const links = (tables.investment_account_links ?? []).map(row => ({ ...row, investment_history: history.get(row.id) })) as ReportLedger['links'];
 return { records, byId, splits: normalizeSplits((tables.transaction_splits ?? []) as unknown as Parameters<typeof normalizeSplits>[0]), activity: (tables.account_activity ?? []) as Activity[], links };
}
/** Every valid currency the records, income sources and plans use, in order. */
export const reportCurrencies = (records: readonly Entry[], tables: Record<string, ReportRow[]>) => [...new Set([...records.map(r => r.currency), ...(tables.income_sources ?? []).map(r => String(r.currency)), ...(tables.expense_plans ?? []).map(r => String(r.currency))])].filter(isCurrency).sort();
/** Whether one currency has recorded income, expenses or account activity in a period. */
export const hasFlowHistory = (ledger: ReportLedger, currency: string, period: string, end: string) =>
 ledger.records.some(r => r.currency === currency && r.frequency === 'Once' && inPeriod(r.date, period, end) && (income.includes(r.kind) || expenses.includes(r.kind))) || ledger.activity.some(a => ledger.byId.get(a.account_id)?.currency === currency && inPeriod(a.occurred_on, period, end));

export type ReportCashFlow = { received: number | null; spent: number | null; principal: number | null; net: number | null; invalid: boolean; review: ReturnType<typeof monthlyReview> };

/** Debt principal repaid in one currency and period: mortgage principal in payments, repayments in account activity,
 * and Tracker withdrawals from loans and debts. It is not spending, but the money left the account. */
function principalPaid(ledger: ReportLedger, { actual, acts, linked }: { actual: Entry[]; acts: Activity[]; linked: ReportLedger['links'] }, period: string, cutoff: string) {
 let principal = actual.reduce((n, r) => n + transferAmount(r), 0);
 for (const a of new Map(acts.map(a => [a.id, a])).values()) {
  if (!inPeriod(a.occurred_on, period, cutoff) || !['repayment', 'mortgage'].includes(a.action) || !liabilities.includes(String(ledger.byId.get(a.target_id ?? '')?.kind)) || actual.some(r => r.mortgage_payment_id === a.id)) continue;
  principal += Number(a.amount);
 }
 for (const l of new Map(linked.map(l => [l.id, l])).values()) {
  const event = l.investment_history;
  if (event && inPeriod(event.occurred_on, period, cutoff) && event.event_type === 'withdrawal' && Number(l.amount) < 0 && ['Loan', 'Debt'].includes(String(ledger.byId.get(event.record_id)?.kind)) && !acts.some(a => a.id === l.id) && !actual.some(r => r.history_event_id === l.id)) principal -= Number(l.amount);
 }
 return principal;
}

/** Received, spent (the Monthly review's spending, so principal is never in it), principal repaid and net cash flow in
 * one currency's own records and accounts, for `period` up to `cutoff`. Every figure is null when one is incomplete. */
export function reportCashFlow(ledger: ReportLedger, currency: string, period: string, cutoff: string): ReportCashFlow {
 const { records, byId } = ledger;
 const scoped = records.filter(r => !income.includes(r.kind) && !expenses.includes(r.kind) || r.currency === currency);
 const acts = ledger.activity.filter(a => byId.get(a.account_id)?.currency === currency);
 const linked = ledger.links.filter(l => (l.account_currency ?? byId.get(l.account_id)?.currency) === currency);
 const review = monthlyReview(scoped, ledger.splits, [], period, currency, cutoff, acts, undefined, linked);
 const actual = records.filter(r => r.currency === currency && r.frequency === 'Once' && inPeriod(r.date, period, cutoff));
 const principal = principalPaid(ledger, { actual, acts, linked }, period, cutoff);
 const invalid = ![review.received, review.spent, principal].every(Number.isFinite) || actual.some(r => reportNumber(byId.get(r.id)?.amount) === null) || review.missing > 0;
 return invalid ? { received: null, spent: null, principal: null, net: null, invalid, review } : { received: review.received, spent: review.spent, principal, net: review.received - review.spent - principal, invalid, review };
}

/** One cash-flow figure over every currency, converted into `reporting`; null when one is unknown or has no rate. */
export function consolidatedFlow(flows: ReadonlyMap<string, ReportCashFlow>, key: 'received' | 'spent' | 'principal' | 'net', reporting: string, market: MarketData | null) {
 const rates = marketRates(market);
 return reportSum([...flows].map(([currency, flow]) => flow[key] === null ? null : convertAmount(flow[key]!, currency, reporting, rates)));
}

/** A budget plan this month: planned (with carryover when the plans come from the app), actual linked spending through
 * `today` in the plan's currency, and what remains. Null where a figure or rate is unknown. */
export function planFigures(plan: ExpensePlan, ledger: Pick<ReportLedger, 'records' | 'byId'>, { month, today }: { month: string; today: string }, market: MarketData | null, withCarryover: boolean) {
 const rates = marketRates(market);
 const actual = reportSum(ledger.records.filter(r => r.expense_plan_id === plan.id && expenses.includes(r.kind) && r.frequency === 'Once' && inPeriod(r.date, month, today)).map(r => {
  const n = reportNumber(ledger.byId.get(r.id)?.amount);
  return n === null ? null : convertAmount(n, r.currency, plan.currency, rates);
 }));
 const planned = reportNumber(plan.amount) === null ? null : withCarryover ? Number(plan.amount) + Number(plan.carryover ?? 0) : plan.rollover ? null : Number(plan.amount);
 return { planned, actual, remaining: planned === null || actual === null ? null : planned - actual };
}

/** The monthly equivalent of the income sources active in `month` in one currency; null when one is variable or unknown. */
export function expectedMonthlyIncome(sources: readonly EarningSource[], currency: string, month: string, start: string, end: string) {
 const current = sources.filter(s => s.currency === currency && !s.archived && (!s.start_date || s.start_date <= end) && (!s.end_date || s.end_date >= start));
 const amounts = current.map(s => s.mode === 'variable' || reportNumber(s.amount) === null ? null : sourceSchedule(s));
 return amounts.some(s => s === null) ? null : amounts.reduce((n, s) => n + monthly(s!, month), 0);
}
