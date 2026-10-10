import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { monthOccurrences, scheduleHistory, onlyDirection, archivedSchedules, recurringSummary, daysFrom, calendarWeeks } = loadTS('lib/recurring.ts');
const { monthly } = loadTS('lib/finance.ts');
const { planningSchemas } = loadTS('lib/planning-schemas.ts');
const { upcomingPayments, debtPaymentsFrom, debtPaymentsInLoanCurrency, withExtraPayments, paymentSchedules, chooseSchedule } = loadTS('lib/planning.ts');
const { monthlyIncomeCards } = loadTS('lib/monthly-income-cards.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Monthly', notes: '', ...extra });

test('a month lists every scheduled income and bill by date and name, with paid, skipped, due and overdue status', () => {
 const records = [record('rent', 'Rent', 'Rent expense', 1200, '2026-01-01'), record('pay', 'Pay', 'Salary', 3000, '2026-01-15'), record('gym', 'Gym', 'Living expense', 40, '2026-09-03', { frequency: 'Weekly' }),
  record('old', 'Old', 'Living expense', 9, '2026-01-01', { end_date: '2026-08-31' }), record('paused', 'Paused', 'Salary', 9, '2026-01-01', { source_paused: true }), record('once', 'Once', 'Living expense', 9, '2026-10-05', { frequency: 'Once' }),
  record('loan', 'Loan', 'Loan', 500, '2026-10-20', { frequency: 'Once' })];
 const occurrences = [{ id: 'o1', record_id: 'rent', due_on: '2026-10-01', status: 'paid' }, { id: 'o2', record_id: 'gym', due_on: '2026-10-08', status: 'dismissed' }];
 const items = monthOccurrences(records, occurrences, '2026-10', '2026-10-10');
 assert.deepEqual(items.map(item => [item.record.id, item.date, item.status]), [
  ['gym', '2026-10-01', 'overdue'], ['rent', '2026-10-01', 'paid'], ['gym', '2026-10-08', 'skipped'], ['gym', '2026-10-15', 'due'], ['pay', '2026-10-15', 'due'], ['gym', '2026-10-22', 'due'], ['gym', '2026-10-29', 'due'],
 ]);
 assert.equal(items.find(item => item.record.id === 'pay').direction, 'income');
 const summary = recurringSummary(items, (amount, unit) => unit === 'USD' ? amount : null);
 assert.deepEqual(summary, { income: { done: 0, remaining: 3000 }, expense: { done: 1200, remaining: 160 }, missing: 0 });
 assert.equal(recurringSummary(monthOccurrences([record('x', 'X', 'Salary', 5, '2026-10-01', { currency: 'EUR' })], [], '2026-10', '2026-10-10'), () => null).missing, 1);
});

test('the shared schedule helpers keep upcoming payments unchanged, including income tied to an asset', () => {
 const records = [record('shop', 'Shop', 'Business', 1000, '2026-10-20', { frequency: 'Once' }), record('dividend', 'Dividend', 'Business income', 100, '2026-01-05', { business_id: 'shop' })];
 assert.deepEqual(upcomingPayments(records, [], '2026-10-01', '2026-12-31').map(item => item.date), ['2026-11-05', '2026-12-05']);
 assert.deepEqual(monthOccurrences(records, [], '2026-10', '2026-10-01'), [], 'income starts no earlier than its business');
 const salary = [record('pay', 'Pay', 'Salary', 10, '2026-01-31'), { ...record('receipt', 'Pay', 'Salary', 10, '2026-10-30', { frequency: 'Once', income_source_id: 'pay', income_due_on: '2026-10-31' }) }];
 assert.equal(monthOccurrences(salary, [], '2026-10', '2026-11-02')[0].status, 'paid', 'a recorded salary receipt settles its occurrence');
 assert.equal(monthOccurrences(salary, [], '2026-02', '2026-11-02')[0].date, '2026-02-28');
});

test('a loan with a monthly payment is due on its start day each month until the due date, and a payment that month marks it paid', () => {
 const loan = record('loan', 'Car loan', 'Loan', 5000, '2027-01-10', { frequency: 'Once', opened_on: '2026-08-31', estimated_monthly_payment: 250.4, created_at: '2026-08-31T10:00:00Z' });
 const mortgage = record('flat', 'Flat', 'Mortgage', 90000, '2046-01-01', { frequency: 'Once', estimated_monthly_payment: 900, created_at: '2026-09-11T21:30:00Z' });
 const none = record('debt', 'Debt', 'Debt', 300, '2027-01-01', { frequency: 'Once', opened_on: '2026-01-05', estimated_monthly_payment: 0 });
 const repaid = record('done', 'Done', 'Loan', 0, '2027-01-01', { frequency: 'Once', opened_on: '2026-01-05', estimated_monthly_payment: 100 });
 const records = [loan, mortgage, none, repaid];
 const payments = debtPaymentsFrom([{ action: 'repayment', target_id: 'loan', occurred_on: '2026-10-02' }, { action: 'transfer', target_id: 'flat', occurred_on: '2026-10-02' }], [{ mortgage_id: 'flat', paid_on: '2026-09-30' }]);
 assert.deepEqual(payments, [{ record_id: 'loan', date: '2026-10-02' }, { record_id: 'flat', date: '2026-09-30' }]);
 // Without the payment history the installments are left out, so nothing paid can show as overdue.
 assert.deepEqual(monthOccurrences(records, [], '2026-10', '2026-10-15').map(item => item.record.id), []);
 assert.deepEqual(upcomingPayments(records, [], '2026-10-15', '2026-11-30').filter(item => item.type === 'installment'), []);
 // The 31st falls back to the month's last day; a mortgage without a start date counts from its creation day in Tashkent (12 September).
 const october = monthOccurrences(records, [], '2026-10', '2026-10-15', payments);
 assert.deepEqual(october.map(item => [item.record.id, item.date, item.status, item.amount, item.installment]), [['flat', '2026-10-12', 'overdue', 900, true], ['loan', '2026-10-31', 'paid', 250.4, true]]);
 assert.deepEqual(monthOccurrences(records, [], '2026-11', '2026-10-15', payments).map(item => [item.record.id, item.date, item.status]), [['flat', '2026-11-12', 'due'], ['loan', '2026-11-30', 'due']]);
 assert.deepEqual(monthOccurrences(records, [], '2026-09', '2026-10-15', payments).map(item => [item.record.id, item.status]), [['loan', 'overdue']], 'an unpaid month stays overdue; the September mortgage day came before the mortgage was added');
 // Payments stop at the due date, which keeps its own repayment reminder.
 assert.deepEqual(monthOccurrences(records, [], '2027-01', '2026-10-15', payments).filter(item => item.record.id === 'loan'), []);
 const summary = recurringSummary(october, amount => amount);
 assert.deepEqual(summary.expense, { done: 250.4, remaining: 900 });
 const due = upcomingPayments(records, [], '2026-10-15', '2026-11-30', payments).filter(item => item.type === 'installment');
 assert.deepEqual(due.map(item => [item.record.id, item.date, item.overdue, item.amount]), [['loan', '2026-09-30', true, 250.4], ['flat', '2026-10-12', true, 900], ['flat', '2026-11-12', false, 900], ['loan', '2026-11-30', false, 250.4]]);
});

test('a loan month counts what its payments paid, so a partial mortgage payment never shows the installment paid in full', async () => {
 const mortgage = record('home', 'Mortgage', 'Mortgage', 200000, '2046-01-01', { frequency: 'Once', opened_on: '2026-01-17', estimated_monthly_payment: 1600 });
 const cash = record('cash', 'Wallet', 'Cash', 5000, '2026-01-01', { frequency: 'Once' }), som = record('som', 'Som', 'Cash', 1e7, '2026-01-01', { frequency: 'Once', currency: 'UZS' });
 const loan = record('loan', 'Loan', 'Loan', 900, '2027-01-01', { frequency: 'Once', opened_on: '2026-01-20', estimated_monthly_payment: 100 });
 const currencyOf = new Map([mortgage, cash, som, loan].map(item => [item.id, item.currency]));
 // A mortgage payment from an account is in both tables under one id and counts once: $0 principal and $450 interest.
 const payments = debtPaymentsFrom([{ id: 'p1', action: 'mortgage', target_id: 'home', occurred_on: '2026-10-08', amount: 0, fee: 450, account_id: 'cash' }, { id: 'r1', action: 'repayment', target_id: 'loan', occurred_on: '2026-10-02', amount: 1270000, fee: 0, account_id: 'som' }], [{ id: 'p1', mortgage_id: 'home', paid_on: '2026-10-08', principal: 0, interest: 450 }], currencyOf);
 assert.deepEqual(payments, [{ record_id: 'loan', date: '2026-10-02', amount: 1270000, currency: 'UZS', account_id: 'som' }, { record_id: 'home', date: '2026-10-08', amount: 450, currency: 'USD', account_id: 'cash' }], 'each payment keeps the account that paid it');
 const counted = await debtPaymentsInLoanCurrency(payments, currencyOf, async (from, to) => { assert.deepEqual([from, to], ['UZS', 'USD']); return 1 / 12700; });
 const october = monthOccurrences([mortgage, cash, som, loan], [], '2026-10', '2026-10-08', counted);
 assert.deepEqual(october.map(item => [item.record.id, item.status, item.recorded]), [['home', 'paid', 450], ['loan', 'paid', 100]]);
 assert.deepEqual(recurringSummary(october, amount => amount).expense, { done: 550, remaining: 0 });
 // A debt is counted the same way, and a second payment in the month adds to the first (QA REC-035).
 const debt = record('debt', 'Card debt', 'Debt', 800, '2027-01-01', { frequency: 'Once', opened_on: '2026-01-05', estimated_monthly_payment: 300 });
 const debtMonth = debtPaymentsFrom([{ id: 'd1', action: 'repayment', target_id: 'debt', occurred_on: '2026-10-01', amount: 100, fee: 0, account_id: 'cash' }, { id: 'd2', action: 'repayment', target_id: 'debt', occurred_on: '2026-10-06', amount: 150, fee: 20, account_id: 'cash' }], [], new Map([['debt', 'USD'], ['cash', 'USD']]));
 assert.deepEqual(monthOccurrences([debt, cash], [], '2026-10', '2026-10-08', debtMonth).map(item => [item.status, item.recorded, item.amount]), [['paid', 270, 300]]);
 // A payment without a usable rate is unknown, never counted under the loan's label.
 const missing = await debtPaymentsInLoanCurrency(payments, currencyOf, async () => { throw Error('no rate'); });
 assert.equal(monthOccurrences([mortgage, cash, som, loan], [], '2026-10', '2026-10-08', missing).find(item => item.record.id === 'loan').recorded, null);
});

test('due labels count whole days and the calendar starts weeks on Monday', () => {
 assert.equal(daysFrom('2026-10-02', '2026-10-05'), 3);
 assert.equal(daysFrom('2026-10-02', '2026-09-30'), -2);
 assert.equal(daysFrom('2026-03-28', '2026-03-30'), 2, 'daylight saving does not shift whole days');
 const weeks = calendarWeeks('2026-10');
 assert.deepEqual(weeks[0], [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
 assert.equal(weeks.at(-1).at(-1), null);
 assert.ok(weeks.every(week => week.length === 7));
 assert.equal(calendarWeeks('2027-02').flat().filter(Boolean).length, 28);
});

test('payments left open in earlier months are carried into the current month until recorded or skipped, and a recorded payment keeps both its scheduled and its actual amount',()=>{
 const { carriedOverdue } = loadTS('lib/recurring.ts');
 const solar = { id: 'solar', name: 'Solar panel', kind: 'Other income', currency: 'UZS', amount: 5000000, quantity: 1, cost: 0, rate: 0, date: '2026-08-25', frequency: 'Monthly', notes: '' };
 const zero = { id: 'zero', name: 'Solar panel', kind: 'Other income', currency: 'UZS', amount: 0, quantity: 1, cost: 0, rate: 0, date: '2026-08-25', frequency: 'Once', notes: 'Nothing this month' };
 const open = carriedOverdue([solar], [], '2026-10', '2026-10-05');
 assert.deepEqual(open.map(item => [item.date, item.status]), [['2026-08-25', 'overdue'], ['2026-09-25', 'overdue']], 'oldest first, this month excluded');
 // August recorded as 0, September skipped: nothing is left open.
 const occurrences = [{ id: 'a', record_id: 'solar', due_on: '2026-08-25', status: 'paid', transaction_id: 'zero' }, { id: 'b', record_id: 'solar', due_on: '2026-09-25', status: 'dismissed' }];
 assert.deepEqual(carriedOverdue([solar, zero], occurrences, '2026-10', '2026-10-05'), []);
 const august = monthOccurrences([solar, zero], occurrences, '2026-08', '2026-10-05');
 assert.deepEqual(august.map(item => [item.status, item.amount, item.recorded]), [['paid', 5000000, 0]], 'the scheduled amount, and the 0 that was recorded');
 assert.equal(recurringSummary(august, amount => amount).income.done, 0);
});

test('a recorded payment shows its amount even when the page did not load its transaction', () => {
 // Recurring reads a limited scope without one-time income and expenses; the occurrence carries what was recorded.
 const shop = { id: 'shop', name: 'Algorithm Game Club', kind: 'Other income', currency: 'USD', amount: 1500, quantity: 1, cost: 0, rate: 0, date: '2026-09-01', frequency: 'Monthly', notes: '' };
 const occurrences = [{ id: 'o', record_id: 'shop', due_on: '2026-10-01', status: 'paid', transaction_id: 'gone', transaction: { amount: 1600, date: '2026-10-02' } }];
 const [october] = monthOccurrences([shop], occurrences, '2026-10', '2026-10-05');
 assert.deepEqual([october.status, october.amount, october.recorded], ['paid', 1500, 1600]);
 assert.equal(recurringSummary([october], amount => amount).income.done, 1600, 'the month counts what came in');
});

test('later payments add to what an occurrence recorded, whether the read totalled them or the records carry them', () => {
 const free = { id: 'free', name: 'Freelancing', kind: 'Other income', currency: 'USD', amount: 6000, quantity: 1, cost: 0, rate: 0, date: '2026-09-01', frequency: 'Monthly', notes: '' };
 const first = { id: 'o', record_id: 'free', due_on: '2026-10-01', status: 'paid', transaction_id: 't1', transaction: { amount: 700, date: '2026-10-01' } };
 assert.equal(monthOccurrences([free], [{ ...first, extra: 800 }], '2026-10', '2026-10-05')[0].recorded, 1500);
 const later = { ...free, id: 't2', amount: 800, frequency: 'Once', date: '2026-10-04', occurrence_record_id: 'free', occurrence_due_on: '2026-10-01' };
 assert.equal(monthOccurrences([free, later], [first], '2026-10', '2026-10-05')[0].recorded, 1500);
 assert.equal(monthOccurrences([free, later], [{ ...first, extra: 800 }], '2026-10', '2026-10-05')[0].recorded, 1500, 'counted once when both carry it');
 // Every payment names its schedule by id, the first one too: the first is counted once, through the occurrence.
 const named = { ...free, id: 't1', amount: 700, frequency: 'Once', date: '2026-10-01', occurrence_record_id: 'free', occurrence_due_on: '2026-10-01' };
 assert.equal(monthOccurrences([free, named, later], [first], '2026-10', '2026-10-05')[0].recorded, 1500);
 assert.equal(withExtraPayments([first], [named, later])[0].extra, 800, 'the read leaves the first payment out of the later ones');
 const [due] = monthOccurrences([free, later], [], '2026-10', '2026-10-05');
 assert.deepEqual([due.status, due.recorded], ['overdue', undefined], 'nothing is added to an occurrence that is not recorded');
 assert.ok(planningSchemas.occurrence.safeParse({ id: '00000000-0000-4000-8000-000000000001', account_id: '00000000-0000-4000-8000-000000000002', target_id: '00000000-0000-4000-8000-000000000003', amount: 800, date: '2026-10-01', notes: '', extra: true }).success);
});

test('an archived schedule leaves the month, forecasts and reminders, and is listed to restore; payments stay untouched', () => {
 const rent = record('rent', 'Rent', 'Rent expense', 100, '2026-01-01', { archived: true }), pay = record('pay', 'Pay', 'Salary', 900, '2026-01-15');
 const occurrences = [{ id: 'o', record_id: 'rent', due_on: '2026-09-01', status: 'paid' }];
 assert.deepEqual(monthOccurrences([rent, pay], occurrences, '2026-10', '2026-10-20').map(item => item.record.id), ['pay']);
 assert.equal(upcomingPayments([rent], [], '2026-10-01', '2026-12-31').length, 0, 'no reminder for an archived bill');
 assert.equal(monthly(rent, '2026-10'), 0, 'forecasts leave it out');
 assert.deepEqual(archivedSchedules([rent, pay, record('once', 'Once', 'Living expense', 9, '2026-10-01', { frequency: 'Once', archived: true })]).map(item => item.id), ['rent']);
 const id = '00000000-0000-4000-8000-000000000001';
 assert.ok(planningSchemas.archive.safeParse({ source: 'record', id, archived: true }).success);
 for (const source of ['plan', 'goal']) assert.ok(!planningSchemas.archive.safeParse({ source, id, archived: true }).success, 'only schedules are archived');
 assert.ok(!planningSchemas.delete_schedule.safeParse({ source: 'plan', id, remove_history: false }).success, 'spending plans are Budget categories now');
});

test('tapping Income or Expenses keeps only that side, carried payments included', () => {
 const items = monthOccurrences([record('rent', 'Rent', 'Rent expense', 100, '2026-01-01'), record('pay', 'Pay', 'Salary', 900, '2026-01-15')], [], '2026-10', '2026-10-05');
 assert.deepEqual(onlyDirection(items, [], 'income').shown.map(item => item.record.id), ['pay']);
 assert.deepEqual(onlyDirection(items, items, 'expense').shownCarried.map(item => item.record.id), ['rent']);
 assert.deepEqual(onlyDirection(items, [], 'expense').shown.map(item => item.record.id), ['rent']);
 assert.equal(onlyDirection(items, [], null).shown.length, 2);
});

test('a schedule\'s history is each recorded payment and later payment for it', () => {
 const rent = { id: 'rent', name: 'Rent', kind: 'Rent expense', currency: 'USD', amount: 900, frequency: 'Monthly', date: '2026-01-01' };
 const records = [rent, { id: 'p2', occurrence_record_id: 'rent' }, { id: 'x', occurrence_record_id: 'other' }];
 const occurrences = [
  { id: 'o1', record_id: 'rent', due_on: '2026-09-01', status: 'paid', transaction_id: 'p1' },
  { id: 'o2', record_id: 'rent', due_on: '2026-08-01', status: 'dismissed', transaction_id: null },
  { id: 'o3', record_id: 'other', due_on: '2026-09-01', status: 'paid', transaction_id: 'q1' },
  { id: 'o4', record_id: 'rent', due_on: '2026-10-01', status: 'paid', transaction_id: 'p1' },
 ];
 assert.deepEqual(scheduleHistory({ source: 'record', record: rent }, records, occurrences), ['p1', 'p2'], 'a skipped month is not history, and nothing counts twice');
 assert.deepEqual(scheduleHistory({ source: 'record', record: { ...rent, id: 'new' } }, records, occurrences), []);
});

test('Cash flow counts a payment toward the schedule it names by id', () => {
 const epam = { id: 'epam', name: 'EPAM Systems', kind: 'Salary', currency: 'USD', amount: 3450, quantity: 1, cost: 0, rate: 0, date: '2026-01-05', frequency: 'Monthly', notes: '' };
 const snoonu = { ...epam, id: 'snoonu', name: 'Snoonu', amount: 5700 };
 const paid = { ...epam, id: 'p1', name: 'Salary', frequency: 'Once', date: '2026-10-06', occurrence_record_id: 'epam', occurrence_due_on: '2026-10-05' };
 const cards = monthlyIncomeCards([epam, snoonu, paid], '2026-10', [], '2026-10-07');
 assert.deepEqual(cards.filter(card => card.received).map(card => [card.entry.id, card.receivedAmount]), [['epam', 3450]]);
});

test('a one-time payment is offered the active schedules of its kind, business and property in any currency, and names one by id', () => {
 const base = { quantity: 1, cost: 0, rate: 0, date: '2026-01-01', notes: '', frequency: 'Monthly', currency: 'USD' };
 const records = [
  { ...base, id: 'shop', name: 'Shop payout', kind: 'Business income', amount: 900, business_id: 'b1' },
  { ...base, id: 'cafe', name: 'Cafe payout', kind: 'Business income', amount: 500, business_id: 'b2' },
  { ...base, id: 'flat', name: 'Flat rent', kind: 'Rent income', amount: 450, income_source_id: 'p1' },
  { ...base, id: 'eur', name: 'Euro rent', kind: 'Rent income', amount: 300, income_source_id: 'p1', currency: 'EUR' },
  { ...base, id: 'old', name: 'Old shop', kind: 'Business income', amount: 1, business_id: 'b1', archived: true },
  { ...base, id: 'gym', name: 'Gym', kind: 'Other expense', amount: 30, custom_category_id: 'sport' },
  { ...base, id: 'paid', name: 'One payment', kind: 'Business income', amount: 900, business_id: 'b1', frequency: 'Once' },
 ];
 const ids = payment => paymentSchedules(records, payment).map(record => record.id);
 assert.deepEqual(ids({ kind: 'Business income', business_id: 'b1', currency: 'USD' }), ['shop']);
 assert.deepEqual(ids({ kind: 'Rent income', income_source_id: 'p1', currency: 'UZS' }), ['flat', 'eur'], 'a payment in any currency may settle its schedule');
 assert.deepEqual(ids({ kind: 'Other expense', custom_category_id: 'sport' }), ['gym']);
 assert.deepEqual(ids({ kind: 'Other expense' }), [], 'a category of its own is a different category');
 // A schedule and a payment are the same item by `budgetKey`: the custom category when there is one, else the kind.
 assert.deepEqual(ids({ kind: 'Living expense', custom_category_id: 'sport' }), ['gym'], 'a payment in the same custom category matches whatever kind either carries');
 assert.deepEqual(ids({ kind: 'Other income', custom_category_id: 'sport' }), [], 'an income payment never matches an expense schedule of the same category');
 assert.deepEqual(ids({ custom_category_id: 'sport' }), [], 'a payment without a kind matches nothing');
 assert.deepEqual(ids({}), []);
 assert.deepEqual(chooseSchedule({ ...base, id: 'fee', name: '', kind: 'Living expense', amount: 0, frequency: 'Once', custom_category_id: 'sport' }, records[5]), { occurrence_record_id: 'gym', name: 'Gym', amount: 30 }, 'a cross-kind match is named like any other');
 const payment = { ...base, id: 'p', name: '', kind: 'Rent income', amount: 0, frequency: 'Once' };
 assert.deepEqual(chooseSchedule(payment, records[2]), { occurrence_record_id: 'flat', name: 'Flat rent', amount: 450, income_source_id: 'p1' });
 assert.deepEqual(chooseSchedule(payment, records[3]), { occurrence_record_id: 'eur', name: 'Euro rent', income_source_id: 'p1' }, 'an amount in another currency is never copied');
 assert.deepEqual(chooseSchedule({ ...payment, name: 'May rent', amount: 400, currency: 'UZS' }, records[2]), { occurrence_record_id: 'flat', income_source_id: 'p1' }, 'typed values and their currency stay');
 assert.deepEqual(chooseSchedule(payment, null), { occurrence_record_id: null });
});
