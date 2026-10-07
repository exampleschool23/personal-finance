import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { inScheduleCurrency } = loadTS('lib/schedule-currency.ts');
const { withExtraPayments, laterPayments } = loadTS('lib/planning.ts');
const { monthOccurrences, recurringSummary } = loadTS('lib/recurring.ts');
const { convertMoney, amountIn } = loadTS('lib/money.ts');

// Pixel Game Club pays a USD 1,000 schedule; October's payment came in UZS.
const pixel = { id: 'pixel', name: 'Pixel Game Club', kind: 'Business income', currency: 'USD', amount: 1000, quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Monthly', notes: '' };
const currencyOf = new Map([['pixel', 'USD']]);
const paid = { id: 'o', record_id: 'pixel', due_on: '2026-10-01', status: 'paid', transaction_id: 't1', transaction: { amount: 5000000, date: '2026-10-06', currency: 'UZS' } };
const uzsPayment = { ...pixel, id: 't1', currency: 'UZS', amount: 5000000, frequency: 'Once', date: '2026-10-06' };
const usdPerUzs = { '2026-10-06': 1 / 12500, '2026-10-07': 1 / 12800 };

test('money converts only with a usable rate and never keeps its figure under another currency', () => {
 assert.deepEqual(convertMoney({ amount: 12, currency: 'USD' }, 'USD'), { amount: 12, currency: 'USD' });
 assert.equal(convertMoney({ amount: 5000000, currency: 'UZS' }, 'USD'), null, 'no rate, no figure');
 assert.equal(Math.round(convertMoney({ amount: 5000000, currency: 'UZS' }, 'USD', () => 1 / 12500).amount), 400);
 assert.equal(convertMoney({ amount: 90, currency: 'EUR' }, 'UZS', { EUR: 0.9, UZS: 12500 }).amount, 1250000);
 for (const rate of [0, -1, NaN, null, undefined, Infinity]) assert.equal(convertMoney({ amount: 1, currency: 'UZS' }, 'USD', () => rate), null);
 assert.equal(convertMoney({ amount: 1, currency: 'EUR' }, 'UZS', { EUR: 0.9 }), null, 'both sides of a table need a rate');
 assert.equal(convertMoney({ amount: NaN, currency: 'USD' }, 'USD'), null);
 assert.equal(amountIn({ amount: 5000000, currency: 'UZS' }, 'USD'), null);
 assert.equal(amountIn({ amount: 450, currency: 'USD' }, 'USD'), 450);
});

test('a payment in another currency reaches Recurring as money in its schedule’s currency, at the rate of its own day', async () => {
 const asked = [];
 const rate = async (from, to, date) => { asked.push([from, to, date]); return usdPerUzs[date]; };
 const later = { id: 't2', occurrence_record_id: 'pixel', occurrence_due_on: '2026-10-01', amount: 2560000, currency: 'UZS', date: '2026-10-07' };
 const same = { id: 't3', occurrence_record_id: 'pixel', occurrence_due_on: '2026-10-01', amount: 100, currency: 'USD', date: '2026-10-07' };
 const counted = await inScheduleCurrency([paid], [later, same], currencyOf, rate);
 assert.equal(counted.occurrences[0].transaction.currency, 'USD');
 assert.equal(Math.round(counted.occurrences[0].transaction.amount), 400);
 assert.deepEqual(counted.payments.map(payment => [Math.round(payment.amount), payment.currency]), [[200, 'USD'], [100, 'USD']]);
 assert.deepEqual(asked, [['UZS', 'USD', '2026-10-06'], ['UZS', 'USD', '2026-10-07']], 'one quote per day; same-currency payments need none');
 const [october] = monthOccurrences([pixel], withExtraPayments(counted.occurrences, counted.payments, currencyOf), '2026-10', '2026-10-08');
 assert.deepEqual([october.status, Math.round(october.recorded)], ['paid', 700]);
});

test('UZS 5,000,000 on a USD schedule is never shown or totalled as $5,000,000', async () => {
 // Without a rate, the read hands the payment on unchanged and Recurring refuses to count it.
 const failed = await inScheduleCurrency([paid], [], currencyOf, async () => { throw Error('Historical exchange rates are unavailable.'); });
 assert.deepEqual(failed.occurrences[0].transaction, paid.transaction);
 const [unread] = monthOccurrences([pixel], failed.occurrences, '2026-10', '2026-10-08');
 assert.deepEqual([unread.status, unread.recorded], ['paid', null]);
 const summary = recurringSummary([unread], amount => amount);
 assert.deepEqual([summary.income.done, summary.missing], [0, 1]);
 // The page's own fallback, the transaction among the loaded records, is guarded the same way.
 const [fallback] = monthOccurrences([pixel, uzsPayment], [{ ...paid, transaction: undefined }], '2026-10', '2026-10-08');
 assert.equal(fallback.recorded, null);
 // A later payment in another currency makes the total unknown instead of adding UZS to dollars.
 const usd = { ...paid, transaction: { amount: 600, date: '2026-10-02', currency: 'USD' } };
 const extra = { ...uzsPayment, id: 't9', occurrence_record_id: 'pixel', occurrence_due_on: '2026-10-01' };
 assert.equal(monthOccurrences([pixel, extra], [usd], '2026-10', '2026-10-08')[0].recorded, null);
 assert.equal(laterPayments([usd], [{ ...extra, amount: 5000000 }], currencyOf).get('pixel:2026-10-01'), null);
 assert.equal(laterPayments([usd], [{ ...extra, currency: 'USD', amount: 50 }], currencyOf).get('pixel:2026-10-01'), 50);
 // A payment without a day or with a zero rate has no rate either.
 assert.equal((await inScheduleCurrency([{ ...paid, transaction: { ...paid.transaction, date: '' } }], [], currencyOf, async () => 1)).occurrences[0].transaction.currency, 'UZS');
 assert.equal((await inScheduleCurrency([paid], [], currencyOf, async () => 0)).occurrences[0].transaction.currency, 'UZS');
});
