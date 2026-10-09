import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { cashForecast, forecastEvents, readAdjustments, forecastHorizons } = loadTS('lib/cash-forecast.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const today = '2026-10-10';
const base = { occurrences: [], today, currency: 'USD', rates: { USD: 1, EUR: 0.5 } };

test('the horizons are 30, 90, 180 and 365 days, with one point per day from today', () => {
 assert.deepEqual([...forecastHorizons], [30, 90, 180, 365]);
 const forecast = cashForecast({ ...base, records: [record('cash', 'Checking', 'Cash', 100, '2026-01-01')], days: 30 });
 assert.equal(forecast.end, '2026-11-09');
 assert.equal(forecast.totals[0].points.length, 31);
 assert.deepEqual(forecast.totals[0].points[0], { date: today, balance: 100 });
 assert.equal(forecast.events.length, 0);
 assert.deepEqual(forecast.totals[0].lowest, { date: today, balance: 100 });
});

test('scheduled income and bills move the account they name; skipped, paid and overdue items do not', () => {
 const records = [
  record('cash', 'Checking', 'Cash', 1000, '2026-01-01'),
  record('pay', 'Pay', 'Salary', 3000.55, '2026-01-15', { frequency: 'Monthly', account_id: 'cash' }),
  record('rent', 'Rent', 'Rent expense', 1200.25, '2026-01-12', { frequency: 'Monthly', account_id: 'cash' }),
  record('gym', 'Gym', 'Living expense', 40, '2026-01-05', { frequency: 'Monthly' }),
 ];
 const occurrences = [{ id: 'o', record_id: 'rent', due_on: '2026-10-12', status: 'dismissed' }];
 const forecast = cashForecast({ ...base, records, occurrences, days: 30 });
 assert.deepEqual(forecast.events.map(event => [event.name, event.date, event.amount, event.accountId]), [
  ['Pay', '2026-10-15', 3000.55, 'cash'], ['Gym', '2026-11-05', -40, null],
 ]);
 const account = forecast.accounts[0];
 assert.equal(account.points.find(point => point.date === '2026-10-15').balance, 4000.55, 'precise amounts are kept, never rounded');
 assert.equal(account.end, 4000.55, 'an event without an account does not move any account');
 assert.equal(forecast.totals[0].end, 3960.55, 'but it moves total cash');
});

test('an account that is projected to go below zero is named with the first day it does', () => {
 const records = [record('cash', 'Checking', 'Cash', 100, '2026-01-01'), record('bill', 'Bill', 'Other expense', 150, '2026-10-20', { frequency: 'Monthly', account_id: 'cash' })];
 const forecast = cashForecast({ ...base, records, days: 90 });
 const account = forecast.accounts[0];
 assert.equal(account.belowZero, '2026-10-20');
 assert.deepEqual(account.lowest, { date: '2026-12-20', balance: -350 });
 assert.deepEqual(forecast.belowZero.map(item => item.id), ['total', 'cash']);
 const safe = cashForecast({ ...base, records: [record('cash', 'Checking', 'Cash', 0.1 + 0.2, '2026-01-01'), record('bill', 'Bill', 'Other expense', 0.3, '2026-10-20', { frequency: 'Once', account_id: 'cash' })], days: 30 });
 assert.equal(safe.belowZero.length, 0, 'float residue is not an overdraft');
});

test('loans are paid by their monthly payment with monthly interest until repaid; months already paid are skipped', () => {
 const loan = record('loan', 'Car loan', 'Loan', 1000, '2026-10-20', { rate: 12, estimated_monthly_payment: 400, opened_on: '2026-01-05' });
 const events = forecastEvents({ ...base, records: [loan], debtPayments: [{ record_id: 'loan', date: '2026-11-02' }], days: 180 });
 // November is paid already; the balance accrues 1% a month before each payment.
 assert.deepEqual(events.map(event => event.date), ['2026-12-05', '2027-01-05', '2027-02-05']);
 assert.deepEqual(events.slice(0, 2).map(event => event.amount), [-400, -400]);
 assert.ok(Math.abs(events[2].amount + ((1000 * 1.01 - 400) * 1.01 - 400) * 1.01) < 1e-9, 'the last payment is the remaining balance');
 assert.ok(!events.some(event => event.source === 'repayment'), 'the balance is not charged again on the due date');
 const lump = forecastEvents({ ...base, records: [record('debt', 'Friend', 'Debt', 500, '2026-11-01'), record('lent', 'Lent', 'Money lent', 300, '2026-11-03'), record('cd', 'CD', 'Deposit', 2000, '2026-12-01')], days: 90 });
 assert.deepEqual(lump.map(event => [event.name, event.source, event.amount]), [['Friend', 'repayment', -500], ['Lent', 'repayment', 300], ['CD', 'maturity', 2000]]);
});

test('what-if adjustments apply once or every month from their date, in the primary currency', () => {
 const records = [record('cash', 'Checking', 'Cash', 5000, '2026-01-01')];
 const adjustments = [{ id: 'a', name: 'Car repair', amount: -800, frequency: 'Once', date: '2026-10-25' }, { id: 'b', name: 'Side job', amount: 250, frequency: 'Monthly', date: '2026-11-15' }];
 const forecast = cashForecast({ ...base, records, adjustments, days: 90 });
 assert.deepEqual(forecast.events.map(event => [event.date, event.amount, event.source]), [['2026-10-25', -800, 'adjustment'], ['2026-11-15', 250, 'adjustment'], ['2026-12-15', 250, 'adjustment']]);
 assert.equal(forecast.totals[0].end, 4700);
 assert.equal(forecast.accounts[0].end, 5000);
 assert.deepEqual(forecast.months.map(month => [month.month, month.total, month.missing]), [['2026-10', -800, 0], ['2026-11', 250, 0], ['2026-12', 250, 0]]);
});

test('total cash is one series in the display currency; what no rate converts is left out and counted, never a second total', () => {
 const records = [record('usd', 'Checking', 'Cash', 1000, '2026-01-01'), record('eur', 'Euro account', 'Cash', 400, '2026-01-01', { currency: 'EUR' }),
  record('rent', 'Rent', 'Rent expense', 100, '2026-10-20', { currency: 'EUR', account_id: 'eur', frequency: 'Monthly' })];
 const converted = cashForecast({ ...base, records, days: 30 });
 assert.equal(converted.converted, true);
 assert.equal(converted.totals.length, 1);
 assert.equal(converted.totals[0].start, 1800, '400 EUR at 0.5 EUR per USD is 800 USD');
 assert.equal(converted.totals[0].end, 1600);
 assert.equal(converted.accounts[1].end, 300, 'an account stays in its own currency');
 const separate = cashForecast({ ...base, rates: undefined, records, days: 30 });
 assert.equal(separate.converted, false);
 assert.deepEqual(separate.totals.map(total => [total.currency, total.start, total.end]), [['USD', 1000, 1000]], 'never a EUR total beside the USD one');
 assert.equal(separate.missing, 2, 'the EUR balance and the EUR rent are missing');
 assert.deepEqual([separate.months[0].total, separate.months[0].missing], [0, 1]);
 assert.equal(converted.months[0].total, -200, 'a converted month total is in the display currency');
 const mismatch = cashForecast({ ...base, records: [record('usd', 'Checking', 'Cash', 1000, '2026-01-01'), record('x', 'X', 'Salary', 50, '2026-10-20', { currency: 'EUR', account_id: 'usd', frequency: 'Monthly' })], days: 30 });
 assert.equal(mismatch.events[0].accountId, null, 'an event in another currency never moves the account directly');
 assert.equal(mismatch.accounts[0].end, 1000);
});

test('stored what-ifs are validated before use', () => {
 const good = { id: 'a', name: 'Rent rise', amount: -500, frequency: 'Monthly', date: '2027-06-01' };
 assert.deepEqual(readAdjustments([good]), [good]);
 assert.deepEqual(readAdjustments('nope'), []);
 assert.deepEqual(readAdjustments([{ ...good, amount: 0 }, { ...good, amount: Infinity }, { ...good, frequency: 'Weekly' }, { ...good, date: '2027-02-30' }, null, { ...good, name: 5 }]), []);
});

test('income arriving today never lifts the lowest balance above today\'s opening balance', () => {
 const records = [record('cash', 'Checking', 'Cash', 500, '2026-01-01'), record('pay', 'Pay', 'Salary', 2000, today, { frequency: 'Monthly', account_id: 'cash' })];
 const forecast = cashForecast({ ...base, records, days: 30 });
 assert.equal(forecast.totals[0].points[0].balance, 2500, 'the chart shows the end of today');
 assert.deepEqual(forecast.totals[0].lowest, { date: today, balance: 500 });
 assert.deepEqual(forecast.accounts[0].lowest, { date: today, balance: 500 });
});

test('a projected series is shown in the display currency, or not at all without a rate', () => {
 const { seriesIn } = loadTS('lib/cash-forecast.ts');
 const records = [record('eur', 'Euro account', 'Cash', 400, '2026-01-01', { currency: 'EUR' })];
 const account = cashForecast({ ...base, records, days: 30 }).accounts[0];
 const shown = seriesIn(account, 'USD', base.rates);
 assert.deepEqual([shown.currency, shown.start, shown.end, shown.lowest.balance, shown.points[0].balance], ['USD', 800, 800, 800, 800]);
 assert.equal(seriesIn(account, 'USD', undefined), null);
 assert.equal(seriesIn(account, 'EUR', undefined), account);
});
