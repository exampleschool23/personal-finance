import { z } from 'zod';
import { isoDate } from './api-validation';
import { addMonths, daysBetween, shiftDay } from './calendar-days';
import { expenses, income, type Entry } from './finance';

/**
 * Recurring charges found in recorded transactions.
 *
 * One detector serves both the transaction review suggestions (income and bills, any amount) and the
 * subscriptions list on Recurring (spending at a steady price). Charges are grouped by a normalised
 * merchant name, direction and currency, so different currencies are never combined.
 */

export type Cadence = 'Weekly' | 'Fortnightly' | 'Monthly' | 'Quarterly' | 'Yearly';
type CadenceRule = { days: number; min: number; max: number; months?: number; perYear: number; grace: number; minCharges: number; skips: boolean };
/** Gap bands in days. A gap of two periods counts as one missed charge for the monthly and longer cadences. */
export const cadences: Record<Cadence, CadenceRule> = {
 Weekly: { days: 7, min: 5, max: 9, perYear: 365.25 / 7, grace: 3, minCharges: 3, skips: false },
 Fortnightly: { days: 14, min: 11, max: 17, perYear: 365.25 / 14, grace: 4, minCharges: 3, skips: false },
 Monthly: { days: 30, min: 25, max: 35, months: 1, perYear: 12, grace: 7, minCharges: 3, skips: true },
 Quarterly: { days: 91, min: 82, max: 100, months: 3, perYear: 4, grace: 10, minCharges: 3, skips: true },
 Yearly: { days: 365, min: 350, max: 380, months: 12, perYear: 1, grace: 21, minCharges: 2, skips: true },
};
const cadenceOrder = Object.keys(cadences) as Cadence[];
/** How a cadence is said on screen; a quarter has no schedule frequency of its own. */
export const cadenceLabels: Record<Cadence, string> = { Weekly: 'Every week', Fortnightly: 'Every two weeks', Monthly: 'Every month', Quarterly: 'Every quarter', Yearly: 'Every year' };

/** Changes smaller than this share of the price are drift or rounding, not a new price. */
const priceChangeThreshold = 0.02;

const cashflow = [...expenses, ...income];

/**
 * A merchant name without the noise card statements add: case, accents, payment-processor prefixes,
 * reference numbers, web suffixes and company forms. "SQ *NETFLIX.COM #4411" and "Netflix" match.
 */
export function normalizeMerchant(name: string) {
 const plain = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
 const cleaned = plain
  .replace(/^\s*(?:paypal|pp|sq|tst|sp|py|dd)\s*\*\s*/, '')
  .replace(/\.(?:com|net|org|io|co)\b/g, ' ')
  .replace(/#\s*\w+/g, ' ')
  .replace(/\d{3,}/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\b(?:inc|llc|ltd|co|corp|gmbh|plc|sa)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
 return cleaned || name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const direction = (row: Pick<Entry, 'kind'>) => income.includes(row.kind) ? 'income' : 'expense';
const groupKey = (row: Pick<Entry, 'name' | 'kind' | 'currency'>) => JSON.stringify([normalizeMerchant(row.name), direction(row), row.currency]);

/** The next charge one cadence after `date`; month-based cadences keep the day, clamped to the month's end. */
export function nextCharge(date: string, cadence: Cadence) {
 const months = cadences[cadence].months;
 if (!months) return shiftDay(date, cadences[cadence].days);
 return addMonths(date, months);
}

/** How many periods a gap spans for a cadence: 1, 2 (one missed charge) or 0 (does not fit). */
function periods(gap: number, rule: CadenceRule) {
 if (gap >= rule.min && gap <= rule.max) return 1;
 return rule.skips && gap >= rule.min * 2 && gap <= rule.max * 2 ? 2 : 0;
}

/** Only actual, recorded income and spending; scheduled plans, generated rows and future dates are not history. */
function isCharge(row: Entry, today: string) {
 return cashflow.includes(row.kind) && row.frequency === 'Once' && !!row.date && row.date <= today
  && !row.earning_source_id && !row.operation_id && !row.history_event_id && !row.mortgage_payment_id && !row.movement_id;
}

export type PriceChange = { date: string; from: number; to: number; percent: number };
export type RecurringPattern = {
 id: string; merchant: string; direction: 'income' | 'expense'; currency: string; cadence: Cadence;
 /** The newest charge, which carries the name, kind and category to reuse. */
 record: Entry;
 /** Charges in the regular run, oldest first. */
 charges: Entry[];
 amount: number; typical: number; previous: number;
 lastCharge: string; next: string; overdueDays: number; missedCharges: number;
 /** Amount steps of more than the threshold after a steady price. */
 priceChanges: PriceChange[];
 /** Whether the price held, apart from at most an occasional change. */
 steady: boolean;
 confidence: 'high' | 'medium' | 'low';
};

function median(values: number[]) {
 const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
 return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const changed = (from: number, to: number) => Math.abs(to - from) >= 0.01 && Math.abs(to - from) > Math.max(Math.abs(from), Math.abs(to)) * priceChangeThreshold;

/** The newest regular run of one merchant's charges, or null when the dates do not repeat. */
function patternOf(id: string, rows: Entry[], today: string): RecurringPattern | null {
 // Same-day charges are one payment for cadence purposes; keep the latest recorded.
 const byDay = new Map<string, Entry>();
 for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) byDay.set(row.date, row);
 const charges = [...byDay.values()].slice(-24);
 if (charges.length < 2) return null;
 const lastGap = daysBetween(charges.at(-2)!.date, charges.at(-1)!.date);
 const cadence = cadenceOrder.find(name => periods(lastGap, cadences[name]) === 1);
 if (!cadence) return null;
 const rule = cadences[cadence];
 let start = charges.length - 1, missed = 0;
 while (start > 0) {
  const span = periods(daysBetween(charges[start - 1].date, charges[start].date), rule);
  if (!span || (span === 2 && missed)) break;
  missed += span - 1; start--;
 }
 const run = charges.slice(start).slice(-12);
 if (run.length < rule.minCharges) return null;
 const amounts = run.map(row => row.amount), last = run.at(-1)!;
 const priceChanges: PriceChange[] = [];
 let steps = 0;
 for (let index = 1; index < run.length; index++) {
  if (!changed(amounts[index - 1], amounts[index])) continue;
  steps++;
  // A new price is a step after a steady stretch, not the swing of a variable bill.
  if (amounts[index - 1] > 0 && (index < 2 || !changed(amounts[index - 2], amounts[index - 1])))
   priceChanges.push({ date: run[index].date, from: amounts[index - 1], to: amounts[index], percent: (amounts[index] - amounts[index - 1]) / amounts[index - 1] * 100 });
 }
 const low = Math.min(...amounts), high = Math.max(...amounts);
 const steady = low > 0 && high / low <= 1.5 && steps <= Math.max(1, Math.floor((run.length - 1) / 3));
 const next = nextCharge(last.date, cadence), overdueDays = Math.max(0, daysBetween(next, today));
 const exact = run.slice(1).every((row, index) => Math.abs(daysBetween(run[index].date, row.date) - rule.days) <= Math.ceil((rule.max - rule.min) / 4));
 const score = (run.length >= 4 ? 2 : run.length >= 3 ? 1 : 0) + (steady && !steps ? 1 : 0) + (exact ? 1 : 0) - (missed ? 1 : 0);
 const [merchant, way, currency] = JSON.parse(id) as [string, 'income' | 'expense', string];
 return {
  id, merchant, direction: way, currency, cadence, record: last, charges: run,
  amount: last.amount, typical: median(amounts), previous: run.at(-2)!.amount,
  lastCharge: last.date, next, overdueDays, missedCharges: missed,
  priceChanges, steady, confidence: score >= 3 ? 'high' : score >= 2 ? 'medium' : 'low',
 };
}

/** Every merchant whose charges repeat on a cadence, except those already scheduled as a recurring plan. */
function detectRecurring(records: Entry[], today: string) {
 const scheduled = new Set(records.filter(r => cashflow.includes(r.kind) && !r.source_paused && r.frequency !== 'Once' && (!r.end_date || r.end_date >= today)).map(groupKey));
 const groups = new Map<string, Entry[]>();
 for (const row of records) {
  if (!isCharge(row, today)) continue;
  const id = groupKey(row);
  if (scheduled.has(id)) continue;
  groups.set(id, [...(groups.get(id) ?? []), row]);
 }
 return [...groups].flatMap(([id, rows]) => { const pattern = patternOf(id, rows, today); return pattern ? [pattern] : []; });
}

/** Suggestions to save a recurring plan: three or more regular charges whose next one is not long overdue. */
export function recurringSuggestions(records: Entry[], today: string) {
 return detectRecurring(records, today)
  .filter(item => item.charges.length >= 3 && item.overdueDays <= cadences[item.cadence].max)
  .map(item => ({ id: item.id, record: item.record, cadence: item.cadence, next: item.next, changed: item.previous !== item.amount, previous: item.previous }));
}

export type Subscription = RecurringPattern & {
 monthly: number; yearly: number;
 /** The newest price change, when it raised the price within the last three charges. */
 priceIncrease: PriceChange | null;
 /** The expected charge is overdue: the subscription may have been cancelled or the charge missed. */
 missed: boolean;
};

/**
 * Subscriptions: spending at a steady price on a regular cadence. Costs use the current price; patterns
 * that stopped more than two periods ago are history, not subscriptions.
 */
export function detectSubscriptions(records: Entry[], today: string): Subscription[] {
 return detectRecurring(records, today)
  .filter(item => item.direction === 'expense' && item.steady && item.amount > 0 && item.overdueDays <= cadences[item.cadence].max * 2)
  .map(item => {
   const rule = cadences[item.cadence], latest = item.priceChanges.at(-1);
   const recent = item.charges.slice(-3).map(row => row.date);
   return {
    ...item, monthly: item.amount * rule.perYear / 12, yearly: item.amount * rule.perYear,
    priceIncrease: latest && latest.to > latest.from && recent.includes(latest.date) ? latest : null,
    missed: item.overdueDays > rule.grace,
   };
  })
  .sort((a, b) => Number(a.missed) - Number(b.missed) || b.yearly - a.yearly || a.merchant.localeCompare(b.merchant));
}

/** Monthly and yearly cost per currency of subscriptions still being charged. Currencies are listed, never added. */
export function subscriptionTotals(items: readonly Subscription[]) {
 const totals = new Map<string, { currency: string; monthly: number; yearly: number; count: number }>();
 for (const item of items) {
  if (item.missed) continue;
  const total = totals.get(item.currency) ?? { currency: item.currency, monthly: 0, yearly: 0, count: 0 };
  total.monthly += item.monthly; total.yearly += item.yearly; total.count++;
  totals.set(item.currency, total);
 }
 return [...totals.values()].sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

/** What the person decided about a detected subscription, kept per merchant and currency. */
export type SubscriptionDecision = { merchant: string; currency: string; status: 'dismissed' | 'cancelled'; decided_on: string };
export const subscriptionSchemas = {
 decide: z.object({ merchant: z.string().trim().min(1).max(120), currency: z.string().regex(/^[A-Z]{3}$/), status: z.enum(['dismissed', 'cancelled']), decided_on: isoDate }).strict(),
 restore: z.object({ merchant: z.string().trim().min(1).max(120), currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
};
const decisionKey = (item: Pick<SubscriptionDecision, 'merchant' | 'currency'>) => item.merchant + '\u0000' + item.currency;

/**
 * Splits subscriptions into the ones to show and the ones the person hid. "Not a subscription" stays hidden;
 * a cancelled subscription comes back when it is charged again after the day it was cancelled.
 */
export function applySubscriptionDecisions(items: readonly Subscription[], decisions: readonly SubscriptionDecision[]) {
 const byKey = new Map(decisions.map(decision => [decisionKey(decision), decision]));
 const active: Subscription[] = [], hidden: Array<{ item: Subscription; decision: SubscriptionDecision }> = [];
 for (const item of items) {
  const decision = byKey.get(decisionKey(item));
  if (decision && (decision.status === 'dismissed' || item.lastCharge <= decision.decided_on)) hidden.push({ item, decision });
  else active.push(item);
 }
 return { active, hidden };
}

/** A recurring plan prefilled from the newest charge, starting on the next expected date. Nothing is saved until reviewed. */
export function recurringPlanDraft(record: Entry, cadence: Cadence, next: string, id: string): Entry {
 const schedule: Pick<Entry, 'frequency' | 'recurrence_days'> = cadence === 'Quarterly' ? { frequency: 'Custom', recurrence_days: cadences.Quarterly.days } : { frequency: cadence, recurrence_days: null };
 return {
  ...record, ...schedule, id, revision: undefined, date: next,
  account_id: null, account_currency: null, account_exchange_rate: null, account_rate_date: null,
  import_key: null, expense_plan_id: null, custom_category_id: record.custom_category_id ?? null,
 };
}

export function suspectedDuplicates(records: Entry[]) {
 const groups = new Map<string, Entry[]>();
 for (const row of records) {
  if (!cashflow.includes(row.kind) || row.frequency !== 'Once' || row.operation_id || row.movement_id || row.history_event_id || row.mortgage_payment_id) continue;
  const id = JSON.stringify([row.name.trim().toLowerCase().replace(/\s+/g, ' '), row.kind, row.currency, row.account_id ?? null, row.date, row.amount]);
  groups.set(id, [...(groups.get(id) ?? []), row]);
 }
 return [...groups.values()].filter(rows => rows.length > 1);
}
