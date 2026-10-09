import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { language } from './helpers/component-tree.mjs';

const id = n => `54000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const wallet = id(1), bill = id(2), payment = id(3);

// The records route against a database that knows one USD cash account and records each save it is sent.
function recordsRoute() {
 const saves = [];
 const { POST } = loadTS('app/api/records/route.ts', { '@/lib/supabase': { session: async () => ({ token: 'owner', user: { id: 'owner' } }), sameOrigin: () => true, supa: async (path, init = {}) => {
  if (path.includes('/rpc/save_finance_record')) { saves.push(JSON.parse(init.body)); return Response.json([]); }
  if (path.includes('finance_records?select=id,kind,currency')) return Response.json([{ id: wallet, kind: 'Cash', currency: 'USD', account_id: null, date: '2026-01-01' }]);
  return Response.json([]);
 } } });
 const save = body => POST(new Request('https://local/api/records', { method: 'POST', body: JSON.stringify(body) }));
 return { save, saves };
}
const paid = { id: payment, name: 'QA Edit bill', kind: 'Other expense', currency: 'USD', amount: 100, quantity: 1, cost: 0, rate: 0, date: '2026-10-01', frequency: 'Once', notes: '', account_id: wallet, occurrence_record_id: bill };

test('a new payment names its schedule, and editing a saved one never sends a link change (TX-053)', async () => {
 const { save, saves } = recordsRoute();
 assert.equal((await save(paid)).status, 200);
 assert.equal(saves[0].p_record.occurrence_record_id, bill, 'Record payment names the schedule');
 // The edit form used to clear the link; whatever it sends, an update leaves the stored link alone (migration 119
 // refuses a change with "A scheduled payment keeps its schedule.").
 for (const occurrence_record_id of [null, bill, id(9)]) {
  assert.equal((await save({ ...paid, amount: 120, notes: 'QA note', revision: 1, occurrence_record_id })).status, 200);
  const sent = saves.at(-1);
  assert.equal(sent.p_expected_revision, 1);
  assert.equal(sent.p_record.amount, 120);
  assert.ok(!('occurrence_record_id' in sent.p_record), 'an update leaves the schedule link out');
 }
});

test('a saved payment keeps its schedule in the form: no field, no reset, no phantom unsaved change (TX-053, TX-055)', () => {
 let effect = null;
 const changes = [];
 const { ScheduledPaymentField } = loadTS('components/presentation-foundation/scheduled-payment-field.tsx', {
  react: { ...React, useEffect: run => { effect = run; } },
  '@/components/language-provider': language('en'),
 });
 const schedule = { id: bill, name: 'QA Edit bill', kind: 'Other expense', currency: 'USD', amount: 100, frequency: 'Monthly', date: '2026-09-01' };
 // Saved: nothing offered (the expense form offers none once saved) and nothing cleared.
 assert.equal(ScheduledPaymentField({ schedules: [], value: bill, saved: true, onChange: value => changes.push(value) }), null);
 effect();
 assert.deepEqual(changes, []);
 // New: a choice that no longer fits is still cleared, and a fitting one is offered.
 assert.equal(ScheduledPaymentField({ schedules: [], value: bill, onChange: value => changes.push(value) }), null);
 effect();
 assert.deepEqual(changes, [null]);
 assert.notEqual(ScheduledPaymentField({ schedules: [schedule], value: bill, onChange: value => changes.push(value) }), null);
});

test('a late receipt settles the earliest open due date, not the paid one it was received on (CF-043)', () => {
 const { openEarningDue } = loadTS('lib/earning-sources.ts');
 const weekly = { id: id(4), name: 'QA Salary Weekly', kind: 'Salary', currency: 'USD', mode: 'fixed', archived: false, amount: 500, frequency: 'Weekly', recurrence_days: null, start_date: '2026-10-02', end_date: null, linked_record_id: null };
 // 2 Oct open, 9 Oct paid: a receipt on 9 Oct pays 2 Oct (it used to name 9 Oct and be refused as already recorded).
 assert.equal(openEarningDue(weekly, '2026-10-09', new Set(['2026-10-09'])), '2026-10-02');
 // Nothing paid yet: the earlier week first, so no week is left open beside a paid one.
 assert.equal(openEarningDue(weekly, '2026-10-09', new Set()), '2026-10-02');
 // Both paid: the period it was received in, which the database then reports as already recorded.
 assert.equal(openEarningDue(weekly, '2026-10-09', new Set(['2026-10-02', '2026-10-09'])), '2026-10-09');
 // Never a date after the receipt.
 assert.equal(openEarningDue(weekly, '2026-10-05', new Set(['2026-10-02'])), '2026-10-02');
 // Nothing open this month yet: last month's open date.
 const monthly = { ...weekly, frequency: 'Monthly', start_date: '2026-08-25' };
 assert.equal(openEarningDue(monthly, '2026-10-03', new Set(['2026-08-25'])), '2026-09-25');
 assert.equal(openEarningDue(monthly, '2026-10-03', new Set(['2026-08-25', '2026-09-25'])), '2026-10-25', 'all paid: this month\'s date, as before');
 // Variable income has no due date.
 assert.equal(openEarningDue({ ...weekly, mode: 'variable' }, '2026-10-09', new Set()), null);
});
