import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { goalTemplates, alreadyAdded, setupDrafts, draftProblems, canContinue, monthlyTotals, maxPerTemplate, goalAccountOptions, savingsCurrencies, savingsDefaults, withSavingsCurrency, pickTemplate } = loadTS('lib/goal-setup.ts');
const { planningSchemas } = loadTS('lib/planning-schemas.ts');

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const cash = { id: '00000000-0000-4000-8000-aaaaaaaaaaaa', currency: 'EUR' };
const label = template => template.name;

test('selected tiles become numbered drafts; without a primary-currency account, savings use the first cash account', () => {
 const drafts = setupDrafts({ car: 2, net_worth: 1, investment: 3, emergency: 0 }, label, { currency: 'USD', accounts: [cash] }, newId);
 assert.deepEqual(drafts.map(draft => [draft.template, draft.goal.name, draft.goal.kind, draft.goal.currency, draft.goal.account_id]), [
  ['car', 'Car 1', 'savings', 'EUR', cash.id], ['car', 'Car 2', 'savings', 'EUR', cash.id], ['net_worth', 'Net worth', 'net_worth', 'USD', null]]);
 assert.equal(setupDrafts({ car: 99 }, label, { currency: 'USD', accounts: [cash] }, newId).length, maxPerTemplate, 'capped per tile');
 assert.equal(drafts.every(draft => draft.goal.target === 0 && draft.goal.allocated === 0 && draft.goal.monthly_contribution === null), true);
});

test('coming back to the tiles keeps what was already filled in', () => {
 const first = setupDrafts({ car: 1 }, label, { currency: 'USD', accounts: [cash] }, newId);
 first[0].goal = { ...first[0].goal, name: 'Family van', target: 15000 };
 const again = setupDrafts({ car: 2, vacation: 1 }, label, { currency: 'USD', accounts: [cash] }, newId, first);
 assert.equal(again[0], first[0]);
 assert.deepEqual(again.map(draft => draft.goal.name), ['Family van', 'Car 2', 'Vacation']);
 assert.deepEqual(setupDrafts({}, label, { currency: 'USD', accounts: [cash] }, newId, first), [], 'unpicked tiles drop their drafts');
});

test('each step blocks only on its own rules, and continuing needs every earlier step too', () => {
 const today = '2026-10-02';
 const [{ goal }] = setupDrafts({ car: 1 }, label, { currency: 'USD', accounts: [cash] }, newId);
 assert.deepEqual(draftProblems(goal, 'targets', today), ['Enter a target amount.']);
 assert.deepEqual(draftProblems({ ...goal, name: ' ', target: 10, target_date: '2026-10-01' }, 'targets', today), ['Enter a name.', 'Choose a date from today on.']);
 const worth = setupDrafts({ net_worth: 1 }, label, { currency: 'USD', accounts: [] }, newId)[0].goal;
 assert.deepEqual(draftProblems({ ...worth, target: 1e6 }, 'targets', today), ['Choose a target date.'], 'net-worth goals need a date');
 assert.deepEqual(draftProblems({ ...goal, account_id: null, target: 100, allocated: 150 }, 'contribution', today), ['Choose a cash account.', 'Already saved cannot be more than the target.']);
 assert.deepEqual(draftProblems(worth, 'contribution', today), [], 'net-worth goals start from net worth');
 assert.equal(canContinue([], 'select', today), false);
 assert.equal(canContinue([goal], 'contribution', today), false, 'the missing target still blocks later steps');
 assert.equal(canContinue([{ ...goal, target: 15000 }], 'budget', today), true);
});

test('finished drafts pass the server goal rules', () => {
 const today = '2026-10-02';
 const [car, worth] = setupDrafts({ car: 1, net_worth: 1 }, label, { currency: 'USD', accounts: [cash] }, newId).map(draft => draft.goal);
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

const usd = { id: '00000000-0000-4000-8000-bbbbbbbbbbbb', currency: 'USD' }, usd2 = { id: '00000000-0000-4000-8000-cccccccccccc', currency: 'USD' };
test('new goals start in the primary currency even when the first cash account is in another one', () => {
 // QA: primary USD, second EUR, first cash account "QA Euro" in EUR. Goals used to start at €.
 const drafts = setupDrafts({ emergency: 1, net_worth: 1 }, label, { currency: 'USD', accounts: [cash, usd, usd2] }, newId);
 assert.deepEqual(drafts.map(draft => [draft.goal.currency, draft.goal.account_id]), [['USD', usd.id], ['USD', null]]);
 assert.deepEqual(savingsDefaults([cash], 'USD'), { currency: 'EUR', account_id: cash.id }, 'no USD account: the goal follows the account it can use');
 assert.deepEqual(savingsDefaults([], 'USD'), { currency: 'USD', account_id: null });
});

test('a savings goal only offers cash accounts in its own currency, and changing the currency moves it to a matching account', () => {
 assert.deepEqual(goalAccountOptions([cash, usd, usd2], 'USD').map(account => account.id), [usd.id, usd2.id]);
 assert.deepEqual(goalAccountOptions([cash, usd], 'GBP'), []);
 assert.deepEqual(savingsCurrencies([cash, usd, { id: 'x', currency: 'UZS' }], ['USD', 'GBP']), ['USD', 'EUR', 'UZS'], 'preferred first, only currencies with an account');
 const [{ goal }] = setupDrafts({ car: 1 }, label, { currency: 'USD', accounts: [cash, usd] }, newId);
 const euro = withSavingsCurrency({ ...goal, target: 5000 }, 'EUR', [cash, usd]);
 assert.deepEqual([euro.currency, euro.account_id, euro.target], ['EUR', cash.id, 5000]);
 assert.equal(withSavingsCurrency(goal, 'GBP', [cash, usd]).account_id, null, 'no matching account blocks the Contribution step');
 assert.deepEqual(draftProblems({ ...withSavingsCurrency(goal, 'GBP', [cash, usd]), target: 10 }, 'contribution', '2026-10-02'), ['Choose a cash account.']);
});

test('drafts follow the order the tiles were picked, and clearing a tile forgets its place', () => {
 let counts = pickTemplate({}, 'vacation', 1);
 counts = pickTemplate(counts, 'emergency', 1);
 assert.deepEqual(setupDrafts(counts, label, { currency: 'USD', accounts: [usd] }, newId).map(draft => draft.template), ['vacation', 'emergency']);
 counts = pickTemplate(pickTemplate(counts, 'vacation', 0), 'vacation', 2);
 assert.deepEqual(setupDrafts(counts, label, { currency: 'USD', accounts: [usd] }, newId).map(draft => draft.goal.name), ['Emergency fund', 'Vacation 1', 'Vacation 2']);
 assert.deepEqual(pickTemplate({}, 'car', 99), { car: maxPerTemplate });
});
