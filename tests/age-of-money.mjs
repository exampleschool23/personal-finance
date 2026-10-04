import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { ageOfMoney, ageOfMoneyTrend, ageOfMoneyOutflows } = loadTS('lib/age-of-money.ts');
const { shiftDay } = loadTS('lib/calendar-days.ts');

let next = 0;
const row = (kind, amount, date, extra = {}) => ({ id: 'r' + String(++next).padStart(3, '0'), kind, amount, currency: 'USD', date, frequency: 'Once', account_id: 'cash', ...extra });
const pay = (amount, date, extra) => row('Salary', amount, date, extra);
const spend = (amount, date, extra) => row('Living expense', amount, date, extra);
const rates = { USD: 1, UZS: 12500 };
const cash = new Set(['cash', 'savings']);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('income is matched to spending first in, first out, weighted by amount', () => {
 // $100 on Jan 1 and $100 on Jan 11; a $150 expense on Jan 21 uses $100 aged 20 days and $50 aged 10 days.
 const first = (100 * 20 + 50 * 10) / 150;
 const result = ageOfMoney([pay(100, '2026-01-01'), pay(100, '2026-01-11'), spend(150, '2026-01-21')], 'USD', '2026-12-31', rates, cash);
 assert.equal(result.outflows, 1);
 close(result.days, first);
 // The next expense uses the remaining $50 from Jan 11, 20 days old.
 const later = ageOfMoney([pay(100, '2026-01-01'), pay(100, '2026-01-11'), spend(150, '2026-01-21'), spend(50, '2026-01-31')], 'USD', '2026-12-31', rates, cash);
 close(later.days, (first + 20) / 2);
});

test('only the latest ten outflows count, and same-day income is spent first', () => {
 const records = [pay(10000, '2026-01-01')];
 for (let day = 1; day <= 15; day++) records.push(spend(10, `2026-02-${String(day).padStart(2, '0')}`));
 const result = ageOfMoney(records, 'USD', '2026-12-31', rates, cash);
 assert.equal(result.outflows, ageOfMoneyOutflows);
 // Feb 6 to 15 are 36 to 45 days after Jan 1.
 assert.equal(result.days, 40.5);
 assert.equal(ageOfMoney([spend(10, '2026-03-01'), pay(10, '2026-03-01')], 'USD', '2026-12-31', rates, cash).days, 0);
});

test('no income, no outflows or unmatched spending give no age instead of a guess', () => {
 assert.deepEqual(ageOfMoney([], 'USD', '2026-12-31', rates, cash), { days: null, outflows: 0, skipped: 0 });
 assert.equal(ageOfMoney([pay(100, '2026-01-01')], 'USD', '2026-12-31', rates, cash).days, null);
 assert.equal(ageOfMoney([spend(100, '2026-01-01'), pay(100, '2026-01-05')], 'USD', '2026-12-31', rates, cash).days, null, 'spending before any income is not aged');
 // A partly covered outflow is aged by the part income covers.
 assert.equal(ageOfMoney([pay(50, '2026-01-01'), spend(100, '2026-01-11')], 'USD', '2026-12-31', rates, cash).days, 10);
});

test('future, recurring, non-cash and non-spending records are left out', () => {
 const records = [
  pay(100, '2026-01-01'), spend(100, '2026-01-11'),
  spend(100, '2027-01-01'), pay(100, '2026-01-02', { frequency: 'Monthly' }),
  spend(100, '2026-01-05', { account_id: 'brokerage' }),
  row('Mortgage', 100, '2026-01-06'), row('Stock', 100, '2026-01-06'),
  // A mortgage payment counts only its interest as spending.
  pay(10, '2026-01-20'), spend(500, '2026-01-30', { mortgage_payment_id: 'm1', payment_interest: 10, payment_principal: 490 }),
 ];
 const result = ageOfMoney(records, 'USD', '2026-12-31', rates, cash);
 assert.equal(result.outflows, 2);
 assert.equal(result.days, 10);
});

test('amounts convert to the primary currency with explicit rates; records without one are counted as skipped', () => {
 const records = [pay(1250000, '2026-01-01', { currency: 'UZS' }), pay(100, '2026-01-11'), spend(150, '2026-01-21'), pay(100, '2026-01-02', { currency: 'EUR' }), spend(5, '2026-01-03', { currency: 'GBP' })];
 const result = ageOfMoney(records, 'USD', '2026-12-31', rates, cash);
 assert.equal(result.skipped, 2);
 close(result.days, (100 * 20 + 50 * 10) / 150);
 close(ageOfMoney(records, 'UZS', '2026-12-31', rates, cash).days, result.days);
});

test('the trend compares today with 30 days earlier in whole days', () => {
 assert.equal(shiftDay('2026-03-01', -30), '2026-01-30');
 const records = [pay(1000, '2026-01-01'), spend(10, '2026-01-21'), spend(10, '2026-02-25')];
 const trend = ageOfMoneyTrend(records, 'USD', '2026-03-01', rates, cash);
 // 30 days earlier only the Jan 21 expense (20 days) existed; now the average is (20 + 55) / 2.
 assert.equal(trend.days, 37.5);
 assert.equal(trend.change, 38 - 20);
 assert.equal(ageOfMoneyTrend([pay(10, '2026-02-20'), spend(10, '2026-02-25')], 'USD', '2026-03-01', rates, cash).change, null, 'no age 30 days ago, no change');
});
