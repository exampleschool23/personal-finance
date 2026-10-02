import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { goalSummary, goalStatus } = loadTS('lib/goal-projection.ts');
const { demoGoals, demoRecords } = loadTS('lib/demo-finance.ts');

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

test('sample savings goals reserve money in the sample savings account and stay within it', () => {
 const today = '2026-10-02', goals = demoGoals(today).filter(goal => goal.kind === 'savings');
 const savings = demoRecords(today).find(record => record.id === 'demo-savings');
 assert.ok(goals.length && goals.every(goal => goal.account_id === savings.id && goal.allocated < goal.target && goal.target_date > today));
 assert.ok(goals.reduce((sum, goal) => sum + goal.allocated, 0) <= savings.amount);
});

test('goal status pills: completed, on track when the planned monthly amount covers what is needed, at risk otherwise', () => {
 const goal = { target: 10000, target_date: '2027-12-02', monthly_contribution: 415, funding_monthly: null };
 const status = (overrides, current = 4200, today = '2026-10-02') => goalStatus(goalSummary({ ...goal, ...overrides }, current, today));
 assert.equal(status({}), 'on_track', '415 a month covers 5,800 over 14 months');
 assert.equal(status({ monthly_contribution: 414 }), 'at_risk', 'one short of the whole monthly amount needed');
 assert.equal(status({ monthly_contribution: 100, funding_monthly: 500 }), 'on_track', 'the funding plan amount wins over the planner contribution');
 assert.equal(status({}, 10000), 'completed');
 assert.equal(status({ target_date: null }, 10000), 'completed', 'a reached goal is complete even without a date');
 assert.equal(status({ target_date: null }), null, 'no date, no pace to judge');
 assert.equal(status({}, null), null, 'unknown current value');
 assert.equal(status({ target_date: '2025-01-01', monthly_contribution: 1e9 }), 'at_risk', 'the target date passed before the goal was reached');
});
