import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const h = React.createElement;
const ui = stubs();
const record = { id: 'home', name: 'Home', kind: 'Mortgage', currency: 'USD', amount: 86531, date: '2032-05-05', opened_on: null, revision: 2 };
const edits = [
 { id: 'e2', changed_at: '2026-10-08T12:30:00Z', before_record: { ...record, opened_on: null, amount: 88000 }, after_record: { ...record, opened_on: '2022-05-17' } },
 { id: 'e1', changed_at: '2026-10-01T09:00:00Z', before_record: record, after_record: { ...record, revision: 1 } },
];
function mount(data, hasMore = false) {
 const r = createRenderer(), requests = [];
 const resource = (url, key, enabled) => { requests.push({ url, enabled }); return { data: { items: data, hasMore }, loading: false, error: '', retry() {} }; };
 const Pagination = Object.assign(({ page, hasNext, summary }) => page <= 1 && !hasNext ? null : h('nav', null, summary), { displayName: 'Pagination' });
 const { RecordEditHistory } = r.load('components/record-edit-history.tsx', { ...ui.modules, '@/hooks/use-owner-resource': { useOwnerResource: resource }, '@/components/presentation-foundation/pagination': { Pagination }, '@/components/presentation-foundation/resource-state': { ResourceState: ({ children }) => children } });
 r.mount(h(RecordEditHistory, { record }));
 return { r, requests };
}

test('Change history stays closed and unread until opened, then lists each change from → to, newest first', () => {
 const { r, requests } = mount(edits);
 const details = r.find(byType('details'));
 assert.equal(details.type, 'details');
 assert.equal(text(details.children[0]), 'Change history');
 assert.equal(requests.at(-1).enabled, false, 'nothing is read while closed');
 details.props.onToggle({ currentTarget: { open: true } }); r.update();
 const shown = text(r.tree);
 assert.ok(requests.at(-1).enabled);
 assert.match(shown, /8 October 2026 17:30.*Amount\$88,000→\$86,531Start date—→17 May 2022.*1 October 2026 14:00Record details updated/);
 assert.doesNotMatch(shown, /Page 1/, 'one page has no pager');
});

test('Change history pages when there are more changes, and says when there are none', () => {
 const more = mount(edits, true);
 more.r.find(byType('details')).props.onToggle({ currentTarget: { open: true } }); more.r.update();
 assert.match(text(more.r.tree), /Page 1/);
 const none = mount([]);
 none.r.find(byType('details')).props.onToggle({ currentTarget: { open: true } }); none.r.update();
 assert.match(text(none.r.tree), /No changes yet\./);
});
