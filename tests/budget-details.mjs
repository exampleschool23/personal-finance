import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const { categoryMonth } = loadTS('lib/budget-details.ts');
const { formatMoney } = loadTS('lib/format.ts');
const usd = value => formatMoney(value, 'USD', 'en-US');
const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const view = { splits: [], today: '2026-10-20', currency: 'USD', rates: { USD: 1, EUR: 0.5 } };
const records = [
 record('a', 'Korzinka', 'Living expense', 40, '2026-10-02', { account_id: 'cash' }),
 record('b', 'korzinka ', 'Living expense', 60, '2026-10-12'),
 record('c', 'Rent', 'Living expense', 500, '2026-10-05'),
 record('split', 'Mixed shop', 'Living expense', 100, '2026-10-08'),
 record('later', 'Future', 'Living expense', 9, '2026-10-25'),
 record('last', 'Korzinka', 'Living expense', 70, '2026-09-30'),
 record('other', 'Cinema', 'Leisure', 20, '2026-10-03'),
 record('bill', 'Groceries', 'Living expense', 300, '2026-01-01', { frequency: 'Monthly' }),
 record('peso', 'Abroad', 'Living expense', 10, '2026-10-04', { currency: 'MXN' }),
 record('pay', 'Acme', 'Salary', 2000, '2026-10-01'),
 record('gig', 'Fiverr', 'Other income', 300, '2026-10-06', { custom_category_id: 'side' }),
];
const splits = [{ record_id: 'split', category_id: 'Living expense', amount: 30 }, { record_id: 'split', category_id: 'Leisure', amount: 70 }];

test('a category\'s month lists its payments newest first and groups them by name, adding up to the Budget actual', () => {
 const month = categoryMonth({ records }, 'Living expense', '2026-10', { ...view, splits });
 assert.deepEqual(month.payments.map(payment => [payment.id, payment.amount]), [['b', 60], ['split', 30], ['c', 500], ['peso', null], ['a', 40]], 'a split counts only its part; later days, last month, other categories and schedules are left out');
 assert.deepEqual(month.payees, [{ name: 'Rent', amount: 500, count: 1 }, { name: 'korzinka', amount: 100, count: 2 }, { name: 'Mixed shop', amount: 30, count: 1 }], 'names differing in letter case are one payee, largest first');
 assert.equal(month.total, 630, 'the same as the Budget row Actual');
 assert.equal(month.missing, 1, 'an amount no rate converts is counted as missing, never added under the wrong currency');
 assert.equal(categoryMonth({ records }, 'Living expense', '2026-10', { ...view, currency: 'EUR' }).total, (40 + 60 + 500 + 100) * 0.5, 'amounts are in the display currency');
});

test('an income category lists what came in by its own category; an empty month has nothing', () => {
 assert.deepEqual(categoryMonth({ records }, 'Salary', '2026-10', view).payees, [{ name: 'Acme', amount: 2000, count: 1 }]);
 assert.deepEqual(categoryMonth({ records }, 'side', '2026-10', view).payments.map(payment => payment.id), ['gig'], 'a custom income category by its id');
 assert.deepEqual(categoryMonth({ records }, 'Other income', '2026-10', view).payments, [], 'never under the kind it was saved with');
 assert.deepEqual(categoryMonth({ records }, 'Living expense', '2026-11', view), { payments: [], payees: [], total: 0, missing: 0 });
});

const r = createRenderer();
const ui = stubs();
const h = React.createElement;
const pass = name => Object.assign(({ children }) => h('div', { 'data-part': name }, children), { displayName: name });
const Bar = Object.assign(({ dataKey }) => h('span', { 'data-bar': dataKey }), { displayName: 'Bar' });
const chart = { ...Object.fromEntries(['ResponsiveContainer', 'BarChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip'].map(name => [name, pass(name)])), Bar };
const { CategoryDetailsDialog } = r.load('components/budget/category-details.tsx', { ...ui.modules, recharts: chart, '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value } });
const row = { key: 'Living expense', name: 'Living expense', custom: false, direction: 'expense', type: 'fixed', group: 'Household', excluded: false, budget: 700, actual: 630, remaining: 70, rolloverIn: 0, progress: 0.9, missing: false, rollover: false, rolloverStart: null, rolloverBalance: 0, rolloverCurrency: null, rolloverNegative: false };
const history = { months: [{ month: '2026-09', amount: 70, planned: 700 }, { month: '2026-10', amount: 630, planned: 700 }], lastMonth: 70, average: 350 };
const bill = records.find(item => item.id === 'bill');
const props = { row, history, data: { records: [...records, record('cash', 'Wallet', 'Cash', 100, '2026-01-01')] }, splits, bills: [bill], month: '2026-10', today: '2026-10-20', currency: 'USD', rates: { USD: 1 }, onClose() {} };

test('tapping a category shows this month against the plan, where the money went, its bills, its history and each payment', () => {
 const calls = [];
 r.mount(h(CategoryDetailsDialog, { ...props, onEditBill: item => calls.push(item.id), onClose: () => calls.push('close') }));
 const shown = text(r.tree);
 for (const part of ['Living expense', 'October 2026 · Household', 'Spent this month', usd(630), 'of ' + usd(700), 'Remaining', usd(70), 'Average a month', usd(350), 'Where the money went', 'Rent', usd(500), '79%', 'korzinka', 'Recurring', 'Groceries', usd(300), 'History', 'Transactions', '2 October 2026 · Wallet', 'Some currencies could not be converted and are excluded from totals.']) assert.ok(shown.includes(part), part);
 assert.deepEqual(r.all(byType(Bar)).map(bar => bar.props.dataKey), ['scheduled', 'recorded']);
 r.find(byType(ui.Button, 'Groceries')).props.onClick();
 assert.deepEqual(calls, ['bill']);
});

test('a category with nothing recorded shows the empty history, and a viewer cannot open its bills', () => {
 r.mount(h(CategoryDetailsDialog, { ...props, row: { ...row, actual: 0, remaining: 700 }, history: { months: [{ month: '2026-10', amount: 0, planned: 0 }], lastMonth: 0, average: 0 }, month: '2026-11' }));
 const shown = text(r.tree);
 assert.match(shown, /Nothing recorded in this period\./);
 assert.ok(!shown.includes('Where the money went') && !shown.includes('Transactions'));
 assert.equal(r.all(byType(Bar)).length, 0);
 assert.equal(r.all(byType(ui.Button, 'Groceries')).length, 0, 'without onEditBill a bill is plain text');
});
