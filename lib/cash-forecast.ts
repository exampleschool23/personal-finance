import { validDay } from './benchmark-data';
import { shiftDay, shiftMonth } from './calendar-days';
import { income, liabilities, scheduleDates, type Entry } from './finance';
import { convertAmount } from './market';
import { hasMonthlyInstallment, installmentAnchor, installmentsFrom, paidInstallmentMonths, upcomingPayments, type DebtPayment, type Occurrence } from './planning';

/** How far ahead the forecast looks, in days. */
export const forecastHorizons = [30, 90, 180, 365] as const;
export type ForecastHorizon = typeof forecastHorizons[number];

/** A temporary what-if: money in (positive) or out (negative), once or every month from its date. Kept on the screen, never saved. */
export type ForecastAdjustment = { id: string; name: string; amount: number; frequency: 'Once' | 'Monthly'; date: string };
export type ForecastSource = 'scheduled' | 'installment' | 'repayment' | 'maturity' | 'adjustment';
/** One dated movement of cash. `amount` is signed (income positive) in `currency`; `accountId` is the cash account it moves, when known. */
export type ForecastEvent = { key: string; date: string; name: string; kind: Entry['kind']; source: ForecastSource; amount: number; currency: string; accountId: string | null };
export type ForecastPoint = { date: string; balance: number };
/** A projected balance, day by day. A total has no account. `belowZero` is the first day the balance is negative. */
export type ForecastSeries = { id: string; name: string; currency: string; accountId: string | null; start: number; end: number; points: ForecastPoint[]; lowest: ForecastPoint; belowZero: string | null };
export type ForecastMonth = { month: string; events: ForecastEvent[]; totals: Array<{ currency: string; amount: number }> };
export type CashForecast = { today: string; end: string; events: ForecastEvent[]; accounts: ForecastSeries[]; totals: ForecastSeries[]; converted: boolean; months: ForecastMonth[]; belowZero: ForecastSeries[] };

type Input = {
 records: Entry[]; occurrences: Occurrence[]; debtPayments?: DebtPayment[];
 adjustments?: readonly ForecastAdjustment[];
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

/** Every cash movement from today through the horizon, by date. Overdue items are left out: the forecast starts from today's balances. */
export function forecastEvents(input: Input): ForecastEvent[] {
 const { records, occurrences, today, currency } = input;
 const end = shiftDay(today, input.days);
 const events: ForecastEvent[] = [];
 for (const item of upcomingPayments(records, occurrences, today, end)) {
  if (item.date < today) continue;
  const record = item.record;
  if (item.type === 'scheduled') {
   events.push({ key: item.key, date: item.date, name: record.name, kind: record.kind, source: 'scheduled', amount: (income.includes(record.kind) ? 1 : -1) * Number(item.amount), currency: record.currency, accountId: record.account_id ?? null });
  } else if (item.type === 'maturity' || record.kind === 'Money lent') {
   events.push({ key: item.key, date: item.date, name: record.name, kind: record.kind, source: item.type, amount: Number(item.amount), currency: record.currency, accountId: record.account_id ?? null });
  } else if (liabilities.includes(record.kind) && !hasMonthlyInstallment(record)) {
   events.push({ key: item.key, date: item.date, name: record.name, kind: record.kind, source: 'repayment', amount: -Number(item.amount), currency: record.currency, accountId: record.account_id ?? null });
  }
 }
 const paid = paidInstallmentMonths(input.debtPayments ?? []);
 for (const record of records) events.push(...installmentEvents(record, today, end, paid));
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
 * The total is in the primary currency only when every balance and event converts with an explicit rate; otherwise there is one total per currency, never added together. */
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
 const convert = (amount: number, from: string) => convertAmount(amount, from, currency, rates);
 const converted = [...cash.map(account => convert(Number(account.amount), account.currency)), ...events.map(event => convert(event.amount, event.currency))].every(value => value !== null && Number.isFinite(value));
 const totals: ForecastSeries[] = [];
 if (converted) {
  const deltas = new Map<string, number>();
  for (const event of events) addTo(deltas, event.date, convert(event.amount, event.currency)!);
  const start = cash.reduce((sum, account) => sum + convert(Number(account.amount), account.currency)!, 0);
  totals.push(series('total', 'Total cash', currency, null, start, deltas, today, days));
 } else {
  const currencies = [...new Set([...cash.map(account => account.currency), ...events.map(event => event.currency)])];
  for (const code of currencies) {
   const deltas = new Map<string, number>();
   for (const event of events) if (event.currency === code) addTo(deltas, event.date, event.amount);
   const start = cash.filter(account => account.currency === code).reduce((sum, account) => sum + Number(account.amount), 0);
   totals.push(series('total:' + code, 'Total cash', code, null, start, deltas, today, days));
  }
 }
 const months: ForecastMonth[] = [];
 for (const event of events) {
  const month = event.date.slice(0, 7);
  let group = months.at(-1);
  if (group?.month !== month) { group = { month, events: [], totals: [] }; months.push(group); }
  group.events.push(event);
  const code = converted ? currency : event.currency, amount = converted ? convert(event.amount, event.currency)! : event.amount;
  const total = group.totals.find(item => item.currency === code);
  if (total) total.amount += amount; else group.totals.push({ currency: code, amount });
 }
 const belowZero = [...totals, ...accounts].filter(item => item.belowZero !== null);
 return { today, end, events, accounts, totals, converted, months, belowZero };
}

/** What-ifs read back from browser storage: anything malformed is dropped rather than trusted. */
export function readAdjustments(value: unknown): ForecastAdjustment[] {
 if (!Array.isArray(value)) return [];
 return value.filter((item): item is ForecastAdjustment => !!item && typeof item === 'object'
  && typeof item.id === 'string' && typeof item.name === 'string' && item.name.length <= 120
  && typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount !== 0 && Math.abs(item.amount) <= 1e15
  && (item.frequency === 'Once' || item.frequency === 'Monthly') && typeof item.date === 'string' && validDay(item.date)).slice(0, 50);
}
