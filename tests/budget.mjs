import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { budgetAmountFor, setBudgetAmount, budgetCategories, monthActuals, budgetRows, budgetHistory, suggestedBudget, groupRows, leftToBudget, flexBucketBudget, budgetRowsForMode, remainingTone, rolloverBalance, budgetReadRange, flexBucketKey, isUnbudgeted, demoBudget } = loadTS('lib/budget.ts');
const { shiftMonth } = loadTS('lib/calendar-days.ts');
const { demoRecords } = loadTS('lib/demo-finance.ts');

const amount = (category_key, month, value, applies_forward = false, currency = 'USD') => ({ category_key, month, amount: value, currency, applies_forward });
const record = (id, kind, value, date, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount: value, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const rates = { USD: 1, UZS: 12500 };

test('a forward amount covers later months until the next saved one; an exact month wins', () => {
 const amounts = [amount('Groceries', '2026-03', 400, true), amount('Groceries', '2026-06', 300), amount('Groceries', '2026-08', 500, true)];
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-02'), null);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-05').amount, 400);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-06').amount, 300);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-07').amount, 400, 'a one-month amount does not carry on');
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2027-01').amount, 500);
 assert.equal(budgetAmountFor(amounts, 'Rent', '2026-05'), null);
});

test('"this month only" keeps later months, "all future months" replaces them', () => {
 let amounts = [amount('Groceries', '2026-03', 400, true), amount('Groceries', '2026-09', 250)];
 amounts = setBudgetAmount(amounts, 'Groceries', '2026-05', 600, 'USD', false);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-05').amount, 600);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-06').amount, 400);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-09').amount, 250);
 amounts = setBudgetAmount(amounts, 'Groceries', '2026-04', 350, 'USD', true);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-03').amount, 400, 'earlier months keep their amount');
 for (const month of ['2026-05', '2026-09', '2027-04']) assert.equal(budgetAmountFor(amounts, 'Groceries', month).amount, 350, month);
 // Overwriting a forward month for one month moves the forward amount on, so later months keep it.
 amounts = setBudgetAmount(amounts, 'Groceries', '2026-04', 100, 'USD', false);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-04').amount, 100);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-05').amount, 350);
 assert.equal(budgetAmountFor(amounts, 'Groceries', '2026-12').amount, 350);
 // Precision is kept exactly as typed.
 assert.equal(budgetAmountFor(setBudgetAmount([], 'X', '2026-01', 13782.113487716848, 'USD', false), 'X', '2026-01').amount, 13782.113487716848);
});

test('categories cover built-in kinds and custom categories, with default types; repayments are not categories', () => {
 const list = budgetCategories([{ id: 'c1', name: 'Pets', direction: 'expense' }, { id: 'c2', name: 'Tips', direction: 'income' }], [{ category_key: 'Living expense', budget_type: 'non_monthly', group_name: 'Home', rollover: true, rollover_start: '2026-01', excluded: false }]);
 const by = key => list.find(item => item.key === key);
 assert.equal(by('Salary').direction, 'income');
 assert.equal(by('c2').direction, 'income');
 assert.equal(by('Rent expense').type, 'fixed');
 assert.equal(by('Charity').type, 'flexible');
 assert.equal(by('c1').group, 'Everyday spending');
 assert.equal(by('Living expense').type, 'non_monthly');
 assert.equal(by('Living expense').group, 'Home');
 assert.equal(by('Living expense').rolloverStart, '2026-01');
 for (const key of ['Mortgage', 'Loan', 'Debt']) assert.equal(by(key), undefined, 'principal repayments are transfers, not budget categories');
 assert.equal(by('Groceries'), undefined, 'unknown keys without a category are not invented');
});

test('actuals reuse the monthly review for spending, add income by category and convert currencies', () => {
 const records = [
  record('a', 'Living expense', 40, '2026-09-03'), record('b', 'Living expense', 25000, '2026-09-04', { currency: 'UZS' }),
  record('c', 'Other expense', 10, '2026-09-05', { custom_category_id: 'pets' }), record('d', 'Salary', 2000, '2026-09-05'),
  record('e', 'Other income', 50, '2026-09-28'), record('future', 'Living expense', 99, '2026-09-30'),
  record('plan', 'Living expense', 500, '2026-09-01', { frequency: 'Monthly' }), record('aug', 'Living expense', 70, '2026-08-30'),
 ];
 const actual = monthActuals({ records, activity: [], investmentLinks: [] }, [], '2026-09', 'USD', '2026-09-29', rates);
 assert.equal(actual.byCategory.get('Living expense'), 42);
 assert.equal(actual.byCategory.get('pets'), 10);
 assert.equal(actual.byCategory.get('Salary'), 2000);
 assert.equal(actual.byCategory.get('Other income'), 50);
 assert.equal(actual.missing, 0);
 const euro = monthActuals({ records: [record('x', 'Salary', 10, '2026-09-01', { currency: 'EUR' })], activity: [] }, [], '2026-09', 'USD', '2026-09-29', rates);
 assert.equal(euro.missing, 1, 'no inferred exchange rate');
 assert.equal(euro.byCategory.get('Salary'), undefined);
});

test('rows show planned, actual and remaining with rollover; history averages six months', () => {
 const categories = budgetCategories([], [{ category_key: 'Charity', budget_type: 'flexible', group_name: null, rollover: true, rollover_start: '2026-07', excluded: false }]);
 const history = new Map([['2026-07', { byCategory: new Map([['Charity', 10], ['Living expense', 300]]) }], ['2026-08', { byCategory: new Map([['Charity', 40]]) }], ['2026-09', { byCategory: new Map([['Charity', 5], ['Living expense', 120]]) }]]);
 const amounts = [amount('Charity', '2026-07', 25, true), amount('Living expense', '2026-09', 100), amount('Salary', '2026-09', 18000000, false, 'UZS')];
 const rows = budgetRows(categories, amounts, history, '2026-09', 'USD', rates);
 const by = key => rows.find(row => row.key === key);
 // July +15, August −15: nothing carried into September.
 assert.equal(by('Charity').rolloverIn, 0);
 assert.equal(rolloverBalance(categories.find(c => c.key === 'Charity'), amounts, history, '2026-08', 'USD', rates), 15);
 assert.equal(by('Charity').remaining, 20);
 assert.equal(by('Living expense').remaining, -20);
 assert.equal(remainingTone(by('Living expense').remaining), 'negative');
 assert.equal(by('Salary').budget, 1440);
 assert.equal(by('Rent expense').budget, 0);
 assert.ok(isUnbudgeted(by('Rent expense')));
 assert.equal(by('Living expense').progress, 1.2);
 const pastHistory = budgetHistory('Living expense', '2026-10', history);
 assert.deepEqual(pastHistory.months.map(m => m.month), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
 assert.equal(pastHistory.lastMonth, 120);
 assert.equal(pastHistory.average, 70);
 assert.equal(suggestedBudget(70.01), 71, 'suggestions are whole and rounded up');
 assert.equal(suggestedBudget(70), 70);
 assert.equal(suggestedBudget(0), 0);
 assert.equal(budgetRows(categories, [amount('X', '2026-09', 5, false, 'EUR')], history, '2026-09', 'USD', rates).find(r => r.key === 'X'), undefined);
 const euroRow = budgetRows(budgetCategories([{ id: 'X', name: 'X', direction: 'expense' }], []), [amount('X', '2026-09', 5, false, 'EUR')], history, '2026-09', 'USD', rates).find(r => r.key === 'X');
 assert.equal(euroRow.budget, null, 'a budget in an unconvertible currency is unknown, not zero');
 assert.equal(euroRow.remaining, null);
});

test('left to budget: income minus spending and contributions; flex replaces flexible categories with one amount', () => {
 const categories = budgetCategories([], [{ category_key: 'Other expense', budget_type: 'non_monthly', group_name: null, rollover: false, rollover_start: null, excluded: false }, { category_key: 'Charity', budget_type: 'flexible', group_name: null, rollover: false, rollover_start: null, excluded: true }]);
 const amounts = [amount('Salary', '2026-09', 3000), amount('Rent expense', '2026-09', 1200), amount('Living expense', '2026-09', 300), amount('Other expense', '2026-09', 100), amount('Charity', '2026-09', 999), amount(flexBucketKey, '2026-09', 800)];
 const rows = budgetRows(categories, amounts, new Map(), '2026-09', 'USD', rates);
 const category = leftToBudget(rows, 'category', null, 250);
 assert.deepEqual(category, { income: 3000, expenses: 1600, contributions: 250, left: 1150, flexible: null });
 const flex = leftToBudget(rows, 'flex', 800, 250);
 assert.equal(flex.expenses, 2100);
 assert.equal(flex.left, 650);
 assert.equal(remainingTone(-1), 'negative');
 assert.equal(remainingTone(0), 'neutral');
 assert.equal(remainingTone(5, 'income'), 'neutral', 'income still to come is not red');
 assert.equal(remainingTone(-5, 'income'), 'positive');
 const groups = groupRows(rows, true);
 assert.deepEqual(groups.map(group => group.name), ['Income', 'Fixed', 'Flexible', 'Non-monthly']);
 assert.ok(!groups.some(group => group.rows.some(row => row.key === 'Charity')), 'excluded categories leave the totals');
 assert.deepEqual(groupRows(rows, false).map(group => group.name), ['Income', 'Bills & recurring', 'Everyday spending', 'Future spending']);
});

test('reads cover the history window, the year, and earlier rollover starts, at most two years', () => {
 assert.deepEqual(budgetReadRange('2026-10', 'month', []), { from: '2026-04', to: '2026-10' });
 assert.deepEqual(budgetReadRange('2026-10', 'year', []), { from: '2026-01', to: '2026-12' });
 assert.deepEqual(budgetReadRange('2026-10', 'month', [{ rollover: true, rolloverStart: '2025-12' }]), { from: '2025-12', to: '2026-10' });
 assert.deepEqual(budgetReadRange('2026-10', 'month', [{ rollover: true, rolloverStart: '2019-01' }]), { from: '2024-11', to: '2026-10' });
 assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

test('the sample workspace has six months of history and a budget that leaves money to plan', () => {
 const today = '2026-10-02', month = today.slice(0, 7);
 const records = demoRecords(today);
 const state = demoBudget(month);
 const categories = budgetCategories([], state.categories);
 const history = new Map(Array.from({ length: 7 }, (_, index) => shiftMonth(month, index - 6)).map(item => [item, monthActuals({ records, activity: [] }, [], item, 'USD', today, rates)]));
 for (const [item, actual] of history) if (item < month) assert.ok(actual.byCategory.get('Living expense') > 0, item);
 const rows = budgetRows(categories, state.amounts, history, month, 'USD', rates);
 assert.ok(leftToBudget(rows, 'category', null, 0).left > 0);
 assert.ok(rows.find(row => row.key === 'Charity').rolloverIn > 0);
});

test('flex mode shows one coherent flexible plan: the bucket, or the categories\' budgets until a bucket is saved', () => {
 const categories = budgetCategories([], []);
 const history = new Map([['2026-09', { month: '2026-09', byCategory: new Map([['Living expense', 120]]), missing: 0 }]]);
 const before = [amount('Salary', '2026-09', 1000), amount('Rent expense', '2026-09', 300), amount('Living expense', '2026-09', 200)];
 const rows = budgetRows(categories, before, history, '2026-09', 'USD', rates);
 // No bucket saved yet: the flexible plan is the $200 the category already had, not $0.
 const bucket = flexBucketBudget(before, rows, '2026-09', 'USD', rates);
 assert.equal(bucket, 200);
 const shown = budgetRowsForMode(rows, 'flex');
 const living = shown.find(row => row.key === 'Living expense');
 assert.equal(living.budget, null, 'a flexible category has no separate plan in flex mode');
 assert.equal(living.remaining, null);
 assert.equal(living.actual, 120, 'its spending still shows and counts in the bucket');
 assert.equal(shown.find(row => row.key === 'Rent expense').budget, 300, 'fixed categories keep their own plan');
 const flexible = groupRows(shown, true).find(group => group.type === 'flexible');
 assert.equal(flexible.actual, 120);
 const left = leftToBudget(shown, 'flex', bucket, 0);
 assert.deepEqual(left, { income: 1000, expenses: 500, contributions: 0, left: 500, flexible: 200 });
 // Once a bucket amount is saved it is the plan, whatever the categories had.
 const saved = [...before, amount(flexBucketKey, '2026-09', 450)];
 assert.equal(flexBucketBudget(saved, budgetRows(categories, saved, history, '2026-09', 'USD', rates), '2026-09', 'USD', rates), 450);
 // Category mode is untouched.
 assert.deepEqual(budgetRowsForMode(rows, 'category'), rows);
});

const { rolloverCarry, startingBalanceIn, flexBucketCategory, flexBucketRollover, flexBucketPlan } = loadTS('lib/budget.ts');
const fundSetting = (category_key, extra = {}) => ({ category_key, budget_type: 'flexible', group_name: null, rollover: true, rollover_start: '2026-01', excluded: false, ...extra });
const fundOf = (extra, key = 'Charity') => budgetCategories([], [fundSetting(key, extra)]).find(category => category.key === key);
const spentEach = entries => new Map(Object.entries(entries).map(([month, byKey]) => [month, { byCategory: new Map(Object.entries(byKey)) }]));

test('rollover chains carry leftovers month to month from the start month and starting balance', () => {
 const history = spentEach({ '2026-01': { Charity: 60 }, '2026-02': { Charity: 140 }, '2026-03': { Charity: 100 }, '2026-04': { Charity: 0 } });
 const amounts = [amount('Charity', '2026-01', 100, true)];
 const carry = (category, month) => rolloverBalance(category, amounts, history, month, 'USD', rates);
 // +40, then −40 (overspent), then 0, then +100.
 assert.deepEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(month => carry(fundOf(), month)), [0, 0, 40, 0, 0, 100]);
 // A starting balance is carried into the start month itself.
 const funded = fundOf({ rollover_balance: 250, rollover_currency: 'USD' });
 assert.equal(carry(funded, '2026-01'), 250);
 assert.equal(carry(funded, '2026-03'), 250);
 assert.equal(carry(funded, '2026-05'), 350);
 const [row] = budgetRows([funded], amounts, history, '2026-02', 'USD', rates);
 assert.deepEqual([row.budget, row.rolloverIn, row.actual, row.remaining], [100, 290, 140, 250], 'available is budget + rollover − actual');
 // A later start month ignores earlier months.
 assert.equal(carry(fundOf({ rollover_start: '2026-03' }), '2026-05'), 100);
});

test('negative carry: overspending reduces the next month unless turned off, which resets the fund to zero', () => {
 const history = spentEach({ '2026-01': { Charity: 300 }, '2026-02': { Charity: 50 } });
 const amounts = [amount('Charity', '2026-01', 100, true)];
 const carry = (negative, month) => rolloverBalance(fundOf({ rollover_negative: negative }), amounts, history, month, 'USD', rates);
 assert.equal(carry(true, '2026-02'), -200);
 assert.equal(carry(true, '2026-03'), -150);
 assert.equal(carry(false, '2026-02'), 0);
 assert.equal(carry(false, '2026-03'), 50);
 assert.equal(fundOf().rolloverNegative, true, 'existing funds keep carrying overspending');
 const [row] = budgetRows([fundOf({ rollover_negative: true })], amounts, history, '2026-02', 'USD', rates);
 assert.equal(row.remaining, -150);
 assert.equal(remainingTone(row.remaining), 'negative');
});

test('turning rollover off stops the carry and drops the fund details', () => {
 const off = fundOf({ rollover: false, rollover_balance: 500, rollover_currency: 'USD' });
 assert.deepEqual([off.rollover, off.rolloverStart, off.rolloverBalance], [false, null, 0]);
 assert.equal(rolloverBalance(off, [amount('Charity', '2026-01', 100, true)], spentEach({ '2026-01': { Charity: 10 } }), '2026-03', 'USD', rates), 0);
 assert.equal(rolloverCarry({ rollover: true, rolloverStart: null, rolloverNegative: true }, '2026-03', 5, () => 1, () => 0), 0, 'no start month, no carry');
 assert.equal(fundOf({}, 'Salary').rollover, false, 'income never rolls over');
});

test('rollover in other currencies converts with explicit rates only', () => {
 const history = spentEach({ '2026-01': { Charity: 2 } });
 // 125,000 UZS at 12,500 is $10: $8 left over, plus a 250,000 UZS ($20) starting balance.
 const uzs = fundOf({ rollover_balance: 250000, rollover_currency: 'UZS' });
 assert.equal(rolloverBalance(uzs, [amount('Charity', '2026-01', 125000, true, 'UZS')], history, '2026-02', 'USD', rates), 28);
 assert.equal(startingBalanceIn(uzs, 'UZS', rates), 250000);
 // Without a rate neither the starting balance nor the budget is guessed.
 const eur = fundOf({ rollover_balance: 50, rollover_currency: 'EUR' });
 assert.equal(startingBalanceIn(eur, 'USD', rates), 0);
 assert.equal(rolloverBalance(eur, [amount('Charity', '2026-01', 10, true, 'EUR')], history, '2026-02', 'USD', rates), -2);
});

test('the Flexible bucket rolls over its plan minus all flexible spending', () => {
 const bucket = flexBucketCategory([fundSetting(flexBucketKey, { rollover_negative: false, rollover_balance: 30, rollover_currency: 'USD' })]);
 assert.deepEqual([bucket.key, bucket.rollover, bucket.rolloverBalance, bucket.rolloverNegative], [flexBucketKey, true, 30, false]);
 assert.equal(flexBucketCategory([]).rollover, false);
 const categories = budgetCategories([], [fundSetting('Charity', { rollover: false, rollover_start: null, excluded: true })]);
 const history = spentEach({ '2026-01': { 'Living expense': 300, 'Other expense': 100, Charity: 999, 'Rent expense': 1200 }, '2026-02': { 'Living expense': 900 } });
 // January: a saved bucket of 500 − 400 flexible spending (rent is fixed, Charity excluded) = +100, plus 30.
 const amounts = [amount(flexBucketKey, '2026-01', 500, true), amount('Living expense', '2026-01', 50, true)];
 assert.equal(flexBucketRollover(bucket, categories, amounts, history, '2026-02', 'USD', rates), 130);
 // February overspends what it has: without negative carry, March starts at zero.
 assert.equal(flexBucketRollover(bucket, categories, amounts, history, '2026-03', 'USD', rates), 0);
 // Before a bucket amount is saved, its plan is the sum of the flexible categories' budgets.
 assert.equal(flexBucketPlan([amount('Living expense', '2026-01', 50, true), amount('Other expense', '2026-01', 20, true), amount('Rent expense', '2026-01', 900, true)], categories, '2026-01', 'USD', rates), 70);
});
