import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { budgetLines, forecastBudget } = loadTS('lib/budget-forecast.ts');
const { budgetedSpending, budgetKey, estimatedCashFlow } = loadTS('lib/finance.ts');
const { cashForecast } = loadTS('lib/cash-forecast.ts');
const { goalFinancials } = loadTS('lib/goal-projection.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const amount = (category_key, value, currency = 'USD', month = '2026-01') => ({ category_key, month, amount: value, currency, applies_forward: true });
const setting = (category_key, budget_type, extra = {}) => ({ category_key, budget_type, group_name: null, rollover: false, rollover_start: null, excluded: false, ...extra });
const categories = [{ id: 'food', name: 'Groceries', direction: 'expense' }, { id: 'trips', name: 'Travel', direction: 'expense' }];
const rates = { USD: 1, EUR: 0.5 };

test('a budgeted category expects its budget, or its bills when they are more, and never both', () => {
 const lines = [{ key: 'food', name: 'Groceries', categoryKeys: ['food'], amount: 500 }, { key: 'Rent expense', name: 'Rent expense', categoryKeys: ['Rent expense'], amount: 1000 }];
 // Groceries: no bills, so the budget. Rent: a $1,200 bill outgrows its $1,000 budget. Gym: no budget, its bill alone.
 assert.equal(budgetedSpending(lines, new Map([['Rent expense', 1200], ['Living expense', 40]])), 500 + 1200 + 40);
 assert.equal(budgetedSpending([], new Map([['Living expense', 40]])), 40, 'without a budget only the bills count');
 assert.equal(budgetKey({ kind: 'Living expense', custom_category_id: 'food' }), 'food');
 assert.equal(budgetKey({ kind: 'Living expense' }), 'Living expense');
});

test('the month\'s budget lines skip income, excluded and non-monthly budgets, convert currencies and pool flex spending', () => {
 const state = { mode: 'category', applyForward: false, categories: [setting('trips', 'non_monthly'), setting('Charity', 'flexible', { excluded: true }), setting('Rent expense', 'fixed')],
  amounts: [amount('Salary', 9000), amount('food', 400), amount('trips', 1200), amount('Charity', 50), amount('Rent expense', 300, 'EUR'), amount('Other expense', 0)] };
 assert.deepEqual(budgetLines({ state, categories, removed: [] }, '2026-10', 'USD', rates), { lines: [{ key: 'Rent expense', name: 'Rent expense', categoryKeys: ['Rent expense'], amount: 600 }, { key: 'food', name: 'Groceries', categoryKeys: ['food'], amount: 400 }], missing: 0 });
 assert.equal(budgetLines({ state, categories, removed: [] }, '2026-10', 'USD', { USD: 1 }).missing, 1, 'a budget no rate converts is missing, never zero');
 assert.deepEqual(budgetLines({ state, categories, removed: [] }, '2025-12', 'USD', rates).lines, [], 'nothing before the first amount');
 const flex = { ...state, mode: 'flex', amounts: [...state.amounts, amount('flex:flexible', 900)] };
 const lines = budgetLines({ state: flex, categories, removed: [] }, '2026-10', 'USD', rates).lines;
 assert.deepEqual(lines.map(line => [line.key, line.amount]), [['Rent expense', 600], ['flex:flexible', 900]], 'flexible categories share the bucket');
 assert.deepEqual(lines[1].categoryKeys, ['Living expense', 'Other expense', 'food']);
 assert.deepEqual(forecastBudget({ state: flex, categories, removed: [] }).linesIn('2026-10', 'USD', rates).lines, lines);
 // Without a saved Flexible amount the bucket is the flexible categories' plans, as Budget shows it (CF-046).
 const unsaved = { ...state, mode: 'flex', amounts: [...state.amounts, amount('Living expense', 250)] };
 assert.deepEqual(budgetLines({ state: unsaved, categories, removed: [] }, '2026-10', 'USD', rates).lines.map(line => [line.key, line.amount]), [['Rent expense', 600], ['flex:flexible', 650]], 'food 400 + Living expense 250');
 assert.equal(budgetLines({ state: { ...unsaved, amounts: [...state.amounts, amount('Living expense', 250, 'GBP')] }, categories, removed: [] }, '2026-10', 'USD', rates).missing, 1, 'a flexible plan no rate converts leaves the bucket unknown');
});

test('the monthly estimate and the goals surplus count each budget once beside the recurring bills', () => {
 const entries = [record('pay', 'Pay', 'Salary', 5000, '2026-01-01', { frequency: 'Monthly' }), record('rent', 'Rent', 'Rent expense', 1200, '2026-01-01', { frequency: 'Monthly' }), record('gym', 'Gym', 'Living expense', 40, '2026-01-01', { frequency: 'Monthly', custom_category_id: 'food' })];
 assert.equal(estimatedCashFlow(entries, '2026-10').monthlyExpenses, 1240, 'without Budget the bills alone');
 const lines = [{ key: 'food', name: 'Groceries', categoryKeys: ['food'], amount: 500 }];
 assert.equal(estimatedCashFlow(entries, '2026-10', lines).monthlyExpenses, 1700, 'the $40 gym bill is inside the $500 groceries budget');
 const budget = forecastBudget({ state: { mode: 'category', applyForward: false, categories: [], amounts: [amount('food', 500)] }, categories, removed: [] });
 assert.equal(goalFinancials(entries, '2026-10', 'USD', null, budget).surplus, 5000 - 1700);
 assert.equal(goalFinancials(entries, '2026-10', 'USD', null).surplus, 5000 - 1240);
 const euros = forecastBudget({ state: { mode: 'category', applyForward: false, categories: [], amounts: [amount('food', 500, 'EUR')] }, categories, removed: [] });
 assert.equal(goalFinancials(entries, '2026-10', 'USD', null, euros).surplus, null, 'a budget no rate converts leaves the surplus unknown');
});

test('the projected cash spends what is left of each budget: this month after spending and bills, later months beside their bills', () => {
 const today = '2026-10-10';
 const records = [record('cash', 'Checking', 'Cash', 5000, '2026-01-01'), record('gym', 'Gym', 'Living expense', 40, '2026-01-20', { frequency: 'Monthly', custom_category_id: 'food', account_id: 'cash' })];
 const lines = [{ key: 'food', name: 'Groceries', categoryKeys: ['food'], amount: 500 }, { key: 'Charity', name: 'Charity', categoryKeys: ['Charity'], amount: 30 }];
 const budget = { linesFor: () => ({ lines, missing: 0 }), spent: new Map([['food', 300], ['Charity', 45]]) };
 const forecast = cashForecast({ records, occurrences: [], today, days: 60, currency: 'USD', rates, budget });
 const spending = forecast.events.filter(event => event.source === 'budget').map(event => [event.date, event.name, event.amount]);
 // October: 500 − 300 spent − 40 gym still due = 160 today; Charity is already overspent. November: 460 beside its gym bill.
 // December's bill falls after the horizon, so its whole budget leaves on the 1st.
 assert.deepEqual(spending, [['2026-10-10', 'Groceries', -160], ['2026-11-01', 'Charity', -30], ['2026-11-01', 'Groceries', -460], ['2026-12-01', 'Charity', -30], ['2026-12-01', 'Groceries', -500]]);
 assert.equal(forecast.events.filter(event => event.source === 'scheduled').length, 2, 'the gym bill stays its own event');
 const without = cashForecast({ records, occurrences: [], today, days: 60, currency: 'USD', rates });
 assert.equal(without.events.some(event => event.source === 'budget'), false);
 assert.equal(without.totals[0].end - forecast.totals[0].end, 160 + 490 + 530);
 // A bill no rate converts leaves its budget out rather than counting both.
 const euroGym = [records[0], { ...records[1], currency: 'GBP' }];
 assert.deepEqual(cashForecast({ records: euroGym, occurrences: [], today, days: 20, currency: 'USD', rates, budget: { linesFor: () => ({ lines: [lines[0]], missing: 0 }), spent: new Map() } }).events.filter(event => event.source === 'budget'), []);
 // A budget no rate converts is left out of the projection and counted, so the note shows (MONEY-008).
 const unknown = cashForecast({ records, occurrences: [], today, days: 60, currency: 'USD', rates, budget: { linesFor: month => ({ lines: month === '2026-11' ? [] : lines, missing: month === '2026-11' ? 1 : 0 }), spent: new Map() } });
 assert.equal(unknown.missing, 1);
 assert.equal(unknown.converted, false);
 assert.deepEqual(unknown.months.map(group => [group.month, group.missing]), [['2026-10', 0], ['2026-11', 1], ['2026-12', 0]], 'that month\'s total is unknown');
 assert.equal(unknown.events.some(event => event.source === 'budget' && event.date.startsWith('2026-11')), false);
 assert.equal(cashForecast({ records, occurrences: [], today, days: 60, currency: 'USD', rates, budget }).missing, 0);
});

test('flex mode: Budget, the Overview card and the forecasts plan the same Flexible amount, and the leftover rolls over once (DRY-001)', () => {
 const { budgetCategories, budgetRows, budgetRowsForMode, flexBucketCategory, flexBucketPlan, flexBucketRollover, leftToBudget } = loadTS('lib/budget.ts');
 // No saved Flexible amount; Groceries (flexible) budgets 400 and rolls over since September, when 300 was spent.
 const settings = [setting('food', 'flexible', { rollover: true, rollover_start: '2026-09-01' }), setting('flex:flexible', 'flexible', { rollover: true, rollover_start: '2026-09-01' })];
 const state = { mode: 'flex', applyForward: false, categories: settings, amounts: [amount('food', 400, 'USD', '2026-09')] };
 const all = budgetCategories(categories, settings);
 const history = new Map([['2026-09', { month: '2026-09', byCategory: new Map([['food', 300]]), missing: 0 }], ['2026-10', { month: '2026-10', byCategory: new Map(), missing: 0 }]]);
 const rows = budgetRows(all, state.amounts, history, '2026-10', 'USD', rates);
 assert.equal(rows.find(row => row.key === 'food').rolloverIn, 100, 'the category alone would carry 100');
 const plan = flexBucketPlan(state.amounts, all, '2026-10', 'USD', rates);
 assert.equal(plan, 400, 'the plan carries no per-category rollover');
 const forecast = budgetLines({ state, categories, removed: [] }, '2026-10', 'USD', rates).lines.find(line => line.key === 'flex:flexible');
 assert.equal(forecast.amount, plan, 'Budget and the forecasts agree');
 // The bucket's own rollover carries September's leftover, once: 400 + 100 available, not 600.
 const carried = flexBucketRollover(flexBucketCategory(settings), all, state.amounts, history, '2026-10', 'USD', rates);
 assert.equal(carried, 100);
 assert.equal(plan + carried, 500);
 const shown = budgetRowsForMode(rows, 'flex');
 assert.equal(shown.find(row => row.key === 'food').rolloverIn, 0, 'in flex mode the category carries nothing of its own');
 assert.equal(leftToBudget(shown.filter(row => row.direction === 'expense'), 'flex', plan, 0).expenses, 400, 'the Overview Budget card plans the same 400');
});
