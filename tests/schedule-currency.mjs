import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { inScheduleCurrency } = loadTS('lib/schedule-currency.ts');
const { withExtraPayments } = loadTS('lib/planning.ts');
const { monthOccurrences } = loadTS('lib/recurring.ts');

// Pixel Game Club pays a USD 1,000 schedule; October's payment came in UZS.
const pixel = { id: 'pixel', name: 'Pixel Game Club', kind: 'Business income', currency: 'USD', amount: 1000, quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Monthly', notes: '' };
const currencyOf = new Map([['pixel', 'USD']]);
const paid = { id: 'o', record_id: 'pixel', due_on: '2026-10-01', status: 'paid', transaction_id: 't1', transaction: { amount: 5000000, date: '2026-10-06', currency: 'UZS' } };
const usdPerUzs = { '2026-10-06': 1 / 12500, '2026-10-07': 1 / 12800 };

test('a payment in another currency counts in its schedule’s currency at the rate of its own day', async () => {
 const asked = [];
 const rate = async (from, to, date) => { asked.push([from, to, date]); return usdPerUzs[date]; };
 const later = { id: 't2', occurrence_record_id: 'pixel', occurrence_due_on: '2026-10-01', amount: 2560000, currency: 'UZS', date: '2026-10-07' };
 const same = { id: 't3', occurrence_record_id: 'pixel', occurrence_due_on: '2026-10-01', amount: 100, currency: 'USD', date: '2026-10-07' };
 const counted = await inScheduleCurrency([paid], [later, same], currencyOf, rate);
 assert.equal(Math.round(counted.occurrences[0].transaction.amount), 400);
 assert.equal(counted.occurrences[0].transaction.currency, 'UZS', 'the payment keeps its own currency');
 assert.deepEqual(counted.payments.map(payment => Math.round(payment.amount)), [200, 100]);
 assert.deepEqual(asked, [['UZS', 'USD', '2026-10-06'], ['UZS', 'USD', '2026-10-07']], 'one quote per day; same-currency payments need none');
 const [october] = monthOccurrences([pixel], withExtraPayments(counted.occurrences, counted.payments), '2026-10', '2026-10-08');
 assert.deepEqual([october.status, Math.round(october.recorded)], ['paid', 700]);
});

test('without a rate the amount is unknown, never counted in the wrong currency', async () => {
 const rate = async () => { throw Error('Historical exchange rates are unavailable.'); };
 const later = { id: 't2', occurrence_record_id: 'pixel', occurrence_due_on: '2026-10-01', amount: 2560000, currency: 'UZS', date: '2026-10-07' };
 const counted = await inScheduleCurrency([paid, { ...paid, id: 'x', due_on: '2026-09-01', transaction: null }], [later], currencyOf, rate);
 assert.equal(counted.occurrences[0].transaction.amount, null);
 assert.equal(counted.occurrences[1].transaction, null);
 assert.deepEqual(counted.payments, []);
 const [october] = monthOccurrences([pixel], withExtraPayments(counted.occurrences, counted.payments), '2026-10', '2026-10-08');
 assert.deepEqual([october.status, october.recorded], ['paid', undefined]);
 assert.equal((await inScheduleCurrency([{ ...paid, transaction: { ...paid.transaction, date: '' } }], [], currencyOf, rate)).occurrences[0].transaction.amount, null, 'a payment without a day has no rate');
 assert.equal((await inScheduleCurrency([paid], [], currencyOf, async () => 0)).occurrences[0].transaction.amount, null, 'a zero rate is no rate');
});
