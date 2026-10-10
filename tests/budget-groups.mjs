import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { moveToGroup } = loadTS('lib/budget-groups.ts');

const charity = { key: 'Charity', name: 'Charity', custom: false, direction: 'expense', type: 'fixed', group: 'Family support', excluded: false, rollover: true, rolloverStart: '2026-07', rolloverBalance: 40, rolloverCurrency: 'USD', rolloverNegative: false };

test('dragging a category into another group saves what Category settings would', () => {
 const custom = moveToGroup(charity, { name: 'Household', direction: 'expense', type: null });
 assert.deepEqual(custom, { category_key: 'Charity', budget_type: 'fixed', group_name: 'Household', rollover: true, rollover_start: '2026-07', excluded: false, rollover_balance: 40, rollover_currency: 'USD', rollover_negative: false });
 assert.equal(moveToGroup(charity, { name: 'Bills & recurring', direction: 'expense', type: null }).group_name, null, 'the type\'s own group is not stored');
 assert.equal(moveToGroup(charity, { name: 'Family support', direction: 'expense', type: null }), null, 'same group: nothing to save');
 assert.equal(moveToGroup(charity, { name: 'Income', direction: 'income', type: null }), null);
 const flex = moveToGroup(charity, { name: 'Flexible', direction: 'expense', type: 'flexible' });
 assert.equal(flex.budget_type, 'flexible');
 assert.equal(flex.group_name, 'Family support', 'flex mode changes the type and keeps a custom group');
 assert.equal(moveToGroup(charity, { name: 'Fixed', direction: 'expense', type: 'fixed' }), null);
});
