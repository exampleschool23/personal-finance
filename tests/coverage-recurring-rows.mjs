import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const { formatMoney } = loadTS('lib/format.ts');
const r = createRenderer();
const ui = stubs();
const RowMenu = Object.assign(({ items }) => React.createElement('menu', null, items.map(item => React.createElement('li', { key: item.label }, item.label))), { displayName: 'RowMenu' });
const { OccurrenceRow, ArchivedFold } = r.load('components/planning/recurring-rows.tsx', { ...ui.modules, '@/components/presentation-foundation/row-menu': { RowMenu } });
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
 assert.match(text(mount(OccurrenceRow, { item: item('paid', { recorded: null }), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {} }).tree), /Paid · Exchange rate unavailable\./, 'a payment that could not be converted shows no figure');
});

test('the Archived fold lists schedules with Restore, and is absent when nothing is archived', () => {
 const restored = [];
 const view = mount(ArchivedFold, { records: [rent], busy: false, onRestore: target => restored.push(target.source) });
 assert.match(text(view.tree), new RegExp(`Archived1Rent · Rent expense · \\${usd(900)}Restore`));
 view.all(byType(ui.Button)).forEach(button => button.props.onClick());
 assert.deepEqual(restored, ['record']);
 assert.equal(text(mount(ArchivedFold, { records: [], busy: false, onRestore() {} }).tree), '');
});

test('archiving changes the sample copies locally and sends signed-in changes before reading again', async () => {
 const sent = [], saved = [];
 const { useArchive } = loadTS('components/workspace/state/use-archive.ts', {
  '@/lib/api-client': { requestJson: async (url, options) => { sent.push([url, options.body]); } },
  '@/lib/feedback': { showSaved: () => saved.push(true) },
 });
 let rows = [rent], refreshed = 0;
 const setRows = next => { rows = next(rows); };
 const demo = useArchive({ demo: true, setRows, refreshRecords: () => refreshed++ });
 await demo({ source: 'record', record: rent }, true);
 assert.deepEqual([rows[0].archived, refreshed, sent.length], [true, 0, 0]);
 const live = useArchive({ demo: false, setRows, refreshRecords: () => refreshed++ });
 await live({ source: 'record', record: rent }, false);
 assert.deepEqual(sent, [['/api/planning', { action: 'archive', data: { source: 'record', id: 'rent', archived: false } }]]);
 assert.deepEqual([refreshed, saved.length], [1, 2]);
});

test('Delete sits last in a schedule\'s menu, marked as a delete (the bin), only where deleting is offered', () => {
 const calls = [];
 const view = mount(OccurrenceRow, { item: item('paid', { recorded: 900 }), dated: false, today: '2026-10-05', busy: false, onPay() {}, onSkip() {}, onArchive: () => calls.push('archive'), onDelete: target => calls.push(target.source + ' ' + target.record.id) });
 const items = view.find(byType(RowMenu)).props.items;
 assert.deepEqual(items.map(entry => [entry.label, !!entry.deletes]), [['Archive', false], ['Delete', true]]);
 items[1].onSelect();
 const busy = mount(OccurrenceRow, { item: item('due'), dated: false, today: '2026-10-05', busy: true, onPay() {}, onSkip() {}, onDelete() {} });
 assert.equal(busy.find(byType(RowMenu)).props.items.at(-1).disabled, true, 'not while something is saving');
 assert.deepEqual(calls, ['record rent']);
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
 assert.deepEqual(actions().map(node => [text(node), node.props['data-variant']]), [['Delete, keep history', 'outline'], ['Delete with history', 'destructive']], 'red through the Button variant: a class on the action loses to bg-primary (COMP-039)');
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
 const food = { ...paid, id: 'f1', name: 'Food', kind: 'Living expense', amount: 100, account_id: null };
 const occurrences = [{ id: 'o1', record_id: 'rent', due_on: '2026-10-01', status: 'paid', transaction_id: 'p1' }];
 const run = async (target, removeHistory) => {
  let rows = [cash, rent, paid, extra, food];
  const binned = [];
  const remove = deleteScheduleWith({ demo: true, rows, setRows: next => { rows = next; }, occurrences, bin: { binRecord: row => binned.push(row.id) }, refreshRecords() { throw Error('no reads in the sample'); } });
  await remove(target, removeHistory);
  return { ids: rows.map(row => row.id), cash: rows.find(row => row.id === 'cash').amount, binned };
 };
 const kept = await run({ source: 'record', record: rent }, false);
 assert.deepEqual([kept.ids, kept.binned], [['cash', 'p1', 'p2', 'f1'], ['rent']], 'payments stay');
 const removed = await run({ source: 'record', record: rent }, true);
 assert.deepEqual([removed.ids, removed.binned], [['cash', 'f1'], ['p1', 'p2', 'rent']]);
 assert.equal(removed.cash, kept.cash + 950, 'both payments are reversed');

 let refreshed = 0;
 const live = deleteScheduleWith({ demo: false, rows: [], setRows() { throw Error('signed in, the server decides'); }, occurrences: [], bin: {}, refreshRecords: () => refreshed++ });
 await live({ source: 'record', record: rent }, true);
 assert.deepEqual(sent, [['/api/planning', { action: 'delete_schedule', data: { source: 'record', id: 'rent', remove_history: true } }]]);
 assert.deepEqual([refreshed, saved.length], [1, 3]);
});

test('an overdue row due yesterday says Yesterday, never "1 days ago"', () => {
 const props = { dated: true, busy: false, onPay() {}, onSkip() {} };
 assert.match(text(mount(OccurrenceRow, { ...props, item: item('overdue'), today: '2026-10-02' }).tree), /Yesterday/);
 assert.doesNotMatch(text(mount(OccurrenceRow, { ...props, item: item('overdue'), today: '2026-10-02' }).tree), /1 days ago/);
 assert.match(text(mount(OccurrenceRow, { ...props, item: item('overdue'), today: '2026-10-05' }).tree), /4 days ago/);
});

test('with a details view, tapping a row opens it and Edit moves into the ⋯ menu, a loan payment\'s too', () => {
 const calls = [];
 const props = { dated: false, today: '2026-10-05', busy: false, onEdit: record => calls.push('edit ' + record.id), onOpen: entry => calls.push('open ' + entry.key), onPay() {}, onSkip() {}, onArchive() {} };
 const view = mount(OccurrenceRow, { ...props, item: item('overdue') });
 assert.deepEqual(view.find(byType(RowMenu)).props.items.map(entry => entry.label), ['Edit', 'Skip this occurrence', 'Archive']);
 view.find(byType('li')).props.onClick(tap);
 view.find(byType(RowMenu)).props.items[0].onSelect();
 assert.deepEqual(calls, ['open rent:2026-10-01', 'edit rent']);
 assert.deepEqual(mount(OccurrenceRow, { ...props, item: item('due', { installment: true }) }).find(byType(RowMenu)).props.items.map(entry => entry.label), ['Edit']);
});

test('a skipped occurrence is restored from its own ⋯ menu', () => {
 const calls = [];
 const view = mount(OccurrenceRow, { item: item('skipped'), dated: true, today: '2026-10-05', busy: false, onPay() {}, onSkip: () => calls.push('skip'), onRestore: entry => calls.push('restore ' + entry.date), onArchive() {} });
 const menu = view.find(byType(RowMenu)).props.items;
 assert.deepEqual(menu.map(entry => entry.label), ['Restore occurrence', 'Archive']);
 menu[0].onSelect();
 assert.deepEqual(calls, ['restore 2026-10-01']);
});
