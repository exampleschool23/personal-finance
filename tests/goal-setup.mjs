import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { goalTemplates, alreadyAdded, setupDrafts, draftProblems, canContinue, monthlyTotals, maxPerTemplate } = loadTS('lib/goal-setup.ts');
const { planningSchemas } = loadTS('lib/planning-schemas.ts');

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const cash = { id: '00000000-0000-4000-8000-aaaaaaaaaaaa', currency: 'EUR' };
const label = template => template.name;

test('selected tiles become numbered drafts; savings start in the first cash account, net worth in the display currency', () => {
 const drafts = setupDrafts({ car: 2, net_worth: 1, investment: 3, emergency: 0 }, label, { currency: 'USD', account: cash }, newId);
 assert.deepEqual(drafts.map(draft => [draft.template, draft.goal.name, draft.goal.kind, draft.goal.currency, draft.goal.account_id]), [
  ['car', 'Car 1', 'savings', 'EUR', cash.id], ['car', 'Car 2', 'savings', 'EUR', cash.id], ['net_worth', 'Net worth', 'net_worth', 'USD', null]]);
 assert.equal(setupDrafts({ car: 99 }, label, { currency: 'USD', account: cash }, newId).length, maxPerTemplate, 'capped per tile');
 assert.equal(drafts.every(draft => draft.goal.target === 0 && draft.goal.allocated === 0 && draft.goal.monthly_contribution === null), true);
});

test('coming back to the tiles keeps what was already filled in', () => {
 const first = setupDrafts({ car: 1 }, label, { currency: 'USD', account: cash }, newId);
 first[0].goal = { ...first[0].goal, name: 'Family van', target: 15000 };
 const again = setupDrafts({ car: 2, vacation: 1 }, label, { currency: 'USD', account: cash }, newId, first);
 assert.equal(again[0], first[0]);
 assert.deepEqual(again.map(draft => draft.goal.name), ['Family van', 'Car 2', 'Vacation']);
 assert.deepEqual(setupDrafts({}, label, { currency: 'USD', account: cash }, newId, first), [], 'unpicked tiles drop their drafts');
});

test('each step blocks only on its own rules, and continuing needs every earlier step too', () => {
 const today = '2026-10-02';
 const [{ goal }] = setupDrafts({ car: 1 }, label, { currency: 'USD', account: cash }, newId);
 assert.deepEqual(draftProblems(goal, 'targets', today), ['Enter a target amount.']);
 assert.deepEqual(draftProblems({ ...goal, name: ' ', target: 10, target_date: '2026-10-01' }, 'targets', today), ['Enter a name.', 'Choose a date from today on.']);
 const worth = setupDrafts({ net_worth: 1 }, label, { currency: 'USD', account: null }, newId)[0].goal;
 assert.deepEqual(draftProblems({ ...worth, target: 1e6 }, 'targets', today), ['Choose a target date.'], 'net-worth goals need a date');
 assert.deepEqual(draftProblems({ ...goal, account_id: null, target: 100, allocated: 150 }, 'contribution', today), ['Choose a cash account.', 'Already saved cannot be more than the target.']);
 assert.deepEqual(draftProblems(worth, 'contribution', today), [], 'net-worth goals start from net worth');
 assert.equal(canContinue([], 'select', today), false);
 assert.equal(canContinue([goal], 'contribution', today), false, 'the missing target still blocks later steps');
 assert.equal(canContinue([{ ...goal, target: 15000 }], 'budget', today), true);
});

test('finished drafts pass the server goal rules', () => {
 const today = '2026-10-02';
 const [car, worth] = setupDrafts({ car: 1, net_worth: 1 }, label, { currency: 'USD', account: cash }, newId).map(draft => draft.goal);
 const ready = [{ ...car, target: 15000, allocated: 2500, monthly_contribution: 971, target_date: '2027-06-01' }, { ...worth, target: 1e6, target_date: '2030-01-01', monthly_contribution: null }];
 assert.equal(canContinue(ready, 'budget', today), true);
 for (const goal of ready) assert.ok(planningSchemas.goal.safeParse(goal).success, goal.name);
});

test('monthly totals are listed per currency, never added across currencies', () => {
 assert.deepEqual(monthlyTotals([{ currency: 'USD', monthly_contribution: 100 }, { currency: 'EUR', monthly_contribution: 50 }, { currency: 'USD', monthly_contribution: 25.5 }, { currency: 'USD', monthly_contribution: null }]), [{ currency: 'USD', amount: 125.5 }, { currency: 'EUR', amount: 50 }]);
});

test('tiles count the person\'s matching active goals', () => {
 const emergency = goalTemplates.find(template => template.id === 'emergency');
 const goals = [{ name: 'Emergency fund', kind: 'savings', archived: false }, { name: 'Rainy day', kind: 'savings', archived: false }, { name: 'Old emergency', kind: 'savings', archived: true }, { name: 'Emergency net worth', kind: 'net_worth', archived: false }];
 assert.equal(alreadyAdded(emergency, goals), 2);
 assert.ok(goalTemplates.some(template => template.kind === 'investment'), 'stocks and crypto keep their own editor');
});
