import { shiftDay } from './benchmark-data';
import { defaultComparisonPreferences, isInvestmentRecord } from './comparison-profile';
import { interestKinds, value, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import type { MarketData } from './market';
import type { Category, Goal } from './planning';

// Illustrative fixtures only: never represent these as historical market quotes.
export const demoMarket: MarketData = { rates: { USD: 1, UZS: 12500 }, fx: null, quotes: {}, errors: {}, stocksConfigured: false };
// The sample workspace also shows the Treasury bill benchmark, so the risk-free comparison can be explored.
export const demoBenchmarkKeys = [...defaultComparisonPreferences.benchmarks, 'BIL'] as const;
export function demoRecords(today: string): Entry[] {
 const record = (id: string, name: string, kind: Entry['kind'], amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: 'demo-' + id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0,
  date: shiftDay(today, -365), frequency: 'Once', notes: '', ownership_percentage: 100, ...extra,
 });
 return [
  record('cash', 'Savings account', 'Cash', 8500),
  record('aapl', 'AAPL', 'Stock', 225, { quantity: 20, cost: 190 }),
  record('spy', 'SPY', 'Stock', 560, { quantity: 10, cost: 480 }),
  record('btc', 'Bitcoin', 'Crypto', 60000, { quantity: .08, cost: 52000 }),
  record('deposit-usd', 'USD term deposit', 'Deposit', 5000, { rate: 8, deposit_compounding: 'none', estimated_monthly_income: 5000 * .08 / 12 }),
  record('deposit-uzs', 'UZS term deposit', 'Deposit', 50000000, { currency: 'UZS', rate: 21, deposit_compounding: 'none', estimated_monthly_income: 875000 }),
  record('tbill', 'US Treasury bill', 'Treasury bill', 4000, { rate: 4.3, deposit_compounding: 'none', estimated_monthly_income: 4000 * .043 / 12, date: shiftDay(today, 75) }),
  record('business', 'Neighborhood café', 'Business', 12000, { estimated_monthly_income: 320 }),
  record('mortgage', 'Apartment mortgage', 'Mortgage', 18000, { estimated_monthly_payment: 350, date: shiftDay(today, 20) }),
  record('lent', 'Loan to a friend', 'Money lent', 1200, { lent_date: shiftDay(today, -60), date: shiftDay(today, 30) }),
  record('salary', 'Monthly salary', 'Salary', 18000000, { currency: 'UZS', frequency: 'Monthly' }),
  record('rent', 'Apartment rent', 'Rent expense', 4500000, { currency: 'UZS', frequency: 'Monthly' }),
  record('groceries', 'Groceries & everyday', 'Living expense', 2000000, { currency: 'UZS', frequency: 'Monthly' }),
  ...demoSpending(today, record),
 ];
}
/** Seven months of day-to-day purchases, bills, giving and pay, so spending charts and budget history have something real to compare.
 * The current month runs slightly ahead of the one before, as real spending often does. */
function demoSpending(today: string, record: (id: string, name: string, kind: Entry['kind'], amount: number, extra?: Partial<Entry>) => Entry): Entry[] {
 const purchases: Array<[string, number]> = [['Groceries', 64], ['Coffee', 9], ['Taxi', 18], ['Lunch', 22], ['Pharmacy', 31], ['Groceries', 71], ['Fuel', 45], ['Dinner out', 58], ['Groceries', 52], ['Gym', 40]];
 const monthly: Array<[string, Entry['kind'], number, number, Partial<Entry>?]> = [
  ['Apartment rent', 'Rent expense', 1, 4500000, { currency: 'UZS' }], ['Monthly salary', 'Salary', 5, 18000000, { currency: 'UZS' }],
  ['Phone & internet', 'Other expense', 8, 25], ['Streaming', 'Other expense', 14, 12], ['Donation', 'Charity', 18, 20],
 ];
 const month = today.slice(0, 7), todayDay = Number(today.slice(8, 10));
 const spends: Entry[] = [];
 for (let back = 6; back >= 0; back--) {
  const date = new Date(month + '-01T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() - back);
  const target = date.toISOString().slice(0, 7), label = back === 0 ? 'current' : back === 1 ? 'previous' : 'past' + back;
  const pace = back === 0 ? 1.15 : 1 + ((back * 7) % 5 - 2) / 20;
  const add = (id: string, name: string, kind: Entry['kind'], day: number, amount: number, extra: Partial<Entry> = {}) => {
   if (back === 0 && day > todayDay) return;
   spends.push(record(`${id}-${label}`, name, kind, amount, { ...extra, date: `${target}-${String(day).padStart(2, '0')}` }));
  };
  purchases.forEach(([name, amount], index) => add(`spend-${index}`, name, 'Living expense', 2 + index * 3, back <= 1 ? (back === 0 ? Math.round(amount * 1.15) : amount) : Math.round(amount * pace)));
  monthly.forEach(([name, kind, day, amount, extra], index) => add(`bill-${index}`, name, kind, day, amount, extra));
  if (back % 2 === 0) add('freelance', 'Freelance project', 'Other income', 20, 600);
  if (back === 3) add('gift', 'Birthday gifts', 'Other expense', 11, 180);
 }
 return spends;
}

export function demoHistory(records: Entry[], today: string) {
 const events: HistoryEvent[] = [];
 const originals = new Map(demoRecords(today).map(record => [record.id, record]));
 for (const record of records.filter(isInvestmentRecord)) {
  const original = originals.get(record.id);
  // Demo edits keep their own values; new records don't acquire invented history.
  if (!original || original.kind !== record.kind || original.currency !== record.currency) continue;
  const amount = value(original);
  const opening = ['Stock', 'Crypto'].includes(record.kind) ? original.cost * original.quantity : record.kind === 'Business' ? 9000 : amount;
  const add = (suffix: string, date: string, event_type: HistoryEvent['event_type'], amount: number, balance: number | null) => events.push({
   id: record.id + ':' + suffix, record_id: record.id, occurred_on: date, created_at: date + 'T12:00:00Z',
   event_type, amount, balance, ownership_percentage: 100, principal: 0, interest: 0, notes: 'Sample data',
  });
  add('purchase', shiftDay(today, -365), 'contribution', opening, opening);
  for (let month = 1; month <= 12; month++) {
   const date = shiftDay(today, -365 + Math.floor(365 * month / 12));
   const progress = month / 12;
   const balance = interestKinds.includes(record.kind) ? amount : opening + (amount - opening) * progress + Math.sin(month * 1.8) * amount * .025 * (1 - progress);
   add('value-' + month, date, 'valuation', 0, balance);
   if (interestKinds.includes(record.kind) || record.kind === 'Business' || (record.kind === 'Stock' && month % 3 === 0)) {
    const receipt = interestKinds.includes(record.kind) ? amount * original.rate / 100 / 12 : record.kind === 'Business' ? 250 + month * 6 : amount * .003;
    add('income-' + month, date, 'income', receipt, null);
   }
   if (record.kind === 'Business') add('expense-' + month, date, 'expense', 45 + month * 2, null);
  }
 }
 return { records, events, cashflows: [] as Entry[], incomeRecords: records };
}

/** Sample goals and custom categories, so goal pages, budget contributions and the category picker have something to show. */
export function demoPlanning(today: string): { goals: Goal[]; categories: Category[] } {
 const months = (count: number) => { const date = new Date(today + 'T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() + count); return date.toISOString().slice(0, 10); };
 const goal = (id: string, name: string, allocated: number, target: number, date: string, monthly: number, priority: number): Goal =>
  ({ id: 'demo-goal-' + id, name, kind: 'savings', account_id: 'demo-cash', currency: 'USD', allocated, target, target_date: date, archived: false, monthly_contribution: monthly, funding_monthly: monthly, funding_priority: priority });
 return {
  goals: [goal('emergency', 'Emergency fund', 4200, 10000, months(14), 400, 1), goal('vacation', 'Summer vacation', 1150, 3000, months(8), 230, 2)],
  categories: [{ id: 'demo-category-restaurants', name: 'Restaurants', direction: 'expense' }, { id: 'demo-category-transport', name: 'Transport', direction: 'expense' }, { id: 'demo-category-freelance', name: 'Freelance', direction: 'income' }],
 };
}
