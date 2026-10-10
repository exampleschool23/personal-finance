import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer } from './helpers/component-tree.mjs';

const { removedCategories, offeredKinds, canRemoveCategory, offeredChoice } = loadTS('lib/removed-categories.ts');
const custom = [{ id: 'c1', name: 'Food', direction: 'expense' }];

test('deleted built-in categories are read from the shared preference and are no longer offered', () => {
 assert.deepEqual(removedCategories([]), []);
 assert.deepEqual(removedCategories([{ key: 'removed_categories', data: { kinds: ['Rent expense'] } }]), ['Rent expense']);
 assert.deepEqual(offeredKinds('expense', ['Rent expense']), ['Living expense', 'Charity', 'Other expense']);
 assert.deepEqual(offeredKinds('expense', ['Rent expense'], 'Rent expense'), ['Rent expense', 'Living expense', 'Charity', 'Other expense'], 'a saved record keeps showing its own category');
 assert.deepEqual(offeredKinds('income', []), ['Salary', 'Rent income', 'Business income', 'Other income']);
 const { workspacePreferenceSchema } = loadTS('lib/workspace-preferences.ts');
 assert.ok(workspacePreferenceSchema.safeParse({ key: 'removed_categories', data: { kinds: ['Salary', 'Charity'] } }).success);
 assert.equal(workspacePreferenceSchema.safeParse({ key: 'removed_categories', data: { kinds: ['Groceries'] } }).success, false, 'only built-in kinds');
 assert.equal(workspacePreferenceSchema.safeParse({ key: 'removed_categories', data: { kinds: ['Salary', 'Salary'] } }).success, false);
});

test('one category of each direction always stays, and new records start in one that is still offered', () => {
 const expenses = ['Rent expense', 'Living expense', 'Charity'];
 assert.equal(canRemoveCategory('Other expense', 'expense', [], expenses), false);
 assert.equal(canRemoveCategory('Other expense', 'expense', custom, expenses), true);
 assert.equal(canRemoveCategory('c1', 'expense', custom, [...expenses, 'Other expense']), false, 'the last added category stays too');
 assert.equal(canRemoveCategory('Salary', 'income', custom, []), true);
 assert.deepEqual(offeredChoice('Other expense', custom, []), { kind: 'Other expense', custom_category_id: null });
 assert.deepEqual(offeredChoice('Other expense', custom, ['Other expense']), { kind: 'Rent expense', custom_category_id: null });
 assert.deepEqual(offeredChoice('Other expense', custom, [...expenses, 'Other expense']), { kind: 'Other expense', custom_category_id: 'c1' });
 assert.deepEqual(offeredChoice('Cash', custom, ['Other expense']), { kind: 'Cash', custom_category_id: null }, 'other kinds are untouched');
});

test('pickers, the budget and the bot leave deleted categories out', () => {
 const { categoryChoices } = loadTS('lib/transaction-rules.ts');
 assert.deepEqual(categoryChoices(custom, 'expense', ['Rent expense', 'Charity']).map(choice => choice.category_id ?? choice.kind), ['Living expense', 'Other expense', 'c1']);
 const { budgetCategories } = loadTS('lib/budget.ts');
 assert.deepEqual(budgetCategories(custom, [], ['Salary', 'Rent expense']).map(category => category.key), ['Rent income', 'Business income', 'Other income', 'Living expense', 'Charity', 'Other expense', 'c1']);
 const { guessCategory } = loadTS('lib/telegram-entry.ts');
 assert.equal(guessCategory({ name: 'rent', amount: 500 }, { records: [], categories: custom }).kind, 'Rent expense');
 assert.notEqual(guessCategory({ name: 'rent', amount: 500 }, { records: [], categories: custom, removed: ['Rent expense'] }).kind, 'Rent expense', 'a deleted category is never guessed');
 assert.deepEqual(guessCategory({ name: 'xyz', amount: 5 }, { records: [], categories: custom, removed: ['Rent expense', 'Living expense', 'Charity', 'Other expense'] }), { direction: 'expense', kind: 'Other expense', custom_category_id: 'c1', source: 'default' });
});

test('a deletion shows at once; the sample workspace hides a category for the visit', () => {
 const r = createRenderer();
 const { useRemovedCategories } = r.load('hooks/use-removed-categories.ts');
 let controller;
 const preferences = { data: { preferences: [{ key: 'removed_categories', data: { kinds: ['Rent expense'] } }] }, initialLoading: false, error: '', save: async () => {} };
 const Host = props => { controller = useRemovedCategories(preferences, props.owner, props.demo); return null; };
 r.mount(React.createElement(Host, { owner: 'me', demo: false }));
 assert.deepEqual(controller.kinds, ['Rent expense']);
 assert.equal('restore' in controller, false, 'deleted categories are never offered back');
 controller.deleted('Salary'); r.update();
 assert.deepEqual(controller.kinds, ['Rent expense', 'Salary'], 'a saved deletion shows at once');
 const demo = createRenderer();
 const { useRemovedCategories: useDemo } = demo.load('hooks/use-removed-categories.ts');
 const DemoHost = () => { controller = useDemo({ data: { preferences: [] }, initialLoading: false, error: '', save: async () => { throw Error('no'); } }, null, true); return null; };
 demo.mount(React.createElement(DemoHost));
 controller.hideForVisit('Other income'); demo.update();
 assert.deepEqual(controller.kinds, ['Other income']);
});
