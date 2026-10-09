import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, event, stubs, text } from './helpers/component-tree.mjs';

const r = createRenderer(), ui = stubs();
const closes = [];
const { StopScheduleDialog } = r.load('components/stop-schedule-dialog.tsx', {
 ...ui.modules,
 '@/components/discard-changes': { useDiscardChanges: (dirty, onClose, busy) => ({ close: () => closes.push([dirty, busy]), confirmation: null }) },
 '@/lib/deposit-interest': { depositToday: () => '2026-10-09' },
});
const mount = props => (r.mount(React.createElement(StopScheduleDialog, props)), r);
const button = () => r.find(byType(ui.Button));

test('stopping a schedule picks its last active date, never before it started, and stays open on a refusal', async () => {
 const saved = [], closed = [];
 mount({ name: 'Gym', start: '2026-01-01', onSave: async date => { saved.push(date); }, onClose: () => closed.push(true) });
 assert.match(text(r.tree), /Stop Gym/);
 assert.deepEqual([r.find(byType(ui.DatePicker)).props.value, r.find(byType(ui.DatePicker)).props.min], ['2026-10-09', '2026-01-01'], 'today by default');
 r.fire(r.find(byType(ui.DatePicker)), 'onChange', '2026-11-30');
 assert.equal(button().props.disabled, false);
 await r.fireAsync(r.find(byType('form')), 'onSubmit', event());
 assert.deepEqual([saved, closed], [['2026-11-30'], [true]]);
 // A schedule that starts later opens on its start date.
 mount({ name: 'Rent', start: '2027-02-01', onSave: async () => { throw Error('Check the end date.'); }, onClose: () => closed.push(true) });
 assert.equal(r.find(byType(ui.DatePicker)).props.value, '2027-02-01');
 await r.fireAsync(r.find(byType('form')), 'onSubmit', event());
 assert.equal(closed.length, 1, 'a refusal keeps it open');
 assert.equal(r.find(byType(ui.ErrorPopup)).props.message, 'Check the end date.');
 // Cancel asks through the discard guard, which knows whether the date changed.
 r.fire(r.find(byType(ui.FormFooter)), 'onCancel');
 assert.deepEqual(closes.at(-1), [false, false]);
});
