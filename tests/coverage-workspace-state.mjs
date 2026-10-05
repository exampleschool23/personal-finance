import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, translate } from './helpers/component-tree.mjs';

const { demoWorkspace } = loadTS('lib/demo-finance.ts');
const { depositToday } = loadTS('lib/deposit-interest.ts');
const { emptyRecordFilters } = loadTS('lib/record-filters.ts');
const { defaultPreferences } = loadTS('lib/currencies.ts');
const today = depositToday();

// A browser of one tab: its address, history, session storage, the frame it sits in and a WebMCP model context.
const events = { replaced: [], posted: [], listeners: {}, tool: null, stored: new Map(), locations: [] };
function browser(href, { framed = false } = {}) {
 const url = new URL(href);
 const location = { get href() { return url.href; }, get search() { return url.search; }, origin: url.origin, replace: next => events.locations.push(next) };
 const self = {}, top = framed ? {} : self;
 globalThis.window = { location, self, top, history: { replaceState: (_, __, next) => { events.replaced.push(next); const at = new URL(next, url.origin); url.search = at.search; } }, addEventListener: (name, listener) => { events.listeners[name] = listener; }, removeEventListener: name => { delete events.listeners[name]; }, parent: { postMessage: (message, origin) => events.posted.push([message, origin]) } };
 globalThis.sessionStorage = { setItem: (key, value) => events.stored.set(key, value), getItem: key => events.stored.get(key) ?? null, removeItem: key => events.stored.delete(key) };
 globalThis.document = { documentElement: { dataset: {} }, modelContext: { registerTool: tool => { events.tool = tool; } } };
}

// The server: each route answers from `server`, and every request is kept.
const requests = [];
const server = { session: { configured: true, user: null }, settings: { ...defaultPreferences, currencies: ['EUR', 'USD'], onboarded: true }, records: { records: [], total: 0, page: 1, summary: [], businesses: [] }, fail: {} };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
globalThis.fetch = async (url, options = {}) => {
 const method = options.method ?? 'GET', path = String(url).split('?')[0], body = options.body ? JSON.parse(options.body) : undefined;
 requests.push({ url: String(url), method, body });
 const failure = server.fail[method + ' ' + path];
 if (failure !== undefined) return reply({ error: failure }, 400);
 if (path === '/api/auth') return reply(method === 'POST' ? { user: { email: body.email } } : method === 'DELETE' ? {} : server.session);
 if (path === '/api/demo') return reply(demoWorkspace(today));
 if (path === '/api/settings') return reply(method === 'PUT' ? body : server.settings);
 if (path === '/api/records') return reply(method === 'GET' ? server.records : {});
 if (path === '/api/transaction-rules') return reply({ changed: 2 });
 return reply({});
};
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const shown = { saved: 0, errors: [] }, router = { pushed: [], replaced: [], push(path) { this.pushed.push(path); }, replace(path) { this.replaced.push(path); } };
let pathname = '/', marketReply = null, languageCalls = [];
const household = { state: null, loading: false, attribute: async () => 3, setAccountOwner: async () => 4 };
const plans = { plans: [{ id: 'plan', name: 'Groceries', category: 'Groceries', currency: 'USD', amount: 300, start_date: '2020-01-01', end_date: null }], month: today.slice(0, 7), loading: false, error: '', seeded: [], removed: [], restored: [], seedDemo(list) { this.seeded.push(list); }, restoreDemo(plan) { this.restored.push(plan.id); }, async remove(id) { this.removed.push(id); } };
const r = createRenderer();
const { WorkspaceProvider } = r.load('components/workspace/workspace-provider.tsx', {
 'next/navigation': { usePathname: () => pathname, useRouter: () => router },
 '@/components/language-provider': { useLanguage: () => ({ t: translate, locale: 'en-US', language: 'en', setDefaultLanguage: language => languageCalls.push(['default', language]), setLanguage: language => languageCalls.push(['visit', language]) }) },
 '@/lib/feedback': { showSaved: () => shown.saved++, showError: message => shown.errors.push(message) },
 '@/lib/fonts': { applyFont() {}, resolveFont: font => font },
 '@/hooks/use-household': { useHousehold: () => household },
 '@/hooks/use-market': { useMarket: () => ({ market: null, loading: false, error: '', refresh() {} }), fetchMarket: async () => { if (marketReply instanceof Error) throw marketReply; return marketReply; } },
 '@/hooks/use-portfolio-snapshots': { usePortfolioSnapshots: () => ({}) },
 '@/hooks/use-planning': { usePlanning: (user, demo, rows, revision, onSaved, holdingAccounts, scope, month, seed) => ({ data: demo ? { records: rows, holdingAccounts, occurrences: seed.occurrences ?? [], goals: seed.goals ?? [], categories: seed.categories ?? [], activity: [] } : { records: server.records.summary, holdingAccounts: [], occurrences: [], goals: [], categories: [], activity: [] }, loading: false, error: '' }) },
 '@/hooks/use-earning-sources': { useEarningSources: () => ({ sources: [{ id: 'src', schedule_id: 'sched', kind: 'Salary', currency: 'USD', amount: 100 }] }) },
 '@/hooks/use-transaction-tools': { useTransactionTools: () => ({ data: { splits: [] } }) },
 '@/hooks/use-workspace-preferences': { useWorkspacePreferences: () => ({ data: { preferences: [] } }) },
 '@/hooks/use-tags': { useTags: () => ({ data: { tags: [] } }) },
 '@/hooks/use-record-attachments': { useRecordAttachments: () => ({}) },
 '@/hooks/use-expense-plans': { useExpensePlans: () => plans },
 '@/hooks/use-owner-resource': { useOwnerResource: (url, user, enabled, reload, empty) => ({ data: empty, loading: false }) },
 '@/hooks/use-record-filters': { useRecordFilters: () => ({ filters: emptyRecordFilters, setFilters() {} }) },
 '@/hooks/use-comparison-profile': { saveTrackingStartRequest: async () => {} },
});
/** Mounts the provider and returns the latest workspace after each change. */
function mount() {
 r.mount(React.createElement(WorkspaceProvider, null, null));
 return () => r.all(node => node.props && 'value' in node.props && node.props.value && 'save' in node.props.value)[0].props.value;
}
const settle = async () => { for (let i = 0; i < 4; i++) { await flush(); r.update(); } };
// A form's fields: read one by name, or all of them (email sign-in).
globalThis.FormData = class { constructor(target) { this.fields = target?.fields ?? {}; } get(key) { return this.fields[key] ?? null; } [Symbol.iterator]() { return Object.entries(this.fields)[Symbol.iterator](); } };
const formEvent = fields => { const target = { fields }; return { preventDefault() {}, currentTarget: target }; };

test('signed out, the workspace keeps an invite for after sign-in and sends workspace addresses back to the tour', async () => {
 browser('https://app.test/settings?invite=' + 'a'.repeat(64));
 pathname = '/goals';
 const ws = mount();
 await settle();
 assert.equal(ws().ready, true);assert.equal(ws().user, null);
 assert.equal(events.stored.get('hf_invite'), 'a'.repeat(64));assert.equal(ws().pendingInvite, 'a'.repeat(64));
 assert.ok(events.replaced.includes('/settings'), 'the token leaves the address bar');
 assert.ok(router.replaced.includes('/'));
 pathname = '/';r.update();await settle();
 assert.ok(router.replaced.includes('/sign-in'), 'an invite asks to sign in first');
 ws().dismissInvite();r.update();
 assert.equal(ws().pendingInvite, null);assert.equal(events.stored.has('hf_invite'), false);
 // The record form tool refuses without a session and takes no fields.
 assert.throws(() => events.tool.execute({}), /Sign in first/);
 assert.throws(() => events.tool.execute({ name: 'x' }), /No fields accepted/);
});

test('a failed Google sign-in shows why, and email sign-in opens the account', async () => {
 browser('https://app.test/sign-in?auth_error=google_failed');
 pathname = '/sign-in';
 const ws = mount();
 await settle();
 assert.equal(ws().error, 'Google sign-in failed. Please try again or use email.');
 server.fail['POST /api/auth'] = 'Invalid login credentials';
 await ws().login(formEvent({ email: 'me@example.com' }));r.update();
 assert.equal(ws().error, 'Invalid login credentials');
 delete server.fail['POST /api/auth'];
 await ws().login(formEvent({ email: 'me@example.com' }));await settle();
 assert.equal(ws().user, 'me@example.com');
});

test('the sample workspace starts from the backend and changes only its own copy', async () => {
 browser('https://app.test/');
 pathname = '/accounts';
 const ws = mount();
 await settle();
 await ws().startDemo();await settle();
 assert.equal(ws().demo, true);assert.ok(ws().rows.length > 5);assert.equal(plans.seeded.length, 1);
 assert.equal(ws().market.rates.USD, 1);
 const expense = ws().rows.find(row => row.kind === 'Living expense' && row.frequency === 'Once' && row.account_id), cash = ws().rows.find(row => row.id === expense.account_id);
 // Opening forms: each offers the kinds that fit and starts in the workspace currency.
 ws().addRecord();r.update();
 assert.equal(ws().editing.kind, 'Cash');assert.ok(ws().recordKinds.includes('Stock'));
 ws().field('currency', 'EUR');r.update();
 assert.equal(ws().editing.currency, 'EUR');assert.equal(ws().editing.account_id, null);
 ws().closeEditing();ws().addAccountRecord('Stock');r.update();
 assert.deepEqual(ws().recordKinds, ['Stock', 'Crypto']);
 ws().quickExpense();r.update();assert.equal(ws().editing.kind, 'Other expense');
 ws().spendFromPlan(plans.plans[0]);r.update();assert.equal(ws().editing.kind, 'Living expense');assert.equal(ws().editing.expense_plan_id, 'plan');
 ws().reviewRecurring(expense);r.update();assert.equal(ws().editing.id, expense.id);
 ws().recordFromSource({ id: 'src', kind: 'Salary', currency: 'USD', amount: 100, mode: 'fixed', frequency: 'Monthly', start_date: '2026-01-01' });r.update();
 assert.deepEqual(ws().recordKinds, ws().recordKinds.filter(kind => kind !== 'Cash'));
 ws().editRecord({ id: 'sched', kind: 'Salary' });r.update();
 assert.equal(ws().editingIncomeSource.id, 'src', 'a scheduled source opens its own form');
 ws().editRecord(expense);r.update();assert.equal(ws().editing.id, expense.id);
 assert.equal(ws().newBusiness('Kiosk').kind, 'Business');
 // Save refuses what the server would refuse, by name.
 ws().setEditing({ ...expense, date: '' });r.update();
 await ws().save(formEvent({}));r.update();
 assert.equal(shown.errors.at(-1), 'Date is required.');
 ws().setEditing({ ...expense, amount: 0 });r.update();
 await ws().save(formEvent({}));assert.equal(shown.errors.at(-1), 'Enter an amount greater than zero.');
 ws().setEditing({ ...expense, account_id: null });r.update();
 await ws().save(formEvent({}));r.update();assert.equal(shown.errors.at(-1), 'Choose a cash account.');
 ws().setEditing({ ...expense, expense_plan_id: 'plan', currency: 'EUR' });r.update();
 await ws().save(formEvent({}));r.update();assert.equal(shown.errors.at(-1), 'Check the expense plan, currency and spending date.');
 // A blank expense is named after its note.
 const saved = shown.saved;
 ws().setEditing({ ...expense, name: '', notes: 'Weekly shop' });r.update();
 await ws().save(formEvent({ account_exchange_rate: '1' }));r.update();
 assert.equal(shown.saved, saved + 1);assert.equal(ws().editing, null);
 assert.equal(ws().rows.find(row => row.id === expense.id).name, 'Weekly shop');
 // Deleting keeps the record in Recently deleted, from where it comes back.
 ws().requestDelete(expense);r.update();await ws().remove();r.update();
 assert.equal(ws().rows.some(row => row.id === expense.id), false);
 const [binned] = ws().deletedItems;
 ws().restoreDemoItem(binned);r.update();
 assert.ok(ws().rows.some(row => row.id === expense.id));assert.equal(ws().deletedItems.length, 0);
 await ws().removePlan('plan');r.update();
 assert.deepEqual(plans.removed, ['plan']);assert.equal(ws().deletedItems[0].source, 'expense_plans');
 ws().restoreDemoItem(ws().deletedItems[0]);r.update();assert.deepEqual(plans.restored, ['plan']);
 ws().restoreDemoItem({ id: 'goal', source: 'savings_goals', data: {} });
 await ws().removePlan('plan');r.update();ws().discardDeletedItem(ws().deletedItems[0]);r.update();assert.equal(ws().deletedItems.length, 0);
 assert.throws(() => ws().restoreDemoItem({ id: 'x', source: 'finance_records', data: { ...expense, business_id: 'gone' } }), /Could not restore this item/);
 // Bulk changes resolve to how many records changed.
 assert.equal(await ws().categorize([expense.id], { kind: 'Charity', category_id: null }), 1);r.update();
 assert.equal(ws().rows.find(row => row.id === expense.id).kind, 'Charity');
 const business = ws().rows.find(row => row.kind === 'Business');
 assert.equal(typeof await ws().assignTransactionsBusiness([expense.id], business.id), 'number');
 assert.equal(typeof await ws().setAccountBusiness(cash.id, null), 'number');
 assert.equal(typeof await ws().assignRecordOwner([expense.id], 'shared'), 'number');
 assert.equal(typeof await ws().setAccountOwner(cash.id, 'shared'), 'number');
 await ws().saveBusiness({ ...business, name: 'Renamed' });r.update();
 assert.equal(ws().rows.find(row => row.id === business.id).name, 'Renamed');
 await ws().saveHoldingAccount({ id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' });r.update();
 await ws().assignHolding(cash, 'broker');r.update();
 assert.equal(ws().rows.find(row => row.id === cash.id).holding_account_id, 'broker');
 const mortgage = ws().rows.find(row => row.kind === 'Mortgage');
 const before = mortgage.amount;
 await ws().recordMortgagePayment({ id: 'pay', mortgage_id: mortgage.id, principal: 100, interest: 20, date: today, notes: '' });r.update();
 assert.equal(ws().rows.find(row => row.id === mortgage.id).amount, before - 100);
 assert.equal(ws().rows.find(row => row.id === 'pay').amount, 120);
 ws().setStopping(expense);r.update();
 await ws().stopRecord('2030-01-01');r.update();
 assert.equal(ws().rows.find(row => row.id === expense.id).end_date, '2030-01-01');
 // The form tool opens a blank record.
 assert.deepEqual(events.tool.execute({}), { status: 'form_opened' });r.update();
 assert.equal(ws().editing.name, '');
 await ws().logout();r.update();
 assert.equal(ws().demo, false);assert.deepEqual(ws().rows, []);assert.equal(ws().editing, null);
});

test('signed in, settings and records are read, and every change is sent and read again', async () => {
 browser('https://app.test/');
 pathname = '/transactions';
 const record = { id: 'r1', name: 'Lunch', kind: 'Living expense', currency: 'USD', amount: 12, date: today, frequency: 'Once', notes: '', account_id: 'c1' };
 const account = { id: 'c1', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 500, date: today, frequency: 'Once', notes: '' };
 server.session = { configured: true, user: { email: 'me@example.com' } };
 server.records = { records: [record], total: 1, page: 1, summary: [record, account], businesses: [] };
 const ws = mount();
 await settle();
 assert.equal(ws().user, 'me@example.com');
 assert.equal(ws().currency, 'EUR');assert.deepEqual(languageCalls.at(-1), ['default', server.settings.language]);
 assert.ok(requests.some(request => request.url.startsWith('/api/records?') && request.url.includes('summary=1')));
 assert.equal(ws().settingsLoading, false);assert.equal(ws().onboardingNeeded, false);
 // Saving sends the record and reads again.
 ws().editRecord(record);r.update();
 await ws().save(formEvent({}));await settle();
 assert.deepEqual(requests.filter(request => request.method === 'POST' && request.url === '/api/records').at(-1).body.id, 'r1');
 server.fail['POST /api/records'] = 'Could not save.';
 ws().editRecord(record);r.update();
 await ws().save(formEvent({}));r.update();
 assert.equal(ws().error, 'Could not save.');delete server.fail['POST /api/records'];
 ws().requestDelete(record);r.update();await ws().remove();await settle();
 assert.deepEqual(requests.filter(request => request.method === 'DELETE' && request.url === '/api/records').at(-1).body, { id: 'r1' });
 assert.equal(await ws().categorize(['r1'], { kind: 'Charity', category_id: null }), 2);
 assert.equal(await ws().assignTransactionsBusiness(['r1'], null), 2);
 assert.equal(await ws().setAccountBusiness('c1', null), 2);
 assert.equal(await ws().assignRecordOwner(['r1'], 'shared'), 3);
 assert.equal(await ws().setAccountOwner('c1', 'shared'), 4);
 await ws().saveBusiness({ ...record, id: 'b1', kind: 'Business' });
 await ws().saveHoldingAccount({ id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' });
 await ws().assignHolding(record, 'broker');
 await ws().recordMortgagePayment({ id: 'pay', mortgage_id: 'm1', principal: 10, interest: 2, date: today, notes: '' });
 await ws().recordMortgagePayment({ id: 'pay2', mortgage_id: 'm1', principal: 10, interest: 2, date: today, notes: '', exchange_rate: 1.1 });
 assert.ok(requests.some(request => request.url === '/api/investment-history/exchange' && request.body.type === 'mortgage_payment'));
 server.fail['POST /api/mortgage-payments'] = '';
 await assert.rejects(ws().recordMortgagePayment({ id: 'pay3', mortgage_id: 'm1', principal: 1, interest: 0, date: today, notes: '' }), error => error.confirmedFailure === true && /Payment could not be confirmed/.test(error.message));
 delete server.fail['POST /api/mortgage-payments'];
 ws().setStopping(record);r.update();await ws().stopRecord('2030-01-01');
 // Fetching a price fills the holding's amount, or says why it could not.
 ws().setEditing({ ...record, kind: 'Crypto', name: 'Bitcoin (BTC)', amount: 0 });r.update();
 marketReply = { quotes: {}, errors: {}, rates: { USD: 1 } };
 await ws().fetchPrice();r.update();
 assert.match(ws().priceMessage, /Price unavailable|unavailable/i);
 assert.equal(typeof ws().quoteLabel(ws().editing), 'string');
 assert.equal(ws().quoteLabel({ ...record, kind: 'Living expense' }), 'Select a coin or enter a stock ticker to fetch prices.');
 // Settings can be read again and the welcome setup run again.
 ws().retrySettings();await settle();
 await ws().restartOnboarding();r.update();
 assert.equal(requests.filter(request => request.url === '/api/settings' && request.method === 'PUT').at(-1).body.onboarded, false);
 assert.equal(ws().money(5), '€5');
 server.fail['DELETE /api/auth'] = 'nope';
 await ws().logout();r.update();
 assert.equal(ws().error, 'Could not sign out. Please try again.');assert.equal(ws().user, 'me@example.com');
 delete server.fail['DELETE /api/auth'];
 await ws().logout();r.update();
 assert.equal(ws().user, null);
 server.session = { configured: true, user: null };
});

test('inside a public page’s preview the sample workspace opens by itself and follows the page', async () => {
 browser('https://app.test/?preview=1', { framed: true });
 pathname = '/';
 const ws = mount();
 for (let i = 0; i < 4; i++) await settle();
 assert.equal(ws().preview, true);assert.equal(ws().demo, true);
 assert.equal(events.posted.at(-1)[1], 'https://app.test');
 events.listeners.message({ origin: 'https://evil.test', data: { source: 'hoggish-preview', type: 'open', path: '/goals' } });
 assert.deepEqual(router.pushed, []);
 events.listeners.message({ origin: 'https://app.test', data: { source: 'hoggish-preview', type: 'open', path: '/goals' } });
 assert.deepEqual(router.pushed, ['/goals']);
});

test('the pure save rules and the table view behave as the provider relied on', () => {
 const save = loadTS('lib/record-save.ts');
 const lent = { kind: 'Money lent', lent_date: '', date: '' }, bill = { kind: 'Treasury bill', date: '2026-01-01', opened_on: '2026-02-01', amount: 1 };
 assert.equal(save.recordSaveProblem(lent), 'Date lent is required.');
 assert.equal(save.recordSaveProblem({ ...lent, lent_date: '2026-02-01', date: '2026-01-01' }), 'Due date must not precede lending date.');
 assert.equal(save.recordSaveProblem(bill), 'The maturity date cannot be before the purchase date.');
 assert.equal(save.recordSaveProblem({ kind: 'Living expense', date: '2999-01-01', amount: 5, frequency: 'Once' }), 'Actual income and expenses cannot be dated in the future.');
 assert.equal(save.cashAccountProblem({ kind: 'Cash', account_id: 'c', currency: 'EUR' }, [{ id: 'c', kind: 'Cash', currency: 'USD' }], true, 0), 'Historical exchange rates are unavailable.');
 assert.equal(save.cashAccountProblem({ kind: 'Living expense', account_id: 'c', currency: 'USD', frequency: 'Once' }, [{ id: 'c', kind: 'Cash', currency: 'USD' }], false, 1), 'Choose a cash account.');
 assert.equal(save.duplicateScheduledPayment({ id: 'a', earning_source_id: 's' }, [{ id: 'b', earning_source_id: 's', earning_due_on: '2026-01-01' }], '2026-01-01'), true);
 assert.equal(save.duplicateSalaryPayment({ id: 'a', kind: 'Salary', income_source_id: 'i' }, [{ id: 'b', income_source_id: 'i', income_due_on: '2026-01-01' }], '2026-01-01'), true);
 assert.equal(save.debtDatesProblem({ kind: 'Loan', opened_on: '2026-05-01', date: '2026-04-01' }), 'Check the start and due dates.');
 assert.equal(save.debtDatesProblem({ kind: 'Loan', opened_on: null, date: '2026-04-01' }), '');
 assert.deepEqual(save.businessMoveFrom({ kind: 'Cash', business_id: 'b2' }, { business_id: 'b1' }), { from: 'b1' });
 assert.equal(save.businessMoveFrom({ kind: 'Cash', business_id: 'b1' }, { business_id: 'b1' }), null);
 assert.equal(save.expenseName({ kind: 'Living expense', name: ' ', notes: '' }, 'Pottery', 'Living expense'), 'Pottery');
 const table = loadTS('lib/record-table.ts');
 assert.deepEqual(['Assets & investments', 'Income & expenses', 'Loans & debts', 'Overview'].map(table.sectionKeyOf), ['assets', 'cashflow', 'debts', 'all']);
 const rows = Array.from({ length: 12 }, (_, i) => ({ id: 'r' + String(i).padStart(2, '0'), name: 'Row ' + i, kind: 'Living expense', currency: 'USD', amount: i + 1, date: `2026-01-${String(i + 1).padStart(2, '0')}`, frequency: 'Once', notes: '' }));
 const base = { demo: true, section: 'Overview', sectionKey: 'all', locale: 'en-US', currency: 'USD', market: null, rows, current: rows, planningRecords: rows, planningLoading: false, filters: emptyRecordFilters, currencyFilter: '', page: 2, historyOnly: false, remoteHistory: false, useFilteredRecords: false, historyPage: { records: [], total: 0, page: 1 }, historyLoading: false, recordTotal: 0, loadedKey: '', requestKey: 'k' };
 const demo = table.recordTableView(base);
 assert.deepEqual([demo.totalRecords, demo.pageCount, demo.visible.length], [12, 2, 2]);
 assert.deepEqual(demo.visible.map(row => row.id), ['r01', 'r00'], 'newest first');
 const signedIn = table.recordTableView({ ...base, demo: false, recordTotal: 40, loadedKey: 'other' });
 assert.deepEqual([signedIn.tableLoading, signedIn.visible.length, signedIn.pageCount], [true, 0, 4]);
 const remote = table.recordTableView({ ...base, demo: false, remoteHistory: true, historyPage: { records: [rows[0]], total: 31, page: 3 }, historyLoading: true });
 assert.deepEqual([remote.totalRecords, remote.tablePage, remote.tableLoading, remote.visible.length], [31, 3, true, 1]);
 const filtered = table.recordTableView({ ...base, useFilteredRecords: true, page: 5, currencyFilter: 'EUR' });
 assert.deepEqual([filtered.totalRecords, filtered.tablePage], [0, 1]);
 const { workspaceTotals } = loadTS('lib/workspace-totals.ts');
 const totals = workspaceTotals({ records: [{ id: 'c', kind: 'Cash', currency: 'USD', amount: 100, quantity: 1 }, { id: 'e', kind: 'Cash', currency: 'JPY', amount: 5, quantity: 1 }], planningRecords: [], currency: 'USD', market: { rates: { USD: 1 }, quotes: {}, errors: {} } });
 assert.deepEqual([totals.netWorth, totals.excludedCurrencies], [100, ['JPY']]);
 const { workspaceLoading } = loadTS('lib/workspace-totals.ts');
 const ready = { demo: false, settingsLoading: false, summaryLoaded: true, tableLoading: true, plansLoading: false, marketReady: true, marketLoading: true };
 assert.equal(workspaceLoading(ready), false, 'a later page read or market refresh does not cover the workspace');
 assert.deepEqual([{ settingsLoading: true }, { summaryLoaded: false }, { plansLoading: true }, { marketReady: false }].map(change => workspaceLoading({ ...ready, ...change })), [true, true, true, true]);
 assert.equal(workspaceLoading({ ...ready, demo: true, settingsLoading: true }), false);
});
