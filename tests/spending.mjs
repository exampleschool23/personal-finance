import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { spendingAmount, transferAmount } = loadTS('lib/spending.ts');
const { monthlyReview } = loadTS('lib/transaction-tools.ts');
const { cashFlowReport, sankeyFlows } = loadTS('lib/cash-flow-report.ts');
const { transactionsIn, summarizeTransactions, groupByDay, signedAmount, emptyTransactionFilter } = loadTS('lib/transaction-list.ts');
const { periodTotals } = loadTS('lib/period-summary.ts');
const { monthActuals, budgetCategories, budgetRows } = loadTS('lib/budget.ts');
const { spendingPace } = loadTS('lib/spending-pace.ts');
const { benchmarkExpenseFunding } = loadTS('lib/investment-benchmarks.ts');
const { watchlistSpending } = loadTS('lib/spending-watchlists.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });

// The October QA data: a $900 mortgage payment ($700 principal, $200 interest), a $350 car-loan
// repayment from a cash account with a $3 fee, $50 of groceries and a $1,500 salary.
const today = '2026-10-20', month = '2026-10';
const records = [
 record('cash', 'Checking', 'Cash', 5000, '2026-01-01'), record('car', 'Car loan', 'Loan', 8000, '2026-01-01'), record('home', 'Home', 'Mortgage', 150000, '2026-01-01'),
 record('mortgage-payment', 'Home', 'Other expense', 900, '2026-10-05', { mortgage_payment_id: 'mp', payment_principal: 700, payment_interest: 200 }),
 record('loan-fee', 'Car loan', 'Other expense', 3, '2026-10-06', { operation_id: 'loan-payment', account_id: 'cash' }),
 record('groceries', 'Market', 'Living expense', 50, '2026-10-07'),
 record('salary', 'Payroll', 'Salary', 1500, '2026-10-01'),
];
const activity = [
 { id: 'mp', action: 'mortgage', account_id: 'cash', target_id: 'home', amount: 700, fee: 200, occurred_on: '2026-10-05' },
 { id: 'loan-payment', action: 'repayment', account_id: 'cash', target_id: 'car', amount: 350, fee: 3, occurred_on: '2026-10-06' },
];
const links = [{ id: 'tracker-car', account_id: 'cash', account_currency: 'USD', amount: -350, investment_history: { record_id: 'car', event_type: 'withdrawal', occurred_on: '2026-10-08' } }];
const data = { records, activity, investmentLinks: links, categories: [], goals: [], occurrences: [] };
const spending = 200 + 3 + 50;

test('spending is expenses in full and a mortgage payment\'s interest only', () => {
 assert.equal(spendingAmount(records[3]), 200);
 assert.equal(transferAmount(records[3]), 700);
 assert.equal(spendingAmount(record('x', 'Fee', 'Other expense', 3.125, today)), 3.125, 'transfer and repayment fees stay spending, unrounded');
 assert.equal(spendingAmount(record('x', 'Pay', 'Salary', 100, today)), 0);
 assert.equal(spendingAmount(record('x', 'Car', 'Loan', 100, today)), 0, 'repayment principal is never spending');
 assert.equal(spendingAmount(record('x', 'Home', 'Other expense', 900, today, { mortgage_payment_id: 'm', payment_principal: 700 })), 200, 'interest is derived when only principal is saved');
 assert.equal(transferAmount(record('x', 'Shop', 'Living expense', 40, today)), 0);
});

test('Cash flow, Transactions, Dashboard, Budget and the Telegram digest agree on October spending', () => {
 const rates = { USD: 1 };
 const review = monthlyReview(records, [], [], month, 'USD', today, activity, rates, links);
 assert.equal(review.spent, spending);
 assert.ok(!review.categories.some(item => ['Loan', 'Debt', 'Mortgage'].includes(item.id)), 'repayments are not spending categories');

 const report = cashFlowReport(data, [], [month], 'USD', today, rates);
 assert.equal(report.expenses, spending);
 assert.equal(report.savings, 1500 - spending);
 assert.equal(report.series[0].expenses, spending);
 assert.equal(report.categories.expense.reduce((sum, item) => sum + item.amount, 0), spending);
 assert.equal(report.merchants.expense.find(item => item.key === 'Home').amount, 200, 'the mortgage merchant shows its interest');
 const flows = sankeyFlows(report, key => key);
 assert.equal(flows.links.filter(link => flows.nodes[link.target].kind === 'expense').reduce((sum, link) => sum + link.value, 0), spending);

 const convert = amount => amount;
 const listed = transactionsIn(records, { from: month, to: month }, today, emptyTransactionFilter, row => row.kind);
 const summary = summarizeTransactions(listed, convert);
 assert.equal(summary.spent, spending);
 assert.equal(summary.received, 1500);
 assert.deepEqual(summary.largest, { name: 'Home', amount: 200, entered: { amount: 200, currency: 'USD' } });
 assert.equal(signedAmount(records[3]), -900, 'the mortgage row shows the whole payment, principal plus interest');
 assert.equal(groupByDay(listed, convert).find(day => day.date === '2026-10-05').total, -900, 'day totals add up the rows shown');

 assert.equal(periodTotals(records, '2026-10-01', today, 'USD').spending, spending, 'Telegram digest');
 assert.equal(spendingPace({ records, splits: [], snapshots: [], activity, investmentLinks: links }, today, 'USD', rates).spent, spending, 'Dashboard Spending card');

 const actuals = monthActuals(data, [], month, 'USD', today, rates);
 const rows = budgetRows(budgetCategories([], []), [], new Map([[month, actuals]]), month, 'USD', rates).filter(row => row.direction === 'expense');
 assert.equal(rows.reduce((sum, row) => sum + row.actual, 0), spending, 'Budget actuals');
 assert.ok(!rows.some(row => row.key === 'Loan'), 'no Loan row under Bills & recurring');

 // The investment dashboard's "Expenses paid" funding uses the same mortgage interest.
 assert.equal(benchmarkExpenseFunding(records, today).find(row => row.id === 'expense:mortgage-payment').amount, 200);
 assert.equal(watchlistSpending({ id: 'w', query: 'home', currency: 'USD', category: null, target: 500 }, records, [], today).spent, 200);
});
