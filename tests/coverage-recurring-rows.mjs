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

test('Delete sits last in a schedule\'s and a plan\'s menu, marked destructive, only where deleting is offered', () => {
 const calls = [];
 const view = mount(OccurrenceRow, { item: item('paid', { recorded: 900 }), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {}, onArchive: () => calls.push('archive'), onDelete: target => calls.push(target.source + ' ' + target.record.id) });
 const items = view.find(byType(RowMenu)).props.items;
 assert.deepEqual(items.map(entry => [entry.label, !!entry.destructive]), [['Archive', false], ['Delete', true]]);
 items[1].onSelect();
 const busy = mount(OccurrenceRow, { item: item('due'), dated: false, today: '2026-10-05', busy: true, onPay() {}, onSkip() {}, onDelete() {} });
 assert.equal(busy.find(byType(RowMenu)).props.items.at(-1).disabled, true, 'not while something is saving');
 const plan = { id: 'g', name: 'Groceries', category: 'Groceries', currency: 'USD', amount: 400 };
 const plans = mount(PlanRows, { plans: [{ plan, planned: 400, spent: 0 }], onDelete: target => calls.push(target.source + ' ' + target.plan.id) });
 const planItems = plans.find(byType(RowMenu)).props.items;
 assert.deepEqual(planItems.map(entry => entry.label), ['Delete'], 'Delete alone when archiving is not offered');
 planItems[0].onSelect();
 assert.deepEqual(calls, ['record rent', 'plan g']);
 assert.equal(mount(PlanRows, { plans: [{ plan, planned: 400, spent: 0 }] }).all(byType(RowMenu)).length, 0, 'a read-only list has no menu');
});

test('the delete dialog asks about history only when payments were recorded, and stays open on a refusal', async () => {
 const h = React.createElement, named = (name, render) => Object.assign(render, { displayName: name });
 const alert = {
  AlertDialog: named('AlertDialog', ({ open, children }) => open ? h('section', null, children) : null),
  AlertDialogContent: named('AlertDialogContent', ({ children }) => h('div', null, children)),
  AlertDialogTitle: named('AlertDialogTitle', ({ children }) => h('h2', null, children)),
  AlertDialogDescription: named('AlertDialogDescription', ({ children }) => h('p', null, children)),
  AlertDialogFooter: named('AlertDialogFooter', ({ children }) => h('footer', null, children)),
  AlertDialogCancel: named('AlertDialogCancel', ({ children, disabled }) => h('button', { disabled, 'data-cancel': true }, children)),
  AlertDialogAction: named('AlertDialogAction', ({ children, disabled, onClick, className, variant }) => h('button', { disabled, onClick, className, 'data-variant': variant }, children)),
 };
 const { DeleteScheduleDialog } = r.load('components/planning/delete-schedule-dialog.tsx', { ...ui.modules, '@/components/ui/alert-dialog': alert });
 const choices = [], closed = [];
 let refuse = false;
 const props = history => ({ target: { source: 'record', record: rent }, history, onClose: () => closed.push(true), onDelete: async removeHistory => { if (refuse) throw Error('Only repeating income and expenses are deleted here.'); choices.push(removeHistory); } });
 const actions = () => r.all(node => node.type === 'button' && !node.props['data-cancel']);
 const press = label => r.fireAsync(actions().find(node => text(node) === label), 'onClick', { preventDefault() {} });

 mount(DeleteScheduleDialog, props(0));
 assert.match(text(r.tree), /Delete Rent\?It moves to Recently deleted, where you can restore it\./);
 assert.deepEqual(actions().map(text), ['Delete']);
 await press('Delete');
 assert.deepEqual([choices, closed.length], [[false], 1], 'nothing recorded: the schedule alone goes');

 mount(DeleteScheduleDialog, props(3));
 assert.match(text(r.tree), /Payments recorded for it: 3\. Keep them in your history, or delete them too\?/);
 assert.deepEqual(actions().map(node => [text(node), node.props['data-variant']]), [['Delete, keep history', 'outline'], ['Delete with history', 'default']]);
 assert.match(actions()[1].props.className, /destructive/);
 await press('Delete, keep history');
 await press('Delete with history');
 assert.deepEqual(choices, [false, false, true]);

 refuse = true;
 mount(DeleteScheduleDialog, props(1));
 const before = closed.length;
 await press('Delete with history');
 assert.equal(closed.length, before, 'a refusal keeps the dialog open to retry');
 assert.equal(r.find(byType(ui.ErrorPopup)).props.message, 'Only repeating income and expenses are deleted here.');
 mount(DeleteScheduleDialog, { ...props(1), target: null });
 assert.equal(text(r.tree), '', 'closed without a target');
 // The page's hook opens the question for the tapped schedule and counts its payments from the loaded data.
 const { useScheduleDeletion } = r.load('components/planning/delete-schedule-dialog.tsx', { ...ui.modules, '@/components/ui/alert-dialog': alert });
 const data = { records: [rent, { id: 'p2', occurrence_record_id: 'rent' }], occurrences: [{ id: 'o1', record_id: 'rent', due_on: '2026-09-01', status: 'paid', transaction_id: 'p1' }] };
 const deleted = [];
 let deletion;
 const Page = ({ onDelete }) => { deletion = useScheduleDeletion(data, onDelete); return h('main', null, deletion.dialog); };
 mount(Page, { onDelete: async (target, removeHistory) => { deleted.push([target.record.id, removeHistory]); } });
 assert.equal(text(r.tree), '', 'nothing asked until a row is chosen');
 deletion.open({ source: 'record', record: rent }); r.update();
 assert.match(text(r.tree), /Payments recorded for it: 2\./);
 await press('Delete with history');
 assert.deepEqual([deleted, text(r.tree)], [[['rent', true]], ''], 'the dialog closes after deleting');
 mount(Page, {});
 assert.deepEqual([deletion.open, deletion.dialog], [undefined, undefined], 'a read-only page offers no Delete');
});

test('deleting a schedule changes the sample copies, reversing deleted payments, and sends signed-in deletes before reading again', async () => {
 const sent = [], saved = [];
 const { useDeleteSchedule: deleteScheduleWith } = loadTS('components/workspace/state/use-archive.ts', {
  '@/lib/api-client': { requestJson: async (url, options) => { sent.push([url, options.body]); } },
  '@/lib/feedback': { showSaved: () => saved.push(true) },
 });
 const cash = { id: 'cash', name: 'Cash', kind: 'Cash', currency: 'USD', amount: 1000, frequency: 'Once', date: '2026-01-01' };
 const paid = { id: 'p1', name: 'Rent', kind: 'Rent expense', currency: 'USD', amount: 900, frequency: 'Once', date: '2026-10-01', account_id: 'cash' };
 const extra = { ...paid, id: 'p2', amount: 50, occurrence_record_id: 'rent', occurrence_due_on: '2026-10-01' };
 const food = { ...paid, id: 'f1', name: 'Food', kind: 'Living expense', amount: 100, account_id: null, expense_plan_id: 'g' };
 const occurrences = [{ id: 'o1', record_id: 'rent', due_on: '2026-10-01', status: 'paid', transaction_id: 'p1' }];
 const run = async (target, removeHistory) => {
  let rows = [cash, rent, paid, extra, food];
  const binned = [], dropped = [];
  const remove = deleteScheduleWith({ demo: true, rows, setRows: next => { rows = next; }, occurrences, bin: { binRecord: row => binned.push(row.id), binPlan: plan => binned.push('plan ' + plan.id) }, dropDemoPlan: id => dropped.push(id), refreshRecords() { throw Error('no reads in the sample'); } });
  await remove(target, removeHistory);
  return { ids: rows.map(row => row.id), cash: rows.find(row => row.id === 'cash').amount, food: rows.find(row => row.id === 'f1'), binned, dropped };
 };
 const kept = await run({ source: 'record', record: rent }, false);
 assert.deepEqual([kept.ids, kept.binned], [['cash', 'p1', 'p2', 'f1'], ['rent']], 'payments stay');
 const removed = await run({ source: 'record', record: rent }, true);
 assert.deepEqual([removed.ids, removed.binned], [['cash', 'f1'], ['p1', 'p2', 'rent']]);
 assert.equal(removed.cash, kept.cash + 950, 'both payments are reversed');
 const plan = { id: 'g', name: 'Food', category: 'Groceries', currency: 'USD', amount: 400 };
 const unlinked = await run({ source: 'plan', plan }, false);
 assert.deepEqual([unlinked.food.expense_plan_id, unlinked.binned, unlinked.dropped], [null, ['plan g'], ['g']]);
 assert.equal((await run({ source: 'plan', plan }, true)).food, undefined);

 let refreshed = 0;
 const live = deleteScheduleWith({ demo: false, rows: [], setRows() { throw Error('signed in, the server decides'); }, occurrences: [], bin: {}, dropDemoPlan() {}, refreshRecords: () => refreshed++ });
 await live({ source: 'record', record: rent }, true);
 await live({ source: 'plan', plan }, false);
 assert.deepEqual(sent, [['/api/planning', { action: 'delete_schedule', data: { source: 'record', id: 'rent', remove_history: true } }], ['/api/planning', { action: 'delete_schedule', data: { source: 'plan', id: 'g', remove_history: false } }]]);
 assert.deepEqual([refreshed, saved.length], [2, 6]);
});

test('an overdue row due yesterday says Yesterday, never "1 days ago"', () => {
 const props = { dated: true, busy: false, onPay() {}, onSkip() {} };
 assert.match(text(mount(OccurrenceRow, { ...props, item: item('overdue'), today: '2026-10-02' }).tree), /Yesterday/);
 assert.doesNotMatch(text(mount(OccurrenceRow, { ...props, item: item('overdue'), today: '2026-10-02' }).tree), /1 days ago/);
 assert.match(text(mount(OccurrenceRow, { ...props, item: item('overdue'), today: '2026-10-05' }).tree), /4 days ago/);
});
