import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const { formatMoney } = loadTS('lib/format.ts');
const r = createRenderer();
const ui = stubs();
const RowMenu = Object.assign(({ items }) => React.createElement('menu', null, items.map(item => React.createElement('li', { key: item.label }, item.label))), { displayName: 'RowMenu' });
const { OccurrenceRow, PlanRows, ArchivedFold } = r.load('components/planning/recurring-rows.tsx', { ...ui.modules, '@/components/presentation-foundation/row-menu': { RowMenu } });
const mount = (Component, props) => (r.mount(React.createElement(Component, props)), r);
const usd = value => formatMoney(value, 'USD', 'en-US');

const rent = { id: 'rent', name: 'Rent', kind: 'Rent expense', currency: 'USD', amount: 900, frequency: 'Monthly', date: '2026-01-01' };
const item = (status, extra = {}) => ({ key: 'rent:2026-10-01', record: rent, date: '2026-10-01', status, direction: 'expense', amount: 900, ...extra });
const tap = { target: { closest: () => null } }, onButton = { target: { closest: () => ({}) } };

test('a scheduled row is tapped to edit, records an open payment and offers Skip and Archive in its menu', () => {
 const calls = [];
 const view = mount(OccurrenceRow, { item: item('overdue'), dated: true, today: '2026-10-05', busy: false, onEdit: record => calls.push(['edit', record.id]), onPay: () => calls.push(['pay']), onSkip: () => calls.push(['skip']), onArchive: () => calls.push(['archive']) });
 assert.match(text(view.tree), /Rent expense · 1 October 2026/);
 assert.deepEqual(view.all(byType(RowMenu)).flatMap(menu => menu.props.items.map(entry => entry.label)), ['Skip this occurrence', 'Archive']);
 view.find(byType(RowMenu)).props.items.forEach(entry => entry.onSelect());
 view.find(byType(ui.Button)).props.onClick();
 const row = view.find(byType('li'));
 row.props.onClick(tap); row.props.onClick(onButton);
 assert.deepEqual(calls, [['skip'], ['archive'], ['pay'], ['edit', 'rent']], 'a tap on a button or the menu does not also open the form');
});

test('a settled row keeps only Archive; a loan payment and a read-only row have no menu', () => {
 const paid = mount(OccurrenceRow, { item: item('paid', { recorded: 850 }), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {}, onArchive() {} });
 assert.match(text(paid.tree), new RegExp('Paid · ' + usd(850).replace('$', '\\$') + ' · 94%'));
 assert.equal(paid.all(node => node.props?.className === 'done-tick')[0].props['data-done'], true, 'a settled row is ticked before its icon');
 assert.deepEqual(paid.find(byType(RowMenu)).props.items.map(entry => entry.label), ['Archive']);
 const another = paid.find(byType(ui.Button));
 assert.equal(another.props.disabled, false, 'a recorded payment takes another one');
 const skipped = mount(OccurrenceRow, { item: item('skipped'), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {} });
 assert.equal(skipped.find(byType(ui.Button)).props.disabled, true, 'a skipped occurrence shows the button, unavailable');
 assert.equal(mount(OccurrenceRow, { item: item('due', { installment: true }), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {}, onArchive() {} }).all(byType(RowMenu)).length, 0);
 const early = mount(OccurrenceRow, { item: item('due', { date: '2026-10-20' }), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {} });
 assert.equal(early.find(byType(ui.Button)).props.disabled, true, 'a payment waits for its day');
 assert.equal(early.find(byType(RowMenu)).props.items.length, 1);
 assert.match(text(mount(OccurrenceRow, { item: item('skipped'), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {} }).tree), /Skipped/);
});

test('spending plans show spent over planned with a bar that turns red when overspent, and are tapped to record spending', () => {
 const plan = { id: 'g', name: 'Groceries', category: 'Groceries', currency: 'USD', amount: 400, start_date: '2026-01-01', end_date: null };
 const spent = [], archived = [];
 const view = mount(PlanRows, { plans: [{ plan, planned: 400, spent: 100 }, { plan: { ...plan, id: 'm', name: 'Mum' }, planned: 200, spent: 300 }], onSpend: item => spent.push(item.id), onArchive: item => archived.push(item.id) });
 assert.match(text(view.tree), new RegExp(`Spending plans2.*25%.*\\${usd(100)} / \\${usd(400)}.*150%.*\\${usd(300)} / \\${usd(200)}`));
 const bars = view.all(node => node.props?.className === 'progress-line');
 assert.deepEqual(bars.map(bar => bar.props['data-over']), [undefined, true]);
 assert.deepEqual(view.all(node => node.props?.style?.width).map(node => node.props.style.width), ['25%', '100%'], 'the bar stops at full');
 view.all(byType('li')).filter(node => node.props.className === 'recurring-row')[0].props.onClick(tap);
 view.all(byType(RowMenu))[1].props.items[0].onSelect();
 assert.deepEqual([spent, archived], [['g'], ['m']]);
 assert.equal(text(mount(PlanRows, { plans: [] }).tree), '');
});

test('the Archived fold lists schedules and plans with Restore, and is absent when nothing is archived', () => {
 const restored = [];
 const plan = { id: 'g', name: 'Groceries', category: 'Groceries', currency: 'USD', amount: 400 };
 const view = mount(ArchivedFold, { records: [rent], plans: [plan], busy: false, onRestore: target => restored.push(target.source) });
 assert.match(text(view.tree), new RegExp(`Archived2Rent · Rent expense · \\${usd(900)}RestoreGroceries · Groceries · \\${usd(400)}Restore`));
 view.all(byType(ui.Button)).forEach(button => button.props.onClick());
 assert.deepEqual(restored, ['record', 'plan']);
 assert.equal(text(mount(ArchivedFold, { records: [], plans: [], busy: false, onRestore() {} }).tree), '');
});

test('archiving changes the sample copies locally and sends signed-in changes before reading again', async () => {
 const sent = [], saved = [];
 const { useArchive } = loadTS('components/workspace/state/use-archive.ts', {
  '@/lib/api-client': { requestJson: async (url, options) => { sent.push([url, options.body]); } },
  '@/lib/feedback': { showSaved: () => saved.push(true) },
 });
 let rows = [rent], plans = [], refreshed = 0;
 const setRows = next => { rows = next(rows); };
 const demo = useArchive({ demo: true, setRows, restoreDemoPlan: plan => plans.push(plan), refreshRecords: () => refreshed++ });
 await demo({ source: 'record', record: rent }, true);
 await demo({ source: 'plan', plan: { id: 'g' } }, true);
 assert.deepEqual([rows[0].archived, plans[0].archived, refreshed, sent.length], [true, true, 0, 0]);
 const live = useArchive({ demo: false, setRows, restoreDemoPlan() {}, refreshRecords: () => refreshed++ });
 await live({ source: 'plan', plan: { id: 'g' } }, false);
 assert.deepEqual(sent, [['/api/planning', { action: 'archive', data: { source: 'plan', id: 'g', archived: false } }]]);
 assert.deepEqual([refreshed, saved.length], [1, 3]);
});
