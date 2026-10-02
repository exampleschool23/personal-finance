import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { reportLedger, filterLines, profitAndLoss, businessSankey, cashFlowTrend, attributeTrend, rangeFor, readableRange, intervalOf, businessNetAssets, drillMatches, sharesBy } = loadTS('lib/business-report.ts');
const { taxSheet, defaultTaxLine, taxLineFor, taxPeriodRange, taxExportRows, defaultTaxSettings } = loadTS('lib/business-tax.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const today = '2026-10-02';
const records = [
 record('salary', 'Payroll', 'Salary', 5000, '2026-09-01'),
 record('food', 'Market', 'Living expense', 800, '2026-09-03'),
 record('sale', 'Etsy payout', 'Other income', 1200, '2026-09-04', { business_id: 'candles', custom_category_id: 'sales' }),
 record('wax', 'CandleScience', 'Other expense', 1500.5, '2026-09-05', { business_id: 'candles', custom_category_id: 'supplies' }),
 record('rent', 'Airbnb', 'Rent income', 2600, '2026-09-06', { business_id: 'rentals' }),
 record('clean', 'Cleaning', 'Other expense', 400, '2026-09-07', { business_id: 'rentals' }),
 record('uzs', 'Cafe', 'Living expense', 125000, '2026-09-08', { currency: 'UZS' }),
 record('mortgage', 'Mortgage', 'Other expense', 1000, '2026-09-09', { mortgage_payment_id: 'm', payment_principal: 700, payment_interest: 300, business_id: 'rentals' }),
 record('split', 'Shop', 'Living expense', 100, '2026-09-10'),
 record('plan', 'Plan', 'Living expense', 99, '2026-09-01', { frequency: 'Monthly' }),
 record('future', 'Later', 'Living expense', 99, '2026-10-05'),
 record('old', 'Old', 'Living expense', 99, '2026-08-31'),
];
const splits = [{ record_id: 'split', position: 0, category_id: 'Living expense', amount: 60 }, { record_id: 'split', position: 1, category_id: 'Charity', amount: 40 }];
const range = { from: '2026-09-01', to: '2026-10-31' };

test('the report ledger counts recorded transactions in the range, splits their parts and counts mortgage interest only', () => {
 const { lines, missing } = reportLedger({ records, investmentLinks: [] }, splits, range, 'USD', today, { USD: 1, UZS: 12500 });
 assert.equal(missing, 0);
 assert.deepEqual(lines.map(line => line.id).sort(), ['clean', 'food', 'mortgage', 'rent', 'salary', 'sale', 'split:0', 'split:1', 'uzs', 'wax'].sort(), 'schedules, future and earlier rows are left out');
 assert.equal(lines.find(line => line.id === 'mortgage').amount, 300);
 assert.equal(lines.find(line => line.id === 'uzs').amount, 10);
 assert.equal(lines.find(line => line.id === 'wax').amount, 1500.5, 'precise amounts are kept');
 assert.equal(reportLedger({ records, investmentLinks: [] }, [], range, 'USD', today, { USD: 1 }).missing, 1, 'an unconvertible amount is counted, never guessed');
});

test('profit and loss rolls each business net income into total income beside household income', () => {
 const { lines } = reportLedger({ records, investmentLinks: [] }, splits, range, 'USD', today, { USD: 1, UZS: 12500 });
 const pnl = profitAndLoss(lines, ['candles', 'rentals'], line => line.category, true);
 const candles = pnl.businesses.find(item => item.id === 'candles'), rentals = pnl.businesses.find(item => item.id === 'rentals');
 assert.equal(candles.net, 1200 - 1500.5);
 assert.equal(rentals.net, 2600 - 400 - 300);
 assert.equal(pnl.household.incomeTotal, 5000);
 assert.equal(pnl.household.expenseTotal, 800 + 10 + 100);
 assert.equal(pnl.totalIncome, 5000 + candles.net + rentals.net);
 assert.equal(pnl.net, pnl.totalIncome - pnl.household.expenseTotal);
 const total = lines.reduce((sum, line) => sum + (line.direction === 'income' ? line.amount : -line.amount), 0);
 assert.ok(Math.abs(pnl.net - total) < 1e-9, 'the net equals income less all spending');
 // Only one business, without the household.
 const alone = profitAndLoss(filterLines(lines, ['rentals']), ['rentals'], line => line.category, false);
 assert.equal(alone.household, null);assert.equal(alone.net, rentals.net);
 assert.deepEqual(filterLines(lines, ['household']).map(line => line.business), filterLines(lines, ['household']).map(() => null));
});

test('the Sankey feeds a profit into household income and shows a loss leaving the household', () => {
 const { lines } = reportLedger({ records, investmentLinks: [] }, [], range, 'USD', today, { USD: 1, UZS: 12500 });
 const labels = { category: key => key, business: id => id, total: 'Income', savings: 'Savings', profit: 'Net profit', loss: name => `${name} net loss`, otherIncome: 'Other income', otherExpense: 'Other expense' };
 const data = businessSankey(profitAndLoss(lines, ['candles', 'rentals'], line => line.category, true), labels);
 const index = name => data.nodes.findIndex(node => node.name === name);
 const link = (from, to) => data.links.find(item => item.source === index(from) && item.target === index(to));
 assert.equal(link('rentals', 'Income').value, 1900);
 assert.equal(link('Income', 'candles net loss').value, 300.5);
 assert.equal(data.nodes[index('candles net loss')].kind, 'loss');
 assert.ok(link('sales', 'candles') && link('candles', 'supplies'));
 assert.ok(data.links.every(item => item.value > 0 && data.nodes[item.source] && data.nodes[item.target]));
 const alone = businessSankey(profitAndLoss(filterLines(lines, ['candles']), ['candles'], line => line.category, false), labels);
 assert.equal(alone.nodes[alone.links.find(item => alone.nodes[item.source].kind === 'loss').target].name, 'candles', 'without the household, the loss covers the business');
});

test('trends, shares, drill-downs, ranges and net assets', () => {
 const { lines } = reportLedger({ records, investmentLinks: [] }, [], { from: '2026-08-01', to: '2026-10-31' }, 'USD', today, { USD: 1, UZS: 12500 });
 const trend = cashFlowTrend(lines, { from: '2026-08-01', to: '2026-10-31' }, 'month');
 assert.deepEqual(trend.map(row => row.period), ['2026-08', '2026-09', '2026-10']);
 assert.equal(trend[0].expenses, 99);
 assert.deepEqual(cashFlowTrend(lines, { from: '2026-01-01', to: '2026-12-31' }, 'quarter').map(row => row.period), ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
 assert.equal(intervalOf('2026-09-30', 'quarter'), '2026-Q3');
 const spending = lines.filter(line => line.direction === 'expense');
 const byBusiness = attributeTrend(spending, { from: '2026-09-01', to: '2026-09-30' }, 'month', line => line.business ?? 'household', 2);
 assert.deepEqual(byBusiness.keys, ['candles', 'other']);
 assert.equal(sharesBy(spending, line => line.business ?? 'household').reduce((sum, item) => sum + item.share, 0).toFixed(6), '1.000000');
 assert.ok(drillMatches({ direction: 'expense', business: 'candles' }, lines.find(line => line.id === 'wax')));
 assert.ok(!drillMatches({ business: null }, lines.find(line => line.id === 'wax')));
 assert.ok(drillMatches({ categories: ['supplies'] }, lines.find(line => line.id === 'wax')));
 assert.deepEqual(rangeFor('last_month', today), { from: '2026-09-01', to: '2026-09-30' });
 assert.deepEqual(rangeFor('last_year', today), { from: '2025-01-01', to: '2025-12-31' });
 assert.equal(readableRange({ from: '2023-01-01', to: today }).from, '2024-11-01', 'reports read at most 24 months');
 const assets = businessNetAssets([record('acc', 'Checking', 'Cash', 900, '2026-01-01', { business_id: 'rentals' }), record('loan', 'Loan', 'Loan', 400, '2026-01-01', { business_id: 'rentals' }), { ...record('rentals', 'Rentals', 'Business', 1000, '2026-01-01'), ownership_percentage: 50 }, null, records[4]], ['rentals']);
 assert.deepEqual({ ...assets.byBusiness.get('rentals'), accounts: assets.byBusiness.get('rentals').accounts.map(item => item.id) }, { assets: 1400, debts: 400, net: 1000, accounts: ['acc', 'loan'] });
 assert.equal(assets.missing, 1);
});

test('tax prep maps categories to lines, lets the person move them, and exports whole lines', () => {
 const { lines } = reportLedger({ records, investmentLinks: [] }, [], range, 'USD', today, { USD: 1, UZS: 12500 });
 const candles = lines.filter(line => line.business === 'candles');
 const names = key => ({ sales: 'Product sales', supplies: 'Supplies', ads: 'Instagram ads' }[key] ?? key);
 assert.equal(defaultTaxLine('Rent expense', 'Rent expense'), 'rent_property');
 assert.equal(defaultTaxLine('Living expense', 'Living expense'), null, 'household categories stay off the sheet');
 assert.equal(defaultTaxLine('ads', 'Instagram ads'), 'advertising');
 assert.equal(defaultTaxLine('x', 'Gifts', 'expense'), null);
 assert.equal(defaultTaxLine('sales', 'Product sales', 'income'), 'gross_receipts');
 assert.equal(defaultTaxLine('bank', 'Bank interest', 'income'), 'other_income');
 assert.equal(taxLineFor('supplies', 'Supplies', 'expense', { template: 'general', lines: { supplies: 'gross_receipts' } }), null, 'a category never lands on a line of the other part');
 const sheet = taxSheet(candles, defaultTaxSettings, names);
 assert.equal(sheet.lines.find(item => item.line.id === 'gross_receipts').total, 1200);
 assert.equal(sheet.lines.find(item => item.line.id === 'supplies').total, 1500.5);
 assert.equal(sheet.net, 1200 - 1500.5);
 const moved = taxSheet(candles, { template: 'general', lines: { supplies: null } }, names);
 assert.deepEqual(moved.unmapped.map(item => item.key), ['supplies']);assert.equal(moved.net, 1200);
 const all = taxSheet(candles, defaultTaxSettings, names, [{ key: 'ads', direction: 'expense' }, { key: 'gifts', direction: 'expense' }]);
 assert.equal(all.lines.find(item => item.line.id === 'advertising').categories[0].amount, 0);
 assert.deepEqual(all.unmapped.map(item => item.key), ['gifts']);
 const rows = taxExportRows(sheet, 'schedule_c', 'transactions', text => text, names);
 assert.deepEqual(rows[0], { line: '1', description: 'Gross receipts or sales', category: '', date: '', amount: 1200 });
 assert.ok(rows.some(row => row.description === 'CandleScience' && row.amount === 1500.5 && row.date === '2026-09-05'));
 assert.equal(taxExportRows(sheet, 'general', 'lines', text => text, names).every(row => row.line === '' && !row.category), true);
 assert.deepEqual(taxPeriodRange(2026, 'q3'), { from: '2026-07-01', to: '2026-09-30' });
 assert.deepEqual(taxPeriodRange(2024, 'q1'), { from: '2024-01-01', to: '2024-03-31' });
});
