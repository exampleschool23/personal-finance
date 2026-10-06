import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const { scheduleTrack, nextOccurrence } = loadTS('lib/recurring-history.ts');
const { formatMoney } = loadTS('lib/format.ts');
const usd = value => formatMoney(value, 'USD', 'en-US');
const record = (id, kind, amount, date, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Monthly', notes: '', ...extra });
const pay = record('pay', 'Salary', 1000, '2026-07-15');
const receipt = (id, due, amount) => [record(id, 'Salary', amount, due, { frequency: 'Once' }), { id: 'o' + id, record_id: 'pay', due_on: due, status: 'paid', transaction_id: id }];
const [a, oa] = receipt('a', '2026-07-15', 1000), [b, ob] = receipt('b', '2026-08-15', 800);
const data = { records: [pay, a, b, record('rent', 'Rent expense', 500, '2026-01-01')], occurrences: [oa, ob, { id: 'skip', record_id: 'pay', due_on: '2026-09-15', status: 'dismissed' }], debtPayments: [] };
const item = { key: 'pay:2026-10-15', record: pay, date: '2026-10-15', status: 'due', direction: 'income', amount: 1000 };

test('a schedule\'s history totals what was recorded against what was scheduled, month by month from its first month', () => {
 const track = scheduleTrack(item, data, '2026-10-20', 12);
 assert.deepEqual(track.points.map(point => [point.month, point.scheduled, point.recorded]), [['2026-07', 1000, 1000], ['2026-08', 1000, 800], ['2026-09', 0, 0], ['2026-10', 1000, 0]], 'no empty months before the first; a skipped month schedules nothing');
 assert.equal(track.recorded, 1800);
 assert.equal(track.scheduled, 3000);
 assert.equal(track.percent, 60);
 assert.equal(track.average, 900, 'the average counts only months with a payment');
 assert.deepEqual(track.history.map(entry => [entry.date, entry.status]), [['2026-10-15', 'overdue'], ['2026-09-15', 'skipped'], ['2026-08-15', 'paid'], ['2026-07-15', 'paid']], 'newest first, other schedules left out');
 assert.deepEqual(scheduleTrack(item, data, '2026-10-20', 2).points.map(point => point.month), ['2026-09', '2026-10'], 'the period limits the window');
 const fresh = scheduleTrack({ ...item, record: record('new', 'Salary', 5, '2026-11-01') }, { ...data, records: [...data.records, record('new', 'Salary', 5, '2026-11-01')] }, '2026-10-20', 12);
 assert.deepEqual([fresh.recorded, fresh.percent, fresh.average], [0, null, 0], 'a schedule that has not started has nothing yet');
});

test('the next payment is the oldest one still open, otherwise the first one due', () => {
 assert.equal(nextOccurrence(item, data, '2026-10-20').date, '2026-10-15');
 assert.equal(nextOccurrence(item, { ...data, occurrences: [...data.occurrences, { id: 'x', record_id: 'pay', due_on: '2026-10-15', status: 'paid', transaction_id: 'a' }] }, '2026-10-20').date, '2026-11-15');
});

const r = createRenderer();
const ui = stubs();
const h = React.createElement;
const pass = name => Object.assign(({ children }) => h('div', { 'data-part': name }, children), { displayName: name });
const Bar = Object.assign(({ dataKey }) => h('span', { 'data-bar': dataKey }), { displayName: 'Bar' });
const chart = { ...Object.fromEntries(['ResponsiveContainer', 'BarChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip'].map(name => [name, pass(name)])), Bar };
const { RecurringDetails, useRecurringDetails } = r.load('components/planning/recurring-details.tsx', { ...ui.modules, recharts: chart, '@/components/presentation-foundation/rolling-text': { RollingText: ({ text }) => text } });
const mount = props => (r.mount(h(RecurringDetails, props)), r);

test('tapping a schedule shows its totals, next payment, history chart and payments, with Edit and Record payment', () => {
 const calls = [];
 const view = mount({ item, data, today: '2026-10-20', onClose: () => calls.push('close'), onEdit: entry => calls.push('edit ' + entry.id), onPay: entry => calls.push('pay ' + entry.date) });
 const shown = text(view.tree);
 for (const part of ['pay', 'Every month · Salary · ' + usd(1000), 'Received in this period', usd(1800), '60% of ' + usd(3000), 'Average a month', usd(900), 'Next payment', '15 October 2026', '5 days ago', '15 August 2026', 'of ' + usd(1000), 'Skipped']) assert.ok(shown.includes(part), part);
 assert.deepEqual(view.all(byType(Bar)).map(bar => bar.props.dataKey), ['scheduled', 'recorded']);
 const buttons = view.all(byType(ui.Button));
 assert.deepEqual(buttons.map(button => text(button)), ['Edit', 'Record payment']);
 buttons.forEach(button => button.props.onClick());
 assert.deepEqual(calls, ['edit pay', 'pay 2026-10-15']);
 const early = mount({ item, data: { ...data, occurrences: [...data.occurrences, { id: 'x', record_id: 'pay', due_on: '2026-10-15', status: 'paid', transaction_id: 'a' }] }, today: '2026-10-20', onClose() {}, onPay() {} });
 assert.equal(early.find(byType(ui.Button)).props.disabled, true, 'a payment waits for its day');
 const empty = mount({ item: { ...item, direction: 'expense', record: { ...pay, id: 'none', date: '2026-12-01' } }, data, today: '2026-10-20', onClose() {} });
 assert.match(text(empty.tree), /Paid in this period.*Nothing recorded in this period\./);
 assert.equal(empty.all(byType(Bar)).length, 0);
});

test('the list opens the details on a tap and closes them before editing or recording', () => {
 const calls = [];
 let hook;
 const Host = () => { hook = useRecurringDetails(data, '2026-10-20', entry => calls.push('edit ' + entry.id), entry => calls.push('pay ' + entry.date)); return hook.dialog; };
 r.mount(h(Host));
 assert.equal(hook.dialog, null);
 hook.open(item); r.update();
 assert.ok(hook.dialog);
 r.find(byType(RecurringDetails)).props.onEdit(pay); r.update();
 assert.equal(hook.dialog, null);
 hook.open(item); r.update();
 r.find(byType(RecurringDetails)).props.onPay(item); r.update();
 assert.deepEqual(calls, ['edit pay', 'pay 2026-10-15']);
});
