import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { normalizeLayout, dashboardColumns, moveCard, toggleCard, defaultDashboardLayout } = loadTS('lib/dashboard-layout.ts');
const { weeklyRecap, weekStart } = loadTS('lib/weekly-recap.ts');
const { workspacePreferenceSchema } = loadTS('lib/workspace-preferences.ts');

test('dashboard layouts keep each card in its column, recover from old saves and pin net worth on top', () => {
 assert.deepEqual(dashboardColumns(defaultDashboardLayout), { left: ['net_worth', 'spending', 'budget', 'recap', 'commitments', 'allocation'], right: ['goals', 'transactions', 'upcoming'] });
 const saved = normalizeLayout({ order: ['upcoming', 'removed_card', 'allocation', 'upcoming'], hidden: ['goals', 'nope'] });
 assert.deepEqual(saved.order.slice(0, 2), ['upcoming', 'allocation']);
 assert.equal(saved.order.length, 9, 'new cards are appended');
 assert.deepEqual(saved.hidden, ['goals']);
 assert.deepEqual(dashboardColumns(saved).right, ['upcoming', 'transactions']);
 let layout = moveCard(defaultDashboardLayout, 'budget', -1);
 assert.deepEqual(dashboardColumns(layout).left.slice(0, 3), ['net_worth', 'budget', 'spending']);
 assert.deepEqual(moveCard(layout, 'budget', -1), layout, 'nothing moves above net worth');
 assert.deepEqual(moveCard(layout, 'net_worth', 1), layout);
 assert.deepEqual(moveCard(layout, 'allocation', 1), layout, 'the last card stays last');
 layout = moveCard(layout, 'goals', 1);
 assert.deepEqual(dashboardColumns(layout).right, ['transactions', 'goals', 'upcoming']);
 layout = toggleCard(toggleCard(layout, 'net_worth'), 'recap');
 assert.ok(!dashboardColumns(layout).left.includes('net_worth'));
 assert.ok(dashboardColumns(toggleCard(layout, 'recap')).left.includes('recap'));
 assert.ok(workspacePreferenceSchema.safeParse({ key: 'dashboard', data: layout }).success);
 assert.ok(!workspacePreferenceSchema.safeParse({ key: 'dashboard', data: { order: ['hack'], hidden: [] } }).success);
});

test('the weekly recap compares last Monday-to-Sunday with the week before and lists bills due this week', () => {
 const record = (id, kind, amount, date, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
 assert.equal(weekStart('2026-10-04'), '2026-09-28', 'Sunday belongs to the week that began on Monday');
 assert.equal(weekStart('2026-09-28'), '2026-09-28');
 const records = [record('a', 'Living expense', 40, '2026-09-21'), record('b', 'Charity', 70, '2026-09-27'), record('c', 'Salary', 500, '2026-09-25'), record('d', 'Living expense', 15, '2026-09-28'),
  record('e', 'Living expense', 100, '2026-09-14'), record('f', 'Other expense', 9000, '2026-09-22', { currency: 'UZS' }),
  record('rent', 'Rent expense', 800, '2026-01-03', { frequency: 'Monthly' }), record('gym', 'Living expense', 30, '2026-01-01', { frequency: 'Monthly' }), record('pay', 'Salary', 900, '2026-01-02', { frequency: 'Monthly' })];
 const recap = weeklyRecap(records, [], '2026-10-01', 'USD', { USD: 1 });
 assert.deepEqual([recap.from, recap.to], ['2026-09-21', '2026-09-27']);
 assert.equal(recap.received, 500);assert.equal(recap.spent, 110);assert.equal(recap.missing, 1, 'no inferred exchange rate');
 assert.deepEqual(recap.top, { key: 'Charity', amount: 70 });
 assert.equal(recap.spendingChange, 10);
 assert.deepEqual(recap.upcoming, { count: 2, total: 830 }, 'bills from today to Sunday; income is not a bill');
 assert.deepEqual(weeklyRecap(records, [], '2026-10-02', 'USD', { USD: 1 }).upcoming, { count: 1, total: 800 }, 'days already past are left out');
});
