import { shiftDay, type BenchmarkData } from './benchmark-data';
import { isInvestmentRecord } from './comparison-profile';
import { value, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import type { MarketData } from './market';

// Illustrative fixtures only: never represent these as historical market quotes.
export const demoMarket: MarketData = { rates: { USD: 1, UZS: 12500 }, fx: null, quotes: {}, errors: {}, stocksConfigured: false };
export const demoBenchmarkKeys = ['BTC', 'SPY', 'depositUSD'];
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
  record('business', 'Neighborhood café', 'Business', 12000, { estimated_monthly_income: 320 }),
  record('mortgage', 'Apartment mortgage', 'Mortgage', 18000, { estimated_monthly_payment: 350, date: shiftDay(today, 20) }),
  record('lent', 'Loan to a friend', 'Money lent', 1200, { lent_date: shiftDay(today, -60), date: shiftDay(today, 30) }),
  record('salary', 'Monthly salary', 'Salary', 18000000, { currency: 'UZS', frequency: 'Monthly' }),
  record('rent', 'Apartment rent', 'Rent expense', 4500000, { currency: 'UZS', frequency: 'Monthly' }),
  record('groceries', 'Groceries & everyday', 'Living expense', 2000000, { currency: 'UZS', frequency: 'Monthly' }),
 ];
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
   const balance = record.kind === 'Deposit' ? amount : opening + (amount - opening) * progress + Math.sin(month * 1.8) * amount * .025 * (1 - progress);
   add('value-' + month, date, 'valuation', 0, balance);
   if (record.kind === 'Deposit' || record.kind === 'Business' || (record.kind === 'Stock' && month % 3 === 0)) {
    const receipt = record.kind === 'Deposit' ? amount * original.rate / 100 / 12 : record.kind === 'Business' ? 250 + month * 6 : amount * .003;
    add('income-' + month, date, 'income', receipt, null);
   }
   if (record.kind === 'Business') add('expense-' + month, date, 'expense', 45 + month * 2, null);
  }
 }
 return { records, events, cashflows: [] as Entry[], incomeRecords: records };
}

export function demoBenchmarks(today: string): BenchmarkData {
 const start = shiftDay(today, -365);
 const prices: BenchmarkData['prices'] = { BTC: [], SPY: [] };
 for (let day = 0; day <= 365; day++) {
  const date = shiftDay(start, day), progress = day / 365;
  prices.BTC.push({ date, close: 52000 * (1 + .28 * progress + .075 * Math.sin(progress * Math.PI * 6)) });
  prices.SPY.push({ date, close: 480 * (1 + .13 * progress + .022 * Math.sin(progress * Math.PI * 5)) });
 }
 return { start, end: today, prices, fx: [{ date: start, rates: { ...demoMarket.rates! } }], errors: {} };
}
