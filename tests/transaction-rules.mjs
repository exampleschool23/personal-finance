import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { categoryChoices, canRecategorize, recategorize, ruleMatches, ruleTargets, suggestedPattern, directionOf } = loadTS('lib/transaction-rules.ts');
const { periodRange, transactionsIn, groupByDay, summarizeTransactions, emptyTransactionFilter } = loadTS('lib/transaction-list.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const categories = [{ id: 'pets', name: 'Pets', direction: 'expense' }, { id: 'tips', name: 'Tips', direction: 'income' }];

test('category choices list one direction: built-in kinds, then custom categories on the general kind', () => {
 assert.deepEqual(categoryChoices(categories, 'expense').map(choice => [choice.kind, choice.category_id]), [['Rent expense', null], ['Living expense', null], ['Charity', null], ['Other expense', null], ['Other expense', 'pets']]);
 assert.deepEqual(categoryChoices(categories, 'income').at(-1), { kind: 'Other income', category_id: 'tips', name: 'Tips', custom: true });
 assert.equal(directionOf('Salary'), 'income');assert.equal(directionOf('Charity'), 'expense');assert.equal(directionOf('Cash'), null);
});

test('only plain transactions change category, within their direction, and unchanged rows are not counted', () => {
 const rows = [record('a', 'Shop', 'Living expense', 5, '2026-09-01'), record('b', 'Pay', 'Salary', 900, '2026-09-01'), record('c', 'Fee', 'Other expense', 1, '2026-09-01', { operation_id: 'op' }),
  record('d', 'Split', 'Other expense', 10, '2026-09-01'), record('e', 'Plan', 'Living expense', 50, '2026-09-01', { frequency: 'Monthly' }), record('f', 'Pets', 'Other expense', 4, '2026-09-01', { custom_category_id: 'pets' })];
 const splits = [{ record_id: 'd', position: 0, category_id: 'pets', amount: 5 }];
 assert.ok(canRecategorize(rows[0]));
 for (const index of [2, 4]) assert.ok(!canRecategorize(rows[index]));
 assert.ok(!canRecategorize(rows[3], splits));
 const result = recategorize(rows, ['a', 'b', 'c', 'd', 'e', 'f'], { kind: 'Other expense', category_id: 'pets' }, splits);
 assert.equal(result.changed, 1);
 assert.deepEqual(result.records.find(row => row.id === 'a'), { ...rows[0], kind: 'Other expense', custom_category_id: 'pets' });
 assert.equal(result.records.find(row => row.id === 'b').kind, 'Salary');
 assert.equal(rows[0].kind, 'Living expense', 'the input is not mutated');
 assert.equal(recategorize(rows, ['f'], { kind: 'Charity', category_id: null }).records[0].kind, 'Living expense');
 assert.equal(recategorize(rows, ['f'], { kind: 'Charity', category_id: null }).records.find(row => row.id === 'f').custom_category_id, null);
});

test('rules match a name fragment case-insensitively within one direction', () => {
 const rule = { id: 'r', pattern: ' starbucks ', direction: 'expense', kind: 'Charity', category_id: null };
 const rows = [record('a', 'STARBUCKS #12', 'Living expense', 5, '2026-09-01'), record('b', 'Starbucks refund', 'Other income', 5, '2026-09-01'), record('c', 'Starbucks', 'Charity', 5, '2026-09-01'), record('d', 'Starbucks plan', 'Living expense', 5, '2026-09-01', { frequency: 'Monthly' })];
 assert.ok(ruleMatches(rule, rows[0]));
 assert.ok(!ruleMatches(rule, rows[1]));
 assert.deepEqual(ruleTargets(rule, rows), ['a'], 'already in the category or scheduled rows are not targets');
 assert.ok(!ruleMatches({ ...rule, pattern: '  ' }, rows[0]));
 assert.equal(suggestedPattern('STARBUCKS #1234'), 'STARBUCKS');
 assert.equal(suggestedPattern('Uber *trip 55-21'), 'Uber *trip');
 assert.equal(suggestedPattern('7-Eleven'), '7-Eleven');
});

test('the list keeps the period, search and filters, newest first, grouped by day with net totals', () => {
 assert.deepEqual(periodRange('this_month', '2026-10-02'), { from: '2026-10', to: '2026-10' });
 assert.deepEqual(periodRange('last_month', '2026-01-15'), { from: '2025-12', to: '2025-12' });
 assert.deepEqual(periodRange('three_months', '2026-10-02'), { from: '2026-08', to: '2026-10' });
 assert.deepEqual(periodRange('this_year', '2026-10-02'), { from: '2026-01', to: '2026-10' });
 assert.deepEqual(periodRange('twelve_months', '2026-10-02'), { from: '2025-11', to: '2026-10' });
 const rows = [record('a', 'Coffee', 'Living expense', 4, '2026-10-01'), record('b', 'Salary', 'Salary', 1000, '2026-10-01'), record('c', 'Rent', 'Rent expense', 12500000, '2026-10-02', { currency: 'UZS' }),
  record('d', 'Old', 'Living expense', 9, '2026-09-30'), record('e', 'Future', 'Living expense', 9, '2026-10-03'), record('f', 'Plan', 'Living expense', 9, '2026-10-01', { frequency: 'Monthly' }), record('g', 'Cash', 'Cash', 500, '2026-10-01'), record('h', 'Euro', 'Other expense', 5, '2026-10-02', { currency: 'EUR' })];
 const name = row => row.kind;
 const range = periodRange('this_month', '2026-10-02');
 const list = transactionsIn(rows, range, '2026-10-02', emptyTransactionFilter, name);
 assert.deepEqual(list.map(row => row.id), ['h', 'c', 'a', 'b']);
 assert.deepEqual(transactionsIn(rows, range, '2026-10-02', { ...emptyTransactionFilter, direction: 'income' }, name).map(row => row.id), ['b']);
 assert.deepEqual(transactionsIn(rows, range, '2026-10-02', { ...emptyTransactionFilter, query: 'rent EXP' }, name).map(row => row.id), ['c'], 'search covers the category name');
 assert.deepEqual(transactionsIn(rows, range, '2026-10-02', { ...emptyTransactionFilter, category: 'Living expense' }, name).map(row => row.id), ['a']);
 const convert = (amount, unit) => unit === 'USD' ? amount : unit === 'UZS' ? amount / 12500 : null;
 const days = groupByDay(list, convert);
 assert.deepEqual(days.map(day => [day.date, day.total]), [['2026-10-02', null], ['2026-10-01', 996]]);
 assert.deepEqual(groupByDay(list.filter(row => row.id !== 'h'), convert)[0].total, -1000);
 const summary = summarizeTransactions(list, convert);
 assert.deepEqual(summary, { count: 4, received: 1000, spent: 1004, largest: { name: 'Rent', amount: 1000 }, missing: 1 });
});
