import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { scheduledByCategory, firstRecentPayment, plannedIn, flexPlan, categoryBills, repeatBudgetAmount } = loadTS('lib/budget-schedules.ts');
const { appliesToFutureMonths, budgetAmountFor, setBudgetAmount, budgetCategories, monthActuals, budgetRows, budgetHistory, suggestedBudget, groupRows, sectionGroups, leftToBudget, flexBucketPlan: bucketPlan, budgetOverall, budgetRowsForMode, remainingTone, rolloverBalance, budgetReadRange, flexBucketKey, isUnbudgeted, knownPlan } = loadTS('lib/budget.ts');
const { demoBudget } = loadTS('lib/budget-demo.ts');
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
 const list = budgetCategories([{ id: 'c1', name: 'Pets', direction: 'expense' }, { id: 'c2', name: 'Tips', direction: 'income' }], [{ category_key: 'Living expense', budget_type: 'non_monthly', rollover: true, rollover_start: '2026-01', excluded: false }]);
 const by = key => list.find(item => item.key === key);
 assert.equal(by('Salary').direction, 'income');
 assert.equal(by('c2').direction, 'income');
 assert.equal(by('Rent expense').type, 'fixed');
 assert.equal(by('Charity').type, 'flexible');
 assert.equal(by('c1').group, 'Everyday spending');
 assert.equal(by('Living expense').type, 'non_monthly');
 assert.equal(by('Living expense').group, 'Future spending', 'a category\'s group follows its budget type');
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
 const categories = budgetCategories([], [{ category_key: 'Charity', budget_type: 'flexible', rollover: true, rollover_start: '2026-07', excluded: false }]);
 const history = new Map([['2026-07', { byCategory: new Map([['Charity', 10], ['Living expense', 300]]) }], ['2026-08', { byCategory: new Map([['Charity', 40]]) }], ['2026-09', { byCategory: new Map([['Charity', 5], ['Living expense', 120]]) }]]);
 const amounts = [amount('Charity', '2026-07', 25, true), amount('Living expense', '2026-09', 100), amount('Salary', '2026-09', 18000000, false, 'UZS')];
 const rows = budgetRows(categories, amounts, history, '2026-09', 'USD', rates);
 const by = key => rows.find(row => row.key === key);
 // July +15, August −15: nothing carried into September.
 assert.equal(by('Charity').rolloverIn, 0);
 assert.equal(rolloverBalance(categories.find(c => c.key === 'Charity'), { amounts: amounts, schedules: [] }, history, '2026-08', 'USD', rates), 15);
 assert.equal(by('Charity').remaining, 20);
 assert.equal(by('Living expense').remaining, -20);
 assert.equal(remainingTone(by('Living expense').remaining), 'negative');
 assert.equal(by('Salary').budget, 1440);
 assert.equal(by('Rent expense').budget, 0);
 assert.ok(isUnbudgeted(by('Rent expense')));
 assert.equal(by('Living expense').progress, 1.2);
 const pastHistory = budgetHistory('Living expense', '2026-10', history);
 assert.deepEqual(pastHistory.months.map(m => m.month), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], 'six bars ending with the edited month');
 assert.equal(pastHistory.lastMonth, 120);
 assert.equal(pastHistory.average, 70, 'the average covers the six complete months before');
 assert.deepEqual(pastHistory.months.map(m => m.planned), [null, null, null, null, null, null]);
 const withCurrent = new Map([...history, ['2026-10', { byCategory: new Map([['Living expense', 45], ['Charity', 7]]) }]]);
 const planned = budgetHistory('Living expense', '2026-10', withCurrent, month => month >= '2026-09' ? 100 : 0);
 assert.deepEqual(planned.months.slice(-2), [{ month: '2026-09', amount: 120, planned: 100 }, { month: '2026-10', amount: 45, planned: 100 }], 'the edited month shows its actuals so far and each month its plan');
 assert.equal(planned.average, 70, 'the month in progress never moves the average');
 const summed = budgetHistory(['Living expense', 'Charity'], '2026-10', withCurrent);
 assert.deepEqual(summed.months.map(m => m.amount), [0, 0, 310, 40, 125, 52], 'several keys are summed');
 assert.equal(summed.lastMonth, 125);
 assert.equal(suggestedBudget(70.01), 71, 'suggestions are whole and rounded up');
 assert.equal(suggestedBudget(70), 70);
 assert.equal(suggestedBudget(0), 0);
 assert.equal(budgetRows(categories, [amount('X', '2026-09', 5, false, 'EUR')], history, '2026-09', 'USD', rates).find(r => r.key === 'X'), undefined);
 const euroRow = budgetRows(budgetCategories([{ id: 'X', name: 'X', direction: 'expense' }], []), [amount('X', '2026-09', 5, false, 'EUR')], history, '2026-09', 'USD', rates).find(r => r.key === 'X');
 assert.equal(euroRow.budget, null, 'a budget in an unconvertible currency is unknown, not zero');
 assert.equal(euroRow.remaining, null);
});

test('left to budget: income minus spending and contributions; flex replaces flexible categories with one amount', () => {
 const categories = budgetCategories([], [{ category_key: 'Other expense', budget_type: 'non_monthly', rollover: false, rollover_start: null, excluded: false }, { category_key: 'Charity', budget_type: 'flexible', rollover: false, rollover_start: null, excluded: true }]);
 const amounts = [amount('Salary', '2026-09', 3000), amount('Rent expense', '2026-09', 1200), amount('Living expense', '2026-09', 300), amount('Other expense', '2026-09', 100), amount('Charity', '2026-09', 999), amount(flexBucketKey, '2026-09', 800)];
 const rows = budgetRows(categories, amounts, new Map(), '2026-09', 'USD', rates);
 const category = leftToBudget(rows, 'category', null, 250);
 assert.deepEqual(category, { income: 3000, expenses: 1600, contributions: 250, left: 1150, flexible: null, missing: 0 });
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
 // The page lists each side's categories in one card without group headings; in flex mode the bucket keeps its own.
 const sections = sectionGroups(rows, false);
 assert.deepEqual(sections.map(group => [group.direction, group.type]), [['income', null], ['expense', null]]);
 const spending = groupRows(rows, false).filter(group => group.direction === 'expense');
 assert.equal(sections[1].rows.length, spending.reduce((total, group) => total + group.rows.length, 0));
 assert.equal(sections[1].budget, spending.reduce((total, group) => total + group.budget, 0));
 assert.equal(sections[1].actual, spending.reduce((total, group) => total + group.actual, 0));
 assert.deepEqual(sectionGroups(rows, true).map(group => group.type), [null, null, 'flexible']);
 assert.deepEqual(sectionGroups([], true), []);
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
 const bucket = bucketPlan(before, categories, '2026-09', 'USD', rates);
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
 assert.deepEqual(left, { income: 1000, expenses: 500, contributions: 0, left: 500, flexible: 200, missing: 0 });
 // Once a bucket amount is saved it is the plan, whatever the categories had.
 const saved = [...before, amount(flexBucketKey, '2026-09', 450)];
 assert.equal(bucketPlan(saved, categories, '2026-09', 'USD', rates), 450);
 // Category mode is untouched.
 assert.deepEqual(budgetRowsForMode(rows, 'category'), rows);
});

const { rolloverCarry, startingBalanceIn, flexBucketCategory, flexBucketRollover, flexBucketPlan } = loadTS('lib/budget.ts');
const fundSetting = (category_key, extra = {}) => ({ category_key, budget_type: 'flexible', rollover: true, rollover_start: '2026-01', excluded: false, ...extra });
const fundOf = (extra, key = 'Charity') => budgetCategories([], [fundSetting(key, extra)]).find(category => category.key === key);
const spentEach = entries => new Map(Object.entries(entries).map(([month, byKey]) => [month, { byCategory: new Map(Object.entries(byKey)) }]));

test('rollover chains carry leftovers month to month from the start month and starting balance', () => {
 const history = spentEach({ '2026-01': { Charity: 60 }, '2026-02': { Charity: 140 }, '2026-03': { Charity: 100 }, '2026-04': { Charity: 0 } });
 const amounts = [amount('Charity', '2026-01', 100, true)];
 const carry = (category, month) => rolloverBalance(category, { amounts: amounts, schedules: [] }, history, month, 'USD', rates);
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
 const carry = (negative, month) => rolloverBalance(fundOf({ rollover_negative: negative }), { amounts, schedules: [] }, history, month, 'USD', rates);
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
 assert.equal(rolloverBalance(off, { amounts: [amount('Charity', '2026-01', 100, true)], schedules: [] }, spentEach({ '2026-01': { Charity: 10 } }), '2026-03', 'USD', rates), 0);
 assert.equal(rolloverCarry({ rollover: true, rolloverStart: null, rolloverNegative: true }, '2026-03', 5, () => 1, () => 0), 0, 'no start month, no carry');
 assert.equal(fundOf({}, 'Salary').rollover, false, 'income never rolls over');
});

test('rollover in other currencies converts with explicit rates only', () => {
 const history = spentEach({ '2026-01': { Charity: 2 } });
 // 125,000 UZS at 12,500 is $10: $8 left over, plus a 250,000 UZS ($20) starting balance.
 const uzs = fundOf({ rollover_balance: 250000, rollover_currency: 'UZS' });
 assert.equal(rolloverBalance(uzs, { amounts: [amount('Charity', '2026-01', 125000, true, 'UZS')], schedules: [] }, history, '2026-02', 'USD', rates), 28);
 assert.equal(startingBalanceIn(uzs, 'UZS', rates), 250000);
 // Without a rate neither the starting balance nor the budget is guessed.
 const eur = fundOf({ rollover_balance: 50, rollover_currency: 'EUR' });
 assert.equal(startingBalanceIn(eur, 'USD', rates), null, 'an unconvertible starting balance is unknown, not zero');
 assert.equal(rolloverBalance(eur, { amounts: [amount('Charity', '2026-01', 10, true, 'EUR')], schedules: [] }, history, '2026-02', 'USD', rates), null);
 assert.equal(rolloverBalance(fundOf(), { amounts: [amount('Charity', '2026-01', 10, true, 'EUR')], schedules: [] }, history, '2026-02', 'USD', rates), null, 'an unconvertible past budget leaves the carry unknown');
 const [row] = budgetRows([eur], [amount('Charity', '2026-01', 10, true)], history, '2026-02', 'USD', rates);
 assert.deepEqual([row.budget, row.rolloverIn, row.remaining, row.missing], [10, 0, null, true], 'the plan is known; what is available is not');
});

test('the Flexible bucket rolls over its plan minus all flexible spending', () => {
 const bucket = flexBucketCategory([fundSetting(flexBucketKey, { rollover_negative: false, rollover_balance: 30, rollover_currency: 'USD' })]);
 assert.deepEqual([bucket.key, bucket.rollover, bucket.rolloverBalance, bucket.rolloverNegative], [flexBucketKey, true, 30, false]);
 assert.equal(flexBucketCategory([]).rollover, false);
 const categories = budgetCategories([], [fundSetting('Charity', { rollover: false, rollover_start: null, excluded: true })]);
 const history = spentEach({ '2026-01': { 'Living expense': 300, 'Other expense': 100, Charity: 999, 'Rent expense': 1200 }, '2026-02': { 'Living expense': 900 } });
 // January: a saved bucket of 500 − 400 flexible spending (rent is fixed, Charity excluded) = +100, plus 30.
 const amounts = [amount(flexBucketKey, '2026-01', 500, true), amount('Living expense', '2026-01', 50, true)];
 assert.equal(flexBucketRollover(bucket, categories, { amounts, schedules: [] }, history, '2026-02', 'USD', rates), 130);
 // February overspends what it has: without negative carry, March starts at zero.
 assert.equal(flexBucketRollover(bucket, categories, { amounts, schedules: [] }, history, '2026-03', 'USD', rates), 0);
 // Before a bucket amount is saved, its plan is the sum of the flexible categories' budgets.
 assert.equal(flexBucketPlan([amount('Living expense', '2026-01', 50, true), amount('Other expense', '2026-01', 20, true), amount('Rent expense', '2026-01', 900, true)], categories, '2026-01', 'USD', rates), 70);
});

test('the overall line sums income and spending apart, actual and planned, and skips excluded categories', () => {
 const row = (direction, actual, budget, excluded = false) => ({ key: direction + actual, direction, actual, budget, excluded });
 assert.deepEqual(budgetOverall([row('income', 9150, 9150), row('income', 850, null), row('expense', 1482, 1400), row('expense', 1873, null), row('expense', 50, 100, true)]),
  { income: 10000, expenses: 3355, plannedIncome: 9150, plannedExpenses: 1400, missing: 0 });
 assert.deepEqual(budgetOverall([]), { income: 0, expenses: 0, plannedIncome: 0, plannedExpenses: 0, missing: 0 });
});

test('unconvertible budgets, buckets and contributions leave their totals unknown and are counted for the note', () => {
 const categories = budgetCategories([], []);
 const amounts = [amount('Salary', '2026-09', 3000), amount('Rent expense', '2026-09', 900, false, 'EUR'), amount('Living expense', '2026-09', 200)];
 const rows = budgetRows(categories, amounts, new Map(), '2026-09', 'USD', rates);
 const rent = rows.find(row => row.key === 'Rent expense');
 assert.deepEqual([rent.budget, rent.remaining, rent.missing, isUnbudgeted(rent)], [null, null, true, false], 'shown, as —, never hidden as unbudgeted');
 const left = leftToBudget(rows, 'category', null, 100);
 assert.deepEqual(left, { income: 3000, expenses: null, contributions: 100, left: null, flexible: null, missing: 1 });
 assert.equal(leftToBudget(rows.filter(row => row.key !== 'Rent expense'), 'category', null, null, 2).missing, 2, 'unconvertible contributions are counted');
 assert.equal(leftToBudget(rows.filter(row => row.key !== 'Rent expense'), 'category', null, null, 2).left, null);
 const fixed = groupRows(rows, true).find(group => group.type === 'fixed');
 assert.equal(fixed.missing, 1);
 assert.equal(budgetOverall(rows).missing, 1);
 // Flex mode: a bucket built from an unconvertible flexible budget is unknown too.
 const euroFlexible = [amount('Living expense', '2026-09', 50, false, 'EUR')];
 const flexRows = budgetRows(categories, euroFlexible, new Map(), '2026-09', 'USD', rates);
 assert.equal(flexBucketPlan(euroFlexible, categories, '2026-09', 'USD', rates), null);
 const flexLeft = leftToBudget(budgetRowsForMode(flexRows, 'flex'), 'flex', null, 0);
 assert.deepEqual([flexLeft.expenses, flexLeft.flexible, flexLeft.missing], [null, null, 1]);
 // A row's own plan: unknown only when its budget is; an unknown rollover alone keeps the plan (TEST-001).
 assert.deepEqual([knownPlan(rent), knownPlan({ missing: true, budget: 200 }), knownPlan({ missing: false, budget: null }), knownPlan({ missing: false, budget: 75 })], [null, 200, 0, 75]);
});

test('a rollover whose starting balance no rate converts is marked missing, so the settings dialog shows — rather than 0', () => {
 const setting = currency => ({ category_key: 'Charity', budget_type: 'flexible', rollover: true, rollover_start: '2026-08', excluded: false, rollover_balance: 50, rollover_currency: currency });
 const row = currency => budgetRows(budgetCategories([], [setting(currency)]), [amount('Charity', '2026-09', 100)], new Map(), '2026-09', 'USD', rates).find(r => r.key === 'Charity');
 const unknown = row('XYZ');
 assert.equal(unknown.rolloverMissing, true);assert.equal(unknown.rolloverIn, 0);assert.equal(unknown.remaining, null);
 const known = row('USD');
 assert.equal(known.rolloverMissing, false);assert.ok(known.rolloverIn > 0);
});

test('appliesToFutureMonths: a forward amount with no later month of its own', () => {
 const rows = [{ category_key: 'Rent', month: '2026-09', amount: 500, currency: 'USD', applies_forward: true }];
 assert.equal(appliesToFutureMonths(rows, 'Rent', '2026-09'), true);
 assert.equal(appliesToFutureMonths(rows, 'Rent', '2026-10'), true, 'an inherited forward amount carries on too');
 assert.equal(appliesToFutureMonths(rows, 'Rent', '2026-08'), false, 'no budget yet');
 assert.equal(appliesToFutureMonths(rows, 'Food', '2026-10'), false);
 const later = [...rows, { category_key: 'Rent', month: '2026-11', amount: 0, currency: 'USD', applies_forward: true }];
 assert.equal(appliesToFutureMonths(later, 'Rent', '2026-10'), false, 'a later month has its own amount');
 assert.equal(appliesToFutureMonths(setBudgetAmount(later, 'Rent', '2026-10', 500, 'USD', true), 'Rent', '2026-10'), true, 'applying forward replaces later months');
 assert.equal(appliesToFutureMonths(setBudgetAmount(rows, 'Rent', '2026-10', 600, 'USD', false), 'Rent', '2026-10'), false, 'a one-month change does not');
});

test('firstRecentPayment: the first payment of the unbroken run of months in a category reaching this month or last', () => {
 const pay = (date, extra = {}) => ({ id: date, kind: 'Other expense', custom_category_id: 'c1', frequency: 'Once', date, ...extra });
 const records = [pay('2026-05-03'), pay('2026-07-09', { kind: 'Living expense' }), pay('2026-08-05'), pay('2026-08-02', { custom_category_id: 'c2' }), pay('2026-09-06'), pay('2026-09-01', { movement_id: 'm' }), pay('2026-10-04'), pay('2026-10-12')];
 assert.equal(firstRecentPayment(records, 'c1', '2026-10-10'), '2026-07-09', 'any spending kind counts; May is cut off by June; transfers, other categories and future payments are left out');
 assert.equal(firstRecentPayment(records.filter(record => !record.date.startsWith('2026-10')), 'c1', '2026-10-10'), '2026-07-09', 'a run may end last month');
 assert.equal(firstRecentPayment([pay('2026-07-09')], 'c1', '2026-10-10'), null, 'an old payment starts nothing');
 assert.equal(firstRecentPayment([pay('2026-10-01', { occurrence_record_id: 's' })], 'c1', '2026-10-10'), null, 'a payment of another schedule is not counted');
 assert.equal(firstRecentPayment([pay('2026-10-01', { kind: 'Salary' })], 'c1', '2026-10-10'), null, 'income is not spending');
});

test('budgetRows: a category plans at least its recurring bills and incomes of the month', () => {
 const category = (key, direction = 'expense') => ({ key, name: key, custom: false, direction, type: 'fixed', group: 'Bills', excluded: false, rollover: false, rolloverStart: null, rolloverBalance: 0, rolloverCurrency: null, rolloverNegative: false });
 const bill = (id, fields) => ({ id, name: id, kind: 'Other expense', custom_category_id: 'gym', currency: 'USD', amount: 40, date: '2026-08-05', frequency: 'Monthly', ...fields });
 const schedules = [bill('gym'), bill('gym-2', { amount: 10 }), bill('once', { frequency: 'Once', amount: 999 }), bill('later', { date: '2026-12-01', amount: 500 }),
  bill('rent', { kind: 'Rent expense', custom_category_id: null, amount: 700 }), bill('eur', { custom_category_id: 'eur', currency: 'EUR' }), bill('pay', { kind: 'Salary', custom_category_id: null, amount: 3000 })];
 const scheduled = scheduledByCategory(schedules, '2026-10', 'USD', { USD: 1 });
 assert.deepEqual([...scheduled], [['gym', 50], ['Rent expense', 700], ['eur', null], ['Salary', 3000]], 'one-time and not yet started records are left out; a bill without a rate is unknown');
 const amounts = [{ category_key: 'Rent expense', month: '2026-10', amount: 900, currency: 'USD', applies_forward: true }];
 const rows = budgetRows([category('gym'), category('Rent expense'), category('eur'), category('Salary', 'income'), category('Charity')], amounts, new Map(), '2026-10', 'USD', { USD: 1 }, schedules);
 assert.deepEqual(rows.map(row => [row.key, row.budget, row.scheduled]), [['gym', 50, 50], ['Rent expense', 900, 700], ['eur', null, 0], ['Salary', 3000, 3000], ['Charity', 0, 0]], 'a larger budget already covers its bills');
 assert.equal(rows[2].missing, true);
 assert.equal(isUnbudgeted(rows[0]), false, 'a category with a bill is not hidden as unbudgeted');
});

test('flexPlanWithBills: the Flexible bucket plans at least the bills of its categories', () => {
 const { flexPlanWithBills: withBills } = loadTS('lib/budget-schedules.ts');
 const flexPlanWithBills = (plan, keys, schedules, month, currency, rates) => withBills(plan, keys, scheduledByCategory(schedules, month, currency, rates));
 const bill = (id, fields) => ({ id, name: id, kind: 'Living expense', custom_category_id: null, currency: 'USD', amount: 300, date: '2026-01-01', frequency: 'Monthly', ...fields });
 const schedules = [bill('food'), bill('fun', { custom_category_id: 'fun', amount: 100 }), bill('eur', { custom_category_id: 'eur', currency: 'EUR' })];
 assert.equal(flexPlanWithBills(200, ['Living expense', 'fun'], schedules, '2026-10', 'USD', { USD: 1 }), 400);
 assert.equal(flexPlanWithBills(900, ['Living expense', 'fun'], schedules, '2026-10', 'USD', { USD: 1 }), 900);
 assert.equal(flexPlanWithBills(900, ['eur'], schedules, '2026-10', 'USD', { USD: 1 }), null, 'a bill without a rate leaves the plan unknown');
 assert.equal(flexPlanWithBills(null, [], schedules, '2026-10', 'USD', { USD: 1 }), null);
});

test('MONEY-010: rollover, the Flexible bucket and History plan a month from its bills, as the rows do', () => {
 const category = budgetCategories([{ id: 'cat-rent', name: 'Rent', direction: 'expense' }], [fundSetting('cat-rent', { budget_type: 'fixed', rollover_start: '2026-08' })]).find(item => item.key === 'cat-rent');
 const bill = record('bill', 'Other expense', 500, '2026-08-01', { custom_category_id: 'cat-rent', frequency: 'Monthly' });
 const plan = { amounts: [], schedules: [bill] };
 const history = spentEach({ '2026-08': { 'cat-rent': 500 }, '2026-09': { 'cat-rent': 500 }, '2026-10': {} });
 assert.equal(plannedIn(plan, 'cat-rent', '2026-09', 'USD', rates), 500, 'nothing saved: the bill is the plan');
 assert.equal(plannedIn({ amounts: [amount('cat-rent', '2026-08', 900, true)], schedules: [bill] }, 'cat-rent', '2026-09', 'USD', rates), 900, 'a larger budget covers its bill');
 assert.equal(plannedIn({ amounts: [], schedules: [{ ...bill, currency: 'EUR' }] }, 'cat-rent', '2026-09', 'USD', rates), null, 'a bill without a rate leaves the plan unknown, never 0');
 assert.equal(plannedIn(plan, 'cat-rent', '2026-07', 'USD', rates), 0, 'before the bill starts nothing is planned');
 // Month by month: a bill paid in full rolls nothing over, and October has its plan to spend.
 for (const [month, remaining] of [['2026-08', 0], ['2026-09', 0], ['2026-10', 500]]) {
  const [row] = budgetRows([category], plan.amounts, history, month, 'USD', rates, plan.schedules);
  assert.deepEqual([row.budget, row.rolloverIn, row.remaining], [500, 0, remaining], month);
 }
 assert.equal(rolloverBalance(category, { amounts: [], schedules: [] }, history, '2026-09', 'USD', rates), -500, 'the saved amount alone would read the paid bill as overspent');
 const popover = budgetHistory('cat-rent', '2026-10', history, past => plannedIn(plan, 'cat-rent', past, 'USD', rates));
 assert.deepEqual(popover.months.map(item => item.planned), [0, 0, 0, 500, 500, 500], 'History shows each month the plan the rows showed');
 // Flex mode: the bucket plans at least its categories' bills and carries only what they left.
 const food = budgetCategories([{ id: 'cat-food', name: 'Food', direction: 'expense' }], []);
 const flexSource = { amounts: [], schedules: [{ ...bill, id: 'food', custom_category_id: 'cat-food', amount: 300 }] };
 const bucket = flexBucketCategory([fundSetting(flexBucketKey, { rollover_start: '2026-08' })]);
 const foodHistory = spentEach({ '2026-08': { 'cat-food': 300 }, '2026-09': {} });
 assert.equal(flexPlan(flexSource, food, '2026-08', 'USD', rates), 300);
 assert.equal(flexPlan({ amounts: [amount(flexBucketKey, '2026-08', 450, true)], schedules: flexSource.schedules }, food, '2026-08', 'USD', rates), 450, 'a larger bucket covers the bills');
 assert.equal(flexBucketRollover(bucket, food, flexSource, foodHistory, '2026-09', 'USD', rates), 0, 'August\'s bill, paid in full, carries nothing');
 assert.equal(flexBucketRollover(bucket, food, flexSource, foodHistory, '2026-10', 'USD', rates), 300, 'September planned the bill and spent nothing');
 assert.deepEqual(budgetHistory(['cat-food'], '2026-09', foodHistory, past => flexPlan(flexSource, food, past, 'USD', rates)).months.slice(-2).map(item => item.planned), [300, 300]);
});

test('categoryBills: the running bills of a category, as Recurring counts them; a paused or archived bill is not one (DRY-006)', () => {
 const bill = (id, fields) => record(id, 'Other expense', 40, '2026-01-01', { custom_category_id: 'gym', frequency: 'Monthly', ...fields });
 const records = [bill('gym'), bill('paused', { source_paused: true }), bill('old', { archived: true }), bill('once', { frequency: 'Once' }), bill('spa', { custom_category_id: 'spa' }),
  bill('rent', { kind: 'Rent expense', custom_category_id: null }), bill('pay', { kind: 'Salary', custom_category_id: null })];
 assert.deepEqual(categoryBills(records, 'gym').map(item => item.id), ['gym']);
 assert.deepEqual(categoryBills(records, 'Rent expense').map(item => item.id), ['rent'], 'a built-in kind takes the bills of its kind');
 assert.deepEqual(categoryBills(records, 'Salary'), [], 'income is not a bill');
 assert.deepEqual([...scheduledByCategory(records, '2026-10', 'USD', rates)], [['gym', 40], ['spa', 40], ['Rent expense', 40], ['Salary', 40]], 'a paused or archived schedule plans nothing');
});

test('repeatBudgetAmount: the tick is one change and one save; off, this month only and nothing after (BUD-027, CONC-008)', () => {
 const amounts = [amount('Groceries', '2026-03', 400, true), amount('Groceries', '2026-09', 999, true)];
 const ticked = repeatBudgetAmount('Groceries', '2026-06', 300, 'USD', true);
 assert.deepEqual(ticked.save, ['amount', { category_key: 'Groceries', month: '2026-06', amount: 300, currency: 'USD', applies_forward: true }]);
 assert.deepEqual(ticked.apply(amounts).map(item => [item.month, item.amount, item.applies_forward]), [['2026-03', 400, true], ['2026-06', 300, true]], 'later months are replaced');
 const off = repeatBudgetAmount('Groceries', '2026-06', 300, 'USD', false);
 assert.deepEqual(off.save, ['amount_once', { category_key: 'Groceries', month: '2026-06', amount: 300, currency: 'USD' }], 'one request, so a failure never leaves the budget half-changed');
 const next = off.apply(amounts);
 assert.deepEqual(next.map(item => [item.month, item.amount, item.applies_forward]), [['2026-03', 400, true], ['2026-06', 300, false], ['2026-07', 0, true]]);
 assert.equal(appliesToFutureMonths(next, 'Groceries', '2026-06'), false, 'the box reads unticked');
 assert.equal(budgetAmountFor(next, 'Groceries', '2026-08').amount, 0, 'later months plan nothing');
 assert.equal(budgetAmountFor(next, 'Groceries', '2026-05').amount, 400, 'earlier months keep their plan');
});
