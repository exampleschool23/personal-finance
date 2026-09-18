import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTS } from './helpers/load-ts.mjs';

const goal = (kind = 'savings', extra = {}) => ({ id: kind, name: `${kind} goal`, kind, currency: 'USD', account_id: 'cash', target: 10000, allocated: 0, archived: false, ...extra });
const props = goals => ({ data: { goals, records: [], categories: [], occurrences: [], activity: [] }, currency: 'USD', surplus: 10632, today: '2026-09-18', owner: 'owner', demo: false, revision: 0, onSaved() {} });
const language = { useLanguage: () => ({ locale: 'en-US', t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? key) }) };
function setup(resource = {}, extra = {}) {
 const calls = [];
 const component = loadTS('components/planning/goal-funding-panel.tsx', {
  '@/components/language-provider': language,
  '@/components/discard-changes': { useUnsavedNavigation: () => null },
  '@/hooks/use-owner-resource': { useOwnerResource: (...args) => { calls.push(args); return { data: { events: [] }, loading: false, error: '', retry() {}, invalidate() {}, ...resource }; }, saveOwnerResource: async () => ({}), ...extra.resource },
  ...extra.overrides,
 }).GoalFundingPanel;
 return { component, calls, render: goals => renderToStaticMarkup(React.createElement(component, props(goals))) };
}

test('investment and net-worth goals show named funding cards without requesting or showing cash activity', () => {
 const { render, calls } = setup();
 const html = render([goal('investment'), goal('net_worth')]);
 assert.equal(calls[0][2], false);
 assert.doesNotMatch(html, /Cash goal activity|Goal behavior|goal-activity-form/);
 assert.equal((html.match(/class="goal-funding-editor"/g) ?? []).length, 2);
 assert.match(html, /Save funding for investment goal/);
 assert.match(html, /Monthly funding budget \(USD\)/);
 assert.match(html, /No goals are scheduled for funding/);
 assert.doesNotMatch(html, /<ul/);
 assert.match(html, /<details class="goal-funding-advanced"><summary>/);
 assert.match(html, /<label class="goal-funding-enable" for="([^"]+)"><button[^>]*id="\1"/);
});

test('cash goals explain empty activity and suppress zero-value migration openings', () => {
 const { render, calls } = setup({ data: { events: [{ id: 'zero', event_type: 'opening', delta: '0' }] } });
 const html = render([goal()]);
 assert.equal(calls[0][2], true);
 assert.match(html, /No cash goal activity yet/);
 assert.match(html, /Cash contributions, withdrawals and transfers will appear here when recorded/);
 assert.match(html, /aria-expanded="false"/);
 assert.match(html, /hidden=""/);
 assert.match(html, /Goal behavior/);
 assert.doesNotMatch(html, /<ul/);
});

test('activity loading and failure states do not misrepresent unavailable history as empty', () => {
 const loading = setup({ loading: true }).render([goal()]);
 assert.match(loading, /Loading goal activity…/);
 assert.doesNotMatch(loading, /No cash goal activity yet/);
 const error = setup({ error: 'Internal error details' }).render([goal()]);
 assert.match(error, /role="alert"/);
 assert.match(error, /Goal activity could not be loaded/);
 assert.match(error, />Retry<\/button>/);
 assert.doesNotMatch(error, /No cash goal activity yet|Internal error details/);
});

test('archived cash goals retain dated history without offering new activity or funding', () => {
 const html = setup({ data: { events: [{ id: 'event', goal_id: 'savings', event_type: 'contribution', delta: 125.37, occurred_on: '2026-09-18', notes: 'Extra savings' }] } }).render([goal('savings', { archived: true })]);
 assert.match(html, /18 September 2026/);
 assert.match(html, /\$125/);
 assert.match(html, /Extra savings/);
 assert.doesNotMatch(html, /Record goal activity|Shared goal funding|No cash goal activity yet/);
 assert.equal(setup().render([]), '');
 assert.equal(setup().render([goal('investment', { archived: true })]), '');
});

test('linked income choices exclude other accounts, currencies, recurring records and future income', () => {
 const { component } = setup();
 const input = props([goal()]);
 const record = { id: 'valid', name: 'Received salary', kind: 'Salary', amount: 500, currency: 'USD', frequency: 'Once', date: '2026-09-17', account_id: 'cash' };
 input.data.records = [record, { ...record, id: 'other', name: 'Other account', account_id: 'other' }, { ...record, id: 'fx', name: 'Foreign currency', currency: 'EUR' }, { ...record, id: 'future', name: 'Future income', date: '2026-09-19' }, { ...record, id: 'repeat', name: 'Recurring salary', frequency: 'Monthly' }];
 const html = renderToStaticMarkup(React.createElement(component, input));
 assert.match(html, /Received salary/);
 assert.doesNotMatch(html, /Other account|Foreign currency|Future income|Recurring salary/);
});

test('funding drafts reset, preserve precision, and remain dirty on save failure', async () => {
 const slots = []; let cursor = 0, fail = true; const saved = [];
 const hooks = { ...React, useId: () => 'test', useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; } };
 const { component } = setup({}, { overrides: { react: hooks } });
 const visit = (node, predicate) => { if (!node || typeof node !== 'object') return null; if (predicate(node)) return node; return React.Children.toArray(node.props?.children).map(child => visit(child, predicate)).find(Boolean); };
 const panel = component(props([goal()]));
 const editor = visit(panel, node => node.type?.name === 'FundingEditor');
 slots.length = 0;
 const render = () => { cursor = 0; return editor.type({ ...editor.props, save: async (action, draft) => { if (fail) throw Error('Offline'); saved.push({ action, draft }); } }); };
 let tree = render();
 const monthly = () => visit(tree, node => node.props?.onValueChange && node.props.max === undefined);
 const button = text => visit(tree, node => node.props?.children === text);
 monthly().props.onValueChange(123.456); tree = render();
 assert.equal(monthly().props.value, 123.456);
 assert.ok(button('Reset changes'));
 await tree.props.onSubmit({ preventDefault() {} }); tree = render();
 assert.ok(button('Reset changes')); assert.equal(saved.length, 0);
 button('Reset changes').props.onClick(); tree = render();
 assert.equal(monthly().props.value, 0); assert.equal(button('Reset changes'), undefined);
 monthly().props.onValueChange(123.456); tree = render(); fail = false;
 await tree.props.onSubmit({ preventDefault() {} }); tree = render();
 assert.equal(saved[0].action, 'funding'); assert.equal(saved[0].draft.monthly, 123.456);
 assert.equal(button('Reset changes'), undefined);
});

test('responsive rules keep fieldsets full-width and exclude checkboxes from button height overrides', () => {
 const css = fs.readFileSync('app/globals.css', 'utf8');
 assert.match(css, /button:not\(\[role="checkbox"\]\)/);
 assert.doesNotMatch(css, /\.tools-panel[^{}]*fieldset\s*\{[^}]*max-width:120px/);
 assert.match(css, /@container\(min-width:740px\)\{\.goal-funding-editors\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css, /\.goal-funding-fields\{grid-template-columns:minmax\(0,1fr\)\}/);
});
