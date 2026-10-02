import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { goalSummary } = loadTS('lib/goal-projection.ts');
const { demoPlanning, demoRecords } = loadTS('lib/demo-finance.ts');

test('a goal page heads with progress, what is left, and a whole monthly amount that finishes on time', () => {
 const goal = { target: 10000, target_date: '2027-12-02', monthly_contribution: 400, funding_monthly: null };
 assert.deepEqual(goalSummary(goal, 4200, '2026-10-02'), { percent: 42, left: 5800, monthsLeft: 14, needed: 415, monthly: 400 });
 assert.equal(goalSummary(goal, 12000, '2026-10-02').left, 0);
 assert.equal(goalSummary(goal, 12000, '2026-10-02').percent, 100);
 assert.equal(goalSummary(goal, 12000, '2026-10-02').needed, 0);
 assert.equal(goalSummary({ ...goal, target_date: '2026-10-20' }, 4200, '2026-10-02').needed, 5800, 'the last month needs the whole remainder');
 assert.equal(goalSummary({ ...goal, target_date: '2025-01-01' }, 4200, '2026-10-02').monthsLeft, 0);
 assert.deepEqual(goalSummary({ ...goal, target_date: null }, null, '2026-10-02'), { percent: null, left: null, monthsLeft: null, needed: null, monthly: 400 });
 assert.equal(goalSummary({ ...goal, funding_monthly: 250 }, 0, '2026-10-02').monthly, 250, 'the funding plan wins over the old monthly field');
});

test('sample goals reserve money in the sample cash account and stay within it', () => {
 const today = '2026-10-02', { goals, categories } = demoPlanning(today);
 const cash = demoRecords(today).find(record => record.id === 'demo-cash');
 assert.ok(goals.every(goal => goal.account_id === cash.id && goal.allocated < goal.target && goal.target_date > today));
 assert.ok(goals.reduce((sum, goal) => sum + goal.allocated, 0) <= cash.amount);
 assert.deepEqual(categories.map(category => category.direction).sort(), ['expense', 'expense', 'income']);
});
