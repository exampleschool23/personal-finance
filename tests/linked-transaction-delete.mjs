import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, hostModule, language, stubs } from './helpers/component-tree.mjs';

const id = n => `55000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fee = { id: id(1), name: 'Transaction fee', kind: 'Other expense', currency: 'USD', amount: 2, quantity: 1, cost: 0, rate: 0, date: '2026-10-06', frequency: 'Once', notes: '', account_id: id(9), movement_id: id(2) };
const plain = { ...fee, id: id(3), name: 'QA lunch', movement_id: null };

test('a transaction written by a transfer, operation, mortgage payment or tracker update is linked', () => {
 const { isLinkedTransaction } = loadTS('lib/linked-transactions.ts');
 for (const link of ['movement_id', 'operation_id', 'mortgage_payment_id', 'history_event_id']) assert.equal(isLinkedTransaction({ [link]: id(5) }), true, link);
 assert.equal(isLinkedTransaction(plain), false);
});

test('deleting a linked transaction undoes its whole action into Recently deleted; a plain one moves there alone', async () => {
 const calls = [];
 const { DELETE } = loadTS('app/api/records/route.ts', { '@/lib/supabase': { session: async () => ({ token: 'owner', user: { id: 'owner' } }), sameOrigin: () => true, supa: async (path, init = {}) => { calls.push({ path, body: JSON.parse(init.body) }); return Response.json(null); } } });
 const remove = body => DELETE(new Request('https://local/api/records', { method: 'DELETE', body: JSON.stringify(body) }));
 assert.equal((await remove({ id: fee.id, linked: true })).status, 200);
 assert.deepEqual(calls.at(-1), { path: '/rest/v1/rpc/delete_linked_transaction', body: { p_id: fee.id } });
 assert.equal((await remove({ id: plain.id })).status, 200);
 assert.deepEqual(calls.at(-1), { path: '/rest/v1/rpc/move_item_to_deleted', body: { p_id: plain.id, p_source: 'finance_records' } });
 // Only a literal true asks for the linked delete.
 await remove({ id: plain.id, linked: 'yes' });
 assert.equal(calls.at(-1).path, '/rest/v1/rpc/move_item_to_deleted');
 assert.equal((await remove({ id: 'not-an-id', linked: true })).status, 400);
});

test('the details of a linked transaction offer Delete but not Edit; a plain one offers both', () => {
 const r = createRenderer();
 const ui = stubs();
 const { TransactionDetailsDialog } = r.load('components/transaction-details-dialog.tsx', {
  ...ui.modules, '@/components/language-provider': language('en'), 'lucide-react': hostModule(),
  ...Object.fromEntries(['delete-button', 'category-icon', 'category-badge', 'person-avatar', 'business-mark'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
 });
 const actions = record => {
  r.mount(React.createElement(TransactionDetailsDialog, { record, incoming: false, businesses: [], onBusiness() {}, tagging: { tags: [], tagIds: [], onTags: async () => {} }, accountName: 'QA Wallet', attachments: null, editable: !record.movement_id, onEdit() {}, onDelete() {}, onClose() {} }));
  const deletes = r.all(node => node.type === 'DeleteButton').length;
  const edits = r.all(node => node.props?.['aria-label'] === 'Edit ' + record.name).length;
  return { deletes, edits };
 };
 assert.deepEqual(actions(fee), { deletes: 1, edits: 0 });
 assert.deepEqual(actions(plain), { deletes: 1, edits: 1 });
});

test('the mortgage payment dialog says a saved payment is undone from Transactions, not that it cannot be deleted (LOAN-029)', async () => {
 const fs = await import('node:fs');
 const dialog = fs.readFileSync('components/mortgage-payment-dialog.tsx', 'utf8');
 assert.match(dialog, /To undo a payment, delete it from Transactions; you can restore it from Recently deleted\./);
 assert.doesNotMatch(dialog, /Saved payments cannot be edited or deleted/);
});
