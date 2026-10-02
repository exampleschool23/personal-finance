import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { periodMonths, cashFlowReport, sankeyFlows, trailingMonths } = loadTS('lib/cash-flow-report.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });

test('report periods cover the calendar month, quarter or year up to the chosen month', () => {
 assert.deepEqual(periodMonths('2026-08', 'month'), ['2026-08']);
 assert.deepEqual(periodMonths('2026-08', 'quarter'), ['2026-07', '2026-08']);
 assert.deepEqual(periodMonths('2026-03', 'quarter'), ['2026-01', '2026-02', '2026-03']);
 assert.deepEqual(periodMonths('2026-03', 'year'), ['2026-01', '2026-02', '2026-03']);
 assert.deepEqual(trailingMonths('2026-03', 3), ['2026-01', '2026-02', '2026-03']);
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
 assert.deepEqual(report.series, [{ month: '2026-07', income: 0, expenses: 400 }, { month: '2026-08', income: 3100, expenses: 1600 }]);
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
