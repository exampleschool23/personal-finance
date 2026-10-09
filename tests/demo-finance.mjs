import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { demoRecords, demoHistory, demoMarket, demoBenchmarkKeys, demoWorkspace } = loadTS('lib/demo-finance.ts');
const { financialTotals } = loadTS('lib/finance.ts');
const { investmentGoalProgress } = loadTS('lib/investment-goals.ts');
const { investmentDecisionComparison } = loadTS('lib/investment-benchmarks.ts');
const { investmentPeriodTotals } = loadTS('lib/investment-period.ts');
const { portfolioHistory, portfolioWindow } = loadTS('lib/portfolio-history.ts');
const { shiftDay } = loadTS('lib/calendar-days.ts');
const today = '2026-09-24';
// Mock feed data belongs only in tests; production demo requests the real API.
const benchmarkFixture = day => {
 const start=shiftDay(day,-365);
 const series=(opening,gain)=>Array.from({length:366},(_,index)=>({date:shiftDay(start,index),close:opening+gain*index/365}));
 return {start,end:day,prices:{BTC:series(52000,8000),SPY:series(480,80),BIL:series(88,3.8)},fx:[{date:start,rates:demoMarket.rates}],errors:{}};
};
const records = demoRecords(today);
const history = demoHistory(records, today);
const input = { ...history, today, market: demoMarket, currency: 'USD' };
const compare = (currency, data) => investmentDecisionComparison({ ...input, currency, method: { mode: 'purchases', date: shiftDay(today, -365) } }, data);

test('demo has a year of funded history, receipts and expenses in all chart windows', () => {
 const comparison = compare('USD', benchmarkFixture(today));
 assert.ok(comparison, 'No holding or exchange rate is missing');
 assert.deepEqual(comparison.missingPurchases, []);
 const chart = comparison.result.points;
 assert.ok(chart.at(-1).actual > 0);
 assert.equal(chart[0].date, shiftDay(today, -365));
 assert.equal(chart.at(-1).date, today);
 const netWorth = portfolioHistory(history.records, history.events, 'USD', demoMarket.rates, today, true);
 assert.equal(netWorth.points[0].date, shiftDay(today, -365));
 for (const days of [30, 90, 365, null]) {
  assert.ok(portfolioWindow(netWorth.points, days, today).length > 1);
  assert.ok(chart.filter(point => days === null || point.date >= shiftDay(today, -days)).length > 1);
 }
 const totals = investmentPeriodTotals(input, '0000-01-01');
 assert.ok(totals.invested > 0);
 assert.ok(totals.income > 0);
 assert.ok(totals.expenses > 0);
 assert.deepEqual(totals.missing, []);
 assert.equal(records.find(row => row.id === 'demo-deposit-usd').rate, 4.6);
});

test('BTC, S&P and deposit comparisons accept provider data and preserve currency precision', () => {
 const data = benchmarkFixture(today);
 const usd = compare('USD', data).result;
 const uzs = compare('UZS', data).result;
 assert.ok(usd.points.length > 365);
 for (const key of ['actual', ...demoBenchmarkKeys, 'depositUZS']) {
  assert.ok(usd.points.every(point => Number.isFinite(point[key])), key);
  assert.notEqual(usd.points[0][key], usd.points.at(-1)[key]);
  for (let i = 0; i < usd.points.length; i++) assert.ok(Math.abs(uzs.points[i][key] / 12500 - usd.points[i][key]) < 1e-8);
 }
 assert.equal(compare('EUR', data), null, 'No inferred exchange rate');
});

test('demo fixtures do not mutate records, leak removed holdings or add history to new records', () => {
 const before = structuredClone(records);
 demoHistory(records, today);
 assert.deepEqual(records, before);
 const edited = records.filter(row => row.id !== 'demo-btc');
 edited.push({ ...records[0], id: 'new-user-investment', kind: 'Business' });
 const changed = demoHistory(edited, today);
 assert.ok(changed.events.every(event => event.record_id !== 'demo-btc' && event.record_id !== 'new-user-investment'));
 assert.equal(demoHistory([], today).events.length, 0);
 const fresh = demoRecords(today);
 fresh[0].amount = 0;
 assert.equal(demoRecords(today)[0].amount, 14200, 'Each demo starts independently');
 const changedCurrency = records.map(row => ({ ...row, currency: 'EUR' }));
 assert.equal(demoHistory(changedCurrency, today).events.length, 0);
});

test('sample dates stay valid across leap years and roll forward with the visit', () => {
 for (const day of ['2024-02-29', '2027-01-01']) {
  const sample = demoHistory(demoRecords(day), day);
  assert.ok(sample.events.every(event => event.occurred_on <= day && event.occurred_on >= shiftDay(day, -365)));

 }
});

test('the sample workspace is a seven-figure household with a $180K mortgage', () => {
 const workspace = demoWorkspace(today);
 assert.equal(workspace.today, today);
 const { netWorth, totalDebt } = financialTotals(workspace.records);
 assert.ok(netWorth > 1000000 && netWorth < 1500000, String(netWorth));
 const mortgage = workspace.records.filter(row => row.kind === 'Mortgage');
 assert.equal(mortgage.length, 1);
 assert.ok(mortgage[0].amount >= 170000 && mortgage[0].amount <= 190000);
 assert.ok(totalDebt > mortgage[0].amount, 'other debts are listed too');
 const kinds = new Set(workspace.records.map(row => row.kind));
 for (const kind of ['Cash', 'Stock', 'Crypto', 'Treasury bill', 'Deposit', 'Property', 'Business', 'Salary', 'Other income', 'Living expense', 'Other expense', 'Charity', 'Loan', 'Debt']) assert.ok(kinds.has(kind), kind);
 assert.ok(workspace.records.filter(row => row.kind === 'Property').length >= 2);
 assert.equal(new Set(workspace.records.map(row => row.id)).size, workspace.records.length, 'ids are unique');
 // Holdings belong to accounts that exist.
 const accounts = new Set(workspace.holdingAccounts.map(account => account.id));
 assert.ok(workspace.records.filter(row => ['Stock', 'Crypto'].includes(row.kind)).every(row => accounts.has(row.holding_account_id)));
 // Groceries and household spending sit in sample categories that carry their own budget.
 const categories = new Set(workspace.categories.map(category => category.id));
 assert.ok(categories.has('demo-cat-groceries') && categories.has('demo-cat-household'));
 assert.ok(workspace.records.filter(row => row.custom_category_id).every(row => categories.has(row.custom_category_id)));
 assert.ok(workspace.records.some(row => row.custom_category_id === 'demo-cat-groceries'));
});

test('sample goals include paying down the mortgage and track real holdings', () => {
 const { goals, records, holdingAccounts } = demoWorkspace(today);
 const cash = new Set(records.filter(row => row.kind === 'Cash').map(row => row.id));
 assert.ok(goals.some(goal => /mortgage/i.test(goal.name)));
 for (const goal of goals.filter(goal => goal.kind === 'savings')) assert.ok(cash.has(goal.account_id) && goal.allocated <= goal.target);
 const savings = records.find(row => row.id === 'demo-savings');
 assert.ok(goals.filter(goal => goal.account_id === savings.id).reduce((sum, goal) => sum + goal.allocated, 0) <= savings.amount, 'reserved money exists');
 assert.ok(goals.every(goal => goal.target_date > today));
 const bitcoin = goals.find(goal => goal.kind === 'investment');
 const progress = investmentGoalProgress(bitcoin, { records, holdingAccounts });
 assert.ok(progress && progress.current > 0 && progress.current < bitcoin.target);
});

test('sample history shows homes appreciating and the mortgage shrinking', () => {
 const history = demoHistory(records, today);
 const balances = id => history.events.filter(event => event.record_id === id && event.balance !== null).map(event => event.balance);
 for (const id of ['demo-home', 'demo-condo']) assert.ok(balances(id).at(-1) > balances(id)[0], id);
 assert.ok(balances('demo-studio').at(-1) < balances('demo-studio')[0], 'not every property rises');
 assert.ok(balances('demo-mortgage').at(-1) < balances('demo-mortgage')[0]);
 assert.ok(history.events.filter(event => event.record_id === 'demo-mortgage').every(event => event.event_type === 'valuation' && event.amount === 0), 'debts are not investments');
 const net = portfolioHistory(history.records, history.events, 'USD', demoMarket.rates, today, true).points;
 const { netWorth } = financialTotals(records);
 assert.ok(Math.abs(net.at(-1).net - netWorth) < 1, 'the chart ends at today\'s net worth');
 assert.ok(net[0].net < net.at(-1).net);
});

test('recurring sample bills and pay before today are settled, so nothing is overdue', () => {
 const { upcomingPayments } = loadTS('lib/planning.ts');
 const workspace = demoWorkspace(today);
 assert.ok(workspace.occurrences.length > 100, 'a year of settled history');
 const due = upcomingPayments(workspace.records, workspace.occurrences, today);
 assert.deepEqual(due.filter(item => item.overdue).map(item => item.key), []);
 assert.ok(due.some(item => item.record.kind === 'Mortgage') && due.some(item => item.record.kind === 'Salary'));
});

test('tracking cannot start before the first recorded investment', () => {
 const { effectiveTrackingStart, purchaseComparisonStart } = loadTS('lib/investment-benchmarks.ts');
 const history = demoHistory(records, today);
 const first = purchaseComparisonStart({ ...history, today }, 'investments');
 assert.equal(first, shiftDay(today, -365));
 // A date before the sample history (such as 1 September 2023) compares from the first investment day.
 assert.equal(effectiveTrackingStart('2023-09-01', first, today), first);
 const comparison = investmentDecisionComparison({ ...input, currency: 'USD', method: { mode: 'date', date: effectiveTrackingStart('2023-09-01', first, today), scope: 'investments' } }, benchmarkFixture(today));
 assert.ok(comparison, 'the comparison is complete');
 assert.equal(effectiveTrackingStart(shiftDay(today, -30), first, today), shiftDay(today, -30));
 assert.equal(effectiveTrackingStart(null, first, today), null);
 assert.equal(effectiveTrackingStart(shiftDay(today, 1), first, today), null);
});
