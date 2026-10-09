import { validDay } from './benchmark-data';
import { shiftDay, shiftMonth } from './calendar-days';
import { budgetKey, expenses, income, liabilities, scheduleDates, type BudgetLine, type Entry } from './finance';
import { convertAmount } from './market';
import { hasMonthlyInstallment, installmentAnchor, installmentsFrom, paidInstallmentMonths, upcomingPayments, type DebtPayment, type Occurrence } from './planning';

/** How far ahead the forecast looks, in days. */
export const forecastHorizons = [30, 90, 180, 365] as const;
export type ForecastHorizon = typeof forecastHorizons[number];

/** A temporary what-if: money in (positive) or out (negative), once or every month from its date. Kept on the screen, never saved. */
export type ForecastAdjustment = { id: string; name: string; amount: number; frequency: 'Once' | 'Monthly'; date: string };
export type ForecastSource = 'scheduled' | 'installment' | 'repayment' | 'maturity' | 'budget' | 'adjustment';
/** One dated movement of cash. `amount` is signed (income positive) in `currency`; `accountId` is the cash account it moves, when known.
 * A scheduled income or bill carries the Budget `category` it falls under. */
export type ForecastEvent = { key: string; date: string; name: string; kind: Entry['kind']; source: ForecastSource; amount: number; currency: string; accountId: string | null; category?: string };
export type ForecastPoint = { date: string; balance: number };
/** A projected balance, day by day. A total has no account. `belowZero` is the first day the balance is negative. */
export type ForecastSeries = { id: string; name: string; currency: string; accountId: string | null; start: number; end: number; points: ForecastPoint[]; lowest: ForecastPoint; belowZero: string | null };
/** A month of events: their net `total` in the display currency; `missing` counts events no rate converts (the total is then unknown). */
export type ForecastMonth = { month: string; events: ForecastEvent[]; total: number; missing: number };
/** `totals` holds one series, total cash in the display currency (AGENTS: never one total per currency). Balances and
 * events no rate converts are left out of it and counted in `missing`; `converted` is true when none is. */
export type CashForecast = { today: string; end: string; events: ForecastEvent[]; accounts: ForecastSeries[]; totals: ForecastSeries[]; converted: boolean; missing: number; months: ForecastMonth[]; belowZero: ForecastSeries[] };

/** Budget as the projected cash reads it, in the display currency: each month's spending lines, and this month's
 * spending so far per category key. */
export type CashForecastBudget = { linesFor: (month: string) => BudgetLine[]; spent: ReadonlyMap<string, number> };

type Input = {
 records: Entry[]; occurrences: Occurrence[]; debtPayments?: DebtPayment[];
 adjustments?: readonly ForecastAdjustment[];
 budget?: CashForecastBudget;
 today: string; days: number; currency: string; rates?: number | Record<string, number>;
};


/** A loan, debt or mortgage with a monthly payment is paid by that payment every month until its balance (with monthly interest) is repaid.
 * The months already paid are skipped, as on the Recurring screen. */
function installmentEvents(record: Entry, today: string, end: string, paid: Set<string>): ForecastEvent[] {
 const anchor = installmentAnchor(record), payment = Number(record.estimated_monthly_payment);
 if (!anchor || !hasMonthlyInstallment(record)) return [];
 const owedFrom = installmentsFrom(record), from = owedFrom > today ? owedFrom : today;
 let balance = Number(record.amount);
 const result: ForecastEvent[] = [];
 for (const date of scheduleDates({ date: anchor, frequency: 'Monthly' }, from, end)) {
  if (date <= anchor || paid.has(record.id + ':' + date.slice(0, 7))) continue;
  if (balance <= 1e-8) break;
  balance += balance * Math.max(0, Number(record.rate) || 0) / 1200;
  const amount = Math.min(payment, balance);
  balance -= amount;
  result.push({ key: record.id + ':installment:' + date, date, name: record.name, kind: record.kind, source: 'installment', amount: -amount, currency: record.currency, accountId: record.account_id ?? null });
 }
 return result;
}

/** What each month's budgets add beyond the bills already scheduled in their categories, in the display currency:
 * this month what is left after the spending so far and the bills still due, today; a later month the rest, on its
 * first day. A bill that no rate converts leaves its budget out rather than counting it twice. */
function budgetEvents(scheduled: readonly ForecastEvent[], input: Input, end: string): ForecastEvent[] {
 const budget = input.budget, { today, currency, rates } = input;
 if (!budget) return [];
 const result: ForecastEvent[] = [];
 for (let month = today.slice(0, 7); month <= end.slice(0, 7); month = shiftMonth(month, 1)) {
  const current = month === today.slice(0, 7);
  for (const line of budget.linesFor(month)) {
   const bills = scheduled.filter(event => event.amount < 0 && event.date.slice(0, 7) === month && line.categoryKeys.includes(event.category ?? '')).map(event => convertAmount(-event.amount, event.currency, currency, rates));
   if (bills.some(amount => amount === null)) continue;
   const spent = current ? line.categoryKeys.reduce((sum, key) => sum + (budget.spent.get(key) ?? 0), 0) : 0;
   const rest = line.amount - spent - bills.reduce<number>((sum, amount) => sum + amount!, 0);
   if (rest > 0) result.push({ key: 'budget:' + line.key + ':' + month, date: current ? today : month + '-01', name: line.name, kind: expenses.includes(line.key) ? line.key as Entry['kind'] : 'Other expense', source: 'budget', amount: -rest, currency, accountId: null, category: line.key });
  }
 }
 return result;
}

/** Every cash movement from today through the horizon, by date. Overdue items are left out: the forecast starts from today's balances. */
export function forecastEvents(input: Input): ForecastEvent[] {
 const { records, occurrences, today, currency } = input;
 const end = shiftDay(today, input.days);
 const events: ForecastEvent[] = [];
 for (const item of upcomingPayments(records, occurrences, today, end)) {
  if (item.date < today) continue;
  const record = item.record;
  if (item.type === 'scheduled') {
   events.push({ key: item.key, date: item.date, name: record.name, kind: record.kind, source: 'scheduled', amount: (income.includes(record.kind) ? 1 : -1) * Number(item.amount), currency: record.currency, accountId: record.account_id ?? null, category: budgetKey(record) });
  } else if (item.type === 'maturity' || record.kind === 'Money lent') {
   events.push({ key: item.key, date: item.date, name: record.name, kind: record.kind, source: item.type, amount: Number(item.amount), currency: record.currency, accountId: record.account_id ?? null });
  } else if (liabilities.includes(record.kind) && !hasMonthlyInstallment(record)) {
   events.push({ key: item.key, date: item.date, name: record.name, kind: record.kind, source: 'repayment', amount: -Number(item.amount), currency: record.currency, accountId: record.account_id ?? null });
  }
 }
 const paid = paidInstallmentMonths(input.debtPayments ?? []);
 for (const record of records) events.push(...installmentEvents(record, today, end, paid));
 events.push(...budgetEvents(events.filter(event => event.source === 'scheduled'), input, end));
 for (const adjustment of input.adjustments ?? []) {
  if (!Number.isFinite(adjustment.amount) || !adjustment.amount) continue;
  for (const date of scheduleDates({ date: adjustment.date, frequency: adjustment.frequency }, today, end))
   events.push({ key: adjustment.id + ':' + date, date, name: adjustment.name, kind: adjustment.amount > 0 ? 'Other income' : 'Other expense', source: 'adjustment', amount: adjustment.amount, currency, accountId: null });
 }
 return events.filter(event => Number.isFinite(event.amount) && event.amount !== 0).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/** Balance at the end of each day, from today's balance plus that day's events. */
function series(id: string, name: string, currency: string, accountId: string | null, start: number, deltas: Map<string, number>, today: string, days: number): ForecastSeries {
 const points: ForecastPoint[] = [];
 let balance = start;
 for (let day = 0; day <= days; day++) {
  const date = shiftDay(today, day);
  balance += deltas.get(date) ?? 0;
  points.push({ date, balance });
 }
 // Today's opening balance counts too, so the lowest point is never above the balance shown as today's.
 const opening = { date: today, balance: start };
 const lowest = points.reduce((low, point) => point.balance < low.balance ? point : low, opening);
 // Sub-cent float residue is not an overdraft.
 const negative = [opening, ...points].find(point => point.balance < -0.005);
 return { id, name, currency, accountId, start, end: balance, points, lowest, belowZero: negative?.date ?? null };
}

const addTo = (map: Map<string, number>, key: string, amount: number) => map.set(key, (map.get(key) ?? 0) + amount);

/** Projects each cash account and total cash day by day.
 * An event moves an account only when it names that account in the same currency; every event moves the total.
 * The total is in the display currency, converted with explicit rates; what no rate converts is left out and counted. */
export function cashForecast(input: Input): CashForecast {
 const { today, days, currency, rates } = input;
 const end = shiftDay(today, days);
 const cash = input.records.filter(record => record.kind === 'Cash');
 const byId = new Map(cash.map(account => [account.id, account]));
 const events = forecastEvents(input).map(event => {
  const account = event.accountId ? byId.get(event.accountId) : undefined;
  return account && account.currency === event.currency ? event : { ...event, accountId: null };
 });
 const accounts = cash.map(account => {
  const deltas = new Map<string, number>();
  for (const event of events) if (event.accountId === account.id) addTo(deltas, event.date, event.amount);
  return series(account.id, account.name, account.currency, account.id, Number(account.amount), deltas, today, days);
 });
 const convert = (amount: number, from: string) => { const value = convertAmount(amount, from, currency, rates); return value !== null && Number.isFinite(value) ? value : null; };
 let missing = 0, start = 0;
 for (const account of cash) { const value = convert(Number(account.amount), account.currency); if (value === null) missing += 1; else start += value; }
 const deltas = new Map<string, number>();
 const months: ForecastMonth[] = [];
 for (const event of events) {
  const month = event.date.slice(0, 7), value = convert(event.amount, event.currency);
  let group = months.at(-1);
  if (group?.month !== month) { group = { month, events: [], total: 0, missing: 0 }; months.push(group); }
  group.events.push(event);
  if (value === null) { missing += 1; group.missing += 1; continue; }
  addTo(deltas, event.date, value);
  group.total += value;
 }
 const totals = [series('total', 'Total cash', currency, null, start, deltas, today, days)];
 const belowZero = [...totals, ...accounts].filter(item => item.belowZero !== null);
 return { today, end, events, accounts, totals, converted: missing === 0, missing, months, belowZero };
}

/** A projected series in `currency` for display: every balance converted, or null when no rate converts it. */
export function seriesIn(item: ForecastSeries, currency: string, rates?: number | Record<string, number>): ForecastSeries | null {
 if (item.currency === currency) return item;
 const rate = convertAmount(1, item.currency, currency, rates);
 if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
 const point = (value: ForecastPoint) => ({ date: value.date, balance: value.balance * rate });
 return { ...item, currency, start: item.start * rate, end: item.end * rate, points: item.points.map(point), lowest: point(item.lowest) };
}

/** What-ifs read back from browser storage: anything malformed is dropped rather than trusted. */
export function readAdjustments(value: unknown): ForecastAdjustment[] {
 if (!Array.isArray(value)) return [];
 return value.filter((item): item is ForecastAdjustment => !!item && typeof item === 'object'
  && typeof item.id === 'string' && typeof item.name === 'string' && item.name.length <= 120
  && typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount !== 0 && Math.abs(item.amount) <= 1e15
  && (item.frequency === 'Once' || item.frequency === 'Monthly') && typeof item.date === 'string' && validDay(item.date)).slice(0, 50);
}
