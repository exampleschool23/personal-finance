import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, hostModule, language, text } from './helpers/component-tree.mjs';
const { formatMonthYear } = loadTS('lib/format.ts');
const { periodMonths, partialBar, cashFlowReport, sankeyFlows, trendMonths, trendBarsBy, topShares, otherShareKey } = loadTS('lib/cash-flow-report.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });

test('report periods cover the calendar month, quarter or year up to the chosen month', () => {
 assert.deepEqual(periodMonths('2026-08', 'month'), ['2026-08']);
 assert.deepEqual(periodMonths('2026-08', 'quarter'), ['2026-07', '2026-08']);
 assert.deepEqual(periodMonths('2026-03', 'quarter'), ['2026-01', '2026-02', '2026-03']);
 assert.deepEqual(periodMonths('2026-03', 'year'), ['2026-01', '2026-02', '2026-03']);
 assert.deepEqual(trendMonths('2026-03', 'month'), ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
});

test('the income and spending chart follows the period: twelve months, four quarters or two years', () => {
 assert.equal(trendMonths('2026-10', 'quarter')[0], '2026-01', 'three whole quarters before the current one');
 assert.equal(trendMonths('2026-10', 'year')[0], '2025-01', 'the whole year before the current one');
 assert.ok(trendMonths('2026-12', 'year').length <= 24, 'inside what the planning read allows');
 assert.equal(trendMonths('2026-10', 'year').at(-1), '2026-10', 'never past the chosen month');
 const series = trendMonths('2026-10', 'quarter').map((month, index) => ({ month, income: 100, expenses: index, missing: 0 }));
 assert.deepEqual(trendBarsBy(series, 'quarter'), [{ period: '2026-Q1', income: 300, expenses: 3, missing: 0 }, { period: '2026-Q2', income: 300, expenses: 12, missing: 0 }, { period: '2026-Q3', income: 300, expenses: 21, missing: 0 }, { period: '2026-Q4', income: 100, expenses: 9, missing: 0 }]);
 assert.deepEqual(trendBarsBy(series, 'year'), [{ period: '2026', income: 1000, expenses: 45, missing: 0 }]);
 assert.equal(trendBarsBy(series, 'month').length, 10);
});

test('cash flow totals, savings rate and shares by category and merchant, in the display currency', () => {
 const data = { categories: [{ id: 'tips', name: 'Tips', direction: 'income' }, { id: 'pets', name: 'Pets', direction: 'expense' }], activity: [], investmentLinks: [], records: [
  record('a', 'Payroll', 'Salary', 3000, '2026-08-05'), record('b', 'Cafe', 'Other income', 100, '2026-08-07', { custom_category_id: 'tips' }),
  record('c', 'Market', 'Living expense', 600, '2026-08-08'), record('d', 'Market', 'Living expense', 400, '2026-07-08'), record('e', 'Vet', 'Other expense', 12500000, '2026-08-09', { currency: 'UZS', custom_category_id: 'pets' }),
  record('f', 'Later', 'Living expense', 999, '2026-08-30'), record('g', 'Plan', 'Living expense', 50, '2026-08-01', { frequency: 'Monthly' }),
 ] };
 const report = cashFlowReport(data, [], ['2026-07', '2026-08'], 'USD', '2026-08-20', { USD: 1, UZS: 12500 });
 assert.equal(report.income, 3100);assert.equal(report.expenses, 2000);assert.equal(report.savings, 1100);
 assert.ok(Math.abs(report.savingsRate - 1100 / 3100 * 100) < 1e-9);
 assert.deepEqual(report.series, [{ month: '2026-07', income: 0, expenses: 400, missing: 0 }, { month: '2026-08', income: 3100, expenses: 1600, missing: 0 }]);
 assert.deepEqual(report.categories.income.map(item => item.key), ['Salary', 'tips']);
 assert.deepEqual(report.categories.expense.map(item => [item.key, item.amount]), [['pets', 1000], ['Living expense', 1000]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
 assert.deepEqual(report.merchants.expense.map(item => [item.key, item.amount]), [['Market', 1000], ['Vet', 1000]]);
 assert.equal(report.merchants.expense.reduce((sum, item) => sum + item.share, 0), 1);
 assert.equal(cashFlowReport({ ...data, records: [] }, [], ['2026-08'], 'USD', '2026-08-20', {}).savingsRate, null, 'no income, no rate');
 const euro = cashFlowReport({ ...data, records: [record('x', 'X', 'Salary', 5, '2026-08-01', { currency: 'EUR' })] }, [], ['2026-08'], 'USD', '2026-08-20', { USD: 1 });
 assert.equal(euro.income, 0);assert.equal(euro.missing, 1, 'no inferred exchange rate');
});

test('the Sankey flows income sources into one total and out to spending and savings, folding small flows into Other', () => {
 const report = { savings: 300, categories: { income: [{ key: 'Salary', amount: 1000 }], expense: [{ key: 'A', amount: 400 }, { key: 'B', amount: 200 }, { key: 'C', amount: 60 }, { key: 'D', amount: 40 }] } };
 const flows = sankeyFlows(report, key => key, 3);
 assert.deepEqual(flows.nodes.map(node => [node.name, node.kind]), [['Salary', 'income'], ['Income', 'total'], ['A', 'expense'], ['B', 'expense'], ['Other expense', 'expense'], ['Savings', 'savings']]);
 assert.deepEqual(flows.links, [{ source: 0, target: 1, value: 1000 }, { source: 1, target: 2, value: 400 }, { source: 1, target: 3, value: 200 }, { source: 1, target: 4, value: 100 }, { source: 1, target: 5, value: 300 }]);
 assert.ok(!sankeyFlows({ ...report, savings: -50 }, key => key).nodes.some(node => node.kind === 'savings'), 'no savings node when spending exceeds income');
});

test('a breakdown names the largest ten and folds the rest into one Other share, so its rows add up to the total', () => {
 // 2026-10-08: the Spending donut listed ten merchants, UZS 74,347,757 of a UZS 75,347,758 total, and dropped the rest.
 const amounts = [18363290, 18000000, 10800000, 6000000, 6000000, 6000000, 3000000, 2500000, 2361838, 1322629, 600000, 400001];
 const total = amounts.reduce((sum, amount) => sum + amount, 0);
 const items = amounts.map((amount, index) => ({ key: 'm' + index, amount, share: amount / total }));
 const shown = topShares(items);
 assert.equal(shown.length, 11);
 assert.deepEqual(shown.slice(0, 10).map(item => item.key), items.slice(0, 10).map(item => item.key));
 assert.deepEqual([shown[10].key, shown[10].amount, shown[10].share.toFixed(6)], [otherShareKey, 1000001, (1000001 / total).toFixed(6)]);
 assert.equal(shown.reduce((sum, item) => sum + item.amount, 0), total);
 assert.equal(shown.reduce((sum, item) => sum + item.share, 0).toFixed(6), '1.000000');
 assert.deepEqual(topShares(items.slice(0, 10)), items.slice(0, 10), 'ten or fewer need no Other');
 assert.notEqual(otherShareKey, 'other', 'a merchant named "other" stays its own row');
});

test('a bar or month with an amount that could not be converted is missing, never too low', () => {
 // /cr 2026-10-09 MONEY-008: one EUR income with no EUR rate made the Cash flow tiles and bars silently too low.
 const series = [{ month: '2026-07', income: 100, expenses: 10, missing: 0 }, { month: '2026-08', income: 0, expenses: 5, missing: 1 }, { month: '2026-09', income: 50, expenses: 1, missing: 0 }];
 assert.deepEqual(trendBarsBy(series, 'month').map(bar => [bar.period, bar.income, bar.expenses]), [['2026-07', 100, 10], ['2026-08', null, null], ['2026-09', 50, 1]]);
 assert.deepEqual(trendBarsBy(series, 'quarter'), [{ period: '2026-Q3', income: null, expenses: null, missing: 1 }], 'the whole quarter is unknown');
 const data = { categories: [], activity: [], investmentLinks: [], records: [record('u', 'Pay', 'Salary', 100, '2026-07-02'), record('x', 'Bonus', 'Salary', 5, '2026-08-01', { currency: 'EUR' })] };
 const report = cashFlowReport(data, [], ['2026-07', '2026-08'], 'USD', '2026-08-20', { USD: 1 });
 assert.deepEqual(report.series.map(item => item.missing), [0, 1]);
 assert.deepEqual(trendBarsBy(report.series, 'month').map(bar => bar.income), [100, null]);
});

test('the last quarter or year bar is "to date" while it is not over, so it is never read as a whole period', () => {
 assert.equal(partialBar('2026-10', 'quarter', '2026-10-09'), '2026-Q4');
 assert.equal(partialBar('2026-10', 'year', '2026-10-09'), '2026');
 assert.equal(partialBar('2026-08', 'quarter', '2026-10-09'), '2026-Q3', 'September is still to come in the chosen quarter');
 assert.equal(partialBar('2026-09', 'quarter', '2026-10-09'), null, 'a past quarter is whole');
 assert.equal(partialBar('2025-12', 'year', '2026-10-09'), null);
 assert.equal(partialBar('2026-12', 'quarter', '2026-12-31'), '2026-Q4', 'the current month runs until the day is over');
 assert.equal(partialBar('2026-10', 'month', '2026-10-09'), '2026-10');
 assert.equal(partialBar('2026-09', 'month', '2026-10-09'), null);
});

test('Cash flow shows its four tiles for a month, and a dash with the shared note where an amount could not be converted', () => {
 const r = createRenderer();
 const modules = {
  'recharts': hostModule(), '@/components/language-provider': language('en-US'),
  ...Object.fromEntries(['stat-tile', 'segmented', 'panel-title', 'inline-error', 'loading-placeholder'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
  '@/components/category-icons-context': { useCategoryHue: () => key => key },
  '@/hooks/use-owner-resource': { useOwnerResource: () => ({ data: { records: [] } }) },
  '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }) },
 };
 const { CashFlowReport } = r.load('components/cash-flow-report.tsx', modules);
 const { depositToday } = loadTS('lib/deposit-interest.ts');
 const month = depositToday().slice(0, 7);
 const open = (records, market) => r.mount(React.createElement(CashFlowReport, { owner: null, demo: true, revision: 0, data: { categories: [], activity: [], investmentLinks: [], records }, splits: [], month, currency: 'USD', market }));
 const tiles = () => r.all(node => node.type === 'StatTile').map(node => [node.props.label, node.props.value]);
 const note = () => r.all(node => node.type === 'p' && node.props.className === 'partial-total');
 open([record('a', 'Pay', 'Salary', 1000, month + '-01'), record('b', 'Shop', 'Living expense', 250, month + '-01')], { rates: { USD: 1 }, quotes: {} });
 // d8226de: the Month view lost its tiles.
 assert.deepEqual(tiles(), [['Income', '$1,000'], ['Expenses', '$250'], ['Total savings', '$750'], ['Savings rate', '75%']]);
 assert.equal(note().length, 0);
 const tooltip = r.find(node => node.type === 'Tooltip' && node.props.labelFormatter);
 assert.equal(tooltip.props.labelFormatter(month), formatMonthYear(month, 'en-US') + ' to date', 'the running month is to date');
 assert.equal(tooltip.props.formatter(null, 'Income')[0], '—');
 open([record('a', 'Pay', 'Salary', 1000, month + '-01'), record('x', 'Bonus', 'Salary', 5, month + '-01', { currency: 'EUR' })], { rates: { USD: 1 }, quotes: {} });
 assert.deepEqual(tiles(), [['Income', '—'], ['Expenses', '—'], ['Total savings', '—'], ['Savings rate', '—']], 'never $1,000 as if complete');
 assert.equal(text(note()), 'Some transactions could not be converted. Current or previous month totals are incomplete.');
 assert.deepEqual(r.find(node => node.type === 'BarChart').props.data.at(-1).income, null, 'the bar is missing, not too low');
});

test('the PDF budget actual follows Budget: a split counts in its own categories, a mortgage payment its interest', () => {
 // /cr 2026-10-09 DRY-001: the PDF counted the whole $100 food record although $40 of it was split to home.
 const { budgetFigures, reportLedger } = loadTS('lib/report-figures.ts');
 const { monthActuals } = loadTS('lib/budget.ts');
 const rows = [
  { id: 'r1', name: 'Shop', kind: 'Living expense', currency: 'USD', amount: 100, date: '2026-08-04', frequency: 'Once', custom_category_id: 'food' },
  { id: 'r2', name: 'Lunch', kind: 'Living expense', currency: 'EUR', amount: 10, date: '2026-08-05', frequency: 'Once', custom_category_id: 'food' },
  { id: 'm', name: 'Mortgage', kind: 'Other expense', currency: 'USD', amount: 1000, date: '2026-08-06', frequency: 'Once', mortgage_payment_id: 'a1', payment_interest: 300, payment_principal: 700 },
 ];
 const tables = { finance_records: rows, transaction_splits: [{ record_id: 'r1', position: 0, category_id: 'food', amount: 60 }, { record_id: 'r1', position: 1, category_id: 'home', amount: 40 }] };
 const ledger = reportLedger(tables), period = { month: '2026-08', today: '2026-08-20' };
 const market = { rates: { USD: 1, EUR: 0.5 }, quotes: {} };
 const budget = key => ({ category_key: key, month: '2026-08', amount: 500, currency: 'USD', applies_forward: false });
 const budgetActuals = monthActuals({ records: ledger.records, activity: [], investmentLinks: [] }, ledger.splits, '2026-08', 'USD', '2026-08-20', market.rates);
 for (const key of ['food', 'home', 'Other expense']) {
  const figures = budgetFigures(budget(key), ledger, period, market);
  assert.equal(figures.actual, budgetActuals.byCategory.get(key) ?? 0, key + ' matches Budget');
  assert.equal(figures.remaining, 500 - figures.actual);
 }
 assert.deepEqual(['food', 'home', 'Other expense', 'travel'].map(key => budgetFigures(budget(key), ledger, period, market).actual), [80, 40, 300, 0], '$60 split plus EUR 10 ($20); the mortgage interest; nothing spent is zero');
 const noEuro = budgetFigures(budget('food'), ledger, period, { rates: { USD: 1 }, quotes: {} });
 assert.deepEqual([noEuro.actual, noEuro.remaining], [null, null], 'an amount with no rate leaves it unknown');
 const unsaved = reportLedger({ ...tables, finance_records: [{ ...rows[0], amount: '' }, ...rows.slice(1)] });
 assert.equal(budgetFigures(budget('home'), unsaved, period, market).actual, null, 'a split record without its amount leaves it unknown');
});
