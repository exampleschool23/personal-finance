import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, hostModule, language, stubs, text } from './helpers/component-tree.mjs';

const { formatMoney } = loadTS('lib/format.ts');
const usd = value => formatMoney(value, 'USD', 'en');
// The display currency as the workspace provides it: USD, with the market table 1 USD = 0.9 EUR and no GBP rate.
const displayMoney = context => loadTS('components/display-money.tsx', { react: { ...React, useContext: () => context }, '@/components/language-provider': language('en') }).useDisplayMoney();

test('listed amounts convert into the display currency, and one without a rate reads as missing (XAPP-019)', () => {
 const money = displayMoney({ currency: 'USD', rates: { EUR: 0.9 } });
 assert.equal(money.currency, 'USD');
 assert.equal(money.show(900, 'EUR'), usd(1000));
 assert.equal(money.show(250, 'USD'), usd(250));
 assert.equal(money.showSigned(-90, 'EUR'), '−' + usd(100));
 // No GBP rate: never the pound figure under a dollar sign.
 assert.equal(money.convert(1000, 'GBP'), null);
 assert.equal(money.show(1000, 'GBP'), '—');
 // A total across currencies is one figure, and missing when any part cannot be converted.
 assert.equal(money.showSum([{ amount: 146, currency: 'USD' }, { amount: 90, currency: 'EUR' }]), usd(246));
 assert.equal(money.sum([{ amount: 10, currency: 'USD' }, { amount: 10, currency: 'GBP' }]), null);
 assert.equal(money.showSum([{ amount: 10, currency: 'USD' }, { amount: 10, currency: 'GBP' }]), '—');
});

test('outside a workspace amounts keep their own currency and different currencies are never added', () => {
 const money = displayMoney(null);
 assert.equal(money.currency, undefined);
 assert.equal(money.show(19, 'EUR'), formatMoney(19, 'EUR', 'en'));
 assert.equal(money.showSum([{ amount: 5, currency: 'EUR' }, { amount: 7, currency: 'EUR' }]), formatMoney(12, 'EUR', 'en'));
 assert.equal(money.sum([{ amount: 5, currency: 'EUR' }, { amount: 7, currency: 'USD' }]), null);
});

test('metals and vested equity are bought and sold by quantity like stocks and crypto (INV-047)', () => {
 const { isHolding, movementSources, movementTargets } = loadTS('lib/asset-movements.ts');
 const row = (id, kind) => ({ id, name: id, kind, currency: 'USD', amount: 100, quantity: 1 });
 const records = [row('cash', 'Cash'), row('gold', 'Precious metals'), row('rsu', 'Equity compensation'), row('aapl', 'Stock'), row('flat', 'Property')];
 assert.deepEqual(records.filter(isHolding).map(record => record.id), ['gold', 'rsu', 'aapl']);
 assert.deepEqual(movementSources('sell', records).map(record => record.id), ['gold', 'rsu', 'aapl']);
 // Selling 40 g of gold pays into cash, or converts into another holding; a property is never a trade target.
 assert.deepEqual(movementTargets('sell', records[1], records).map(record => record.id), ['cash', 'rsu', 'aapl']);
 assert.deepEqual(movementTargets('buy', records[0], records).map(record => record.id), ['gold', 'rsu', 'aapl']);
});

test('a fetched unit price is shown with at most eight decimals, while the stored price keeps its precision (INV-049)', async () => {
 const source = (await import('node:fs')).readFileSync('components/record-dialog/record-form.tsx', 'utf8');
 assert.match(source, /value=\{editing\.amount\} max=\{1e15\} displayFractionDigits=\{unitPricedKinds\.includes\(editing\.kind\) \? 8 : undefined\}/);
 const { numberInputValue } = loadTS('lib/format.ts');
 assert.equal(numberInputValue(132.50144508671133, 'en', 8), '132.50144509');
});

test('Cash flow lists every income source with its progress after Show more (CF-042)', () => {
 const r = createRenderer();
 const ui = stubs();
 const { CashflowPreview } = r.load('components/cashflow-preview.tsx', {
  ...ui.modules,
  '@/components/language-provider': language('en'),
  ...Object.fromEntries(['done-tick', 'progress-line', 'category-icon', 'inline-error', 'loading-placeholder', 'panel-title'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
  '@/components/expense-plan-chart': hostModule(),
 });
 const source = (n, approx) => ({ id: 's' + n, name: 'Source ' + n, kind: 'Other income', currency: 'USD', mode: 'variable', approx_monthly: approx, archived: false });
 const sources = [6000, 5000, 4000, 3000, 2500, 2000].map((approx, index) => source(index + 1, approx));
 const received = { id: 'r1', name: 'Source 6', kind: 'Other income', currency: 'USD', amount: 800, date: '2026-10-08', frequency: 'Once', earning_source_id: 's6', quantity: 1, cost: 0, rate: 0, notes: '' };
 r.mount(React.createElement(CashflowPreview, { entries: [received], sources, plans: [], month: '2026-10', currency: 'USD', loading: false, error: '', onRetry() {}, onIncome() {}, onSpending() {}, mortgages: null, watchlists: null }));
 const panel = () => r.find(node => node.props?.className === 'panel cashflow-income-preview');
 const rows = () => r.all(node => node.type === 'tr', [panel()]).slice(1).map(text);
 assert.equal(rows().length, 5);
 assert.ok(!rows().some(row => row.includes('Source 6')), 'the sixth source waits behind Show more');
 const showMore = () => r.all(node => node.type?.displayName === 'Button' && text(node) === 'Show more');
 r.fire(showMore()[0], 'onClick');
 assert.equal(rows().length, 6);
 const sixth = rows().find(row => row.includes('Source 6'));
 assert.ok(sixth.includes(usd(2000)) && sixth.includes(usd(800)), sixth);
 assert.equal(showMore().length, 0);
});

test('a metal is counted by its weight and other holdings in units (INV-051)', () => {
 const { holdingQuantity } = loadTS('lib/asset-movements.ts');
 const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
 assert.equal(holdingQuantity(t, { kind: 'Precious metals', metal_unit: 'oz' }, 6, 'en'), '6 troy oz');
 assert.equal(holdingQuantity(t, { kind: 'Precious metals', metal_unit: 'g' }, 100, 'en'), '100 g');
 assert.equal(holdingQuantity(t, { kind: 'Stock' }, 4, 'en'), '4 units');
 assert.equal(holdingQuantity(t, { kind: 'Crypto' }, 1, 'en'), '1 unit');
});

test('holding rows and Recently deleted show amounts in the display currency, quotes with their decimals (XAPP-020)', async () => {
 const money = displayMoney({ currency: 'EUR', rates: { EUR: 0.9 } });
 // A converted quote reads to the cent (or four significant digits below one), never a calculation tail.
 assert.equal(money.show(711.28, 'USD', true), formatMoney(640.15, 'EUR', 'en', true));
 assert.doesNotMatch(money.show(711.28, 'USD', true), /\.\d{3,}/);
 assert.equal(money.show(0.00012345, 'USD', true), formatMoney(0.0001111, 'EUR', 'en', true));
 // A quote already in the display currency keeps its own decimals.
 assert.equal(displayMoney({ currency: 'USD', rates: { EUR: 0.9 } }).show(0.00012345, 'USD', true), formatMoney(0.00012345, 'USD', 'en', true));
 assert.equal(money.show(2845, 'USD'), formatMoney(2845 * 0.9, 'EUR', 'en'));
 const fs = await import('node:fs');
 for (const file of ['components/planning/accounts/holding-rows.tsx', 'components/recently-deleted.tsx']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /useDisplayMoney\(\)/, file);
  assert.doesNotMatch(source, /formatMoney\(/, file + ' formats no amount in its own currency');
 }
});

// Screens mounted with the display currency EUR (1 USD = 0.9 EUR) and no GBP rate: every amount reads in euros, and a
// pound amount reads "—" with the "Exchange rate unavailable." note, never under its own label (MONEY-008).
const eur = value => formatMoney(value, 'EUR', 'en');
const inEuros = { '@/components/display-money': { useDisplayMoney: () => displayMoney({ currency: 'EUR', rates: { EUR: 0.9 } }) }, '@/components/language-provider': language('en') };
const market = { rates: { EUR: 0.9 }, fx: null, quotes: {}, errors: {}, stocksConfigured: false };
const entry = (id, kind, currency, amount, extra = {}) => ({ id, name: id, kind, currency, amount, quantity: 1, cost: 0, rate: 0, date: '2026-10-01', frequency: 'Once', notes: '', ...extra });
const missingRate = shown => { assert.ok(shown.includes('—'), shown); assert.ok(shown.includes('Exchange rate unavailable.'), shown); assert.doesNotMatch(shown, /£|GBP|\$/, shown); };
const mountScreen = (file, name, props, modules = {}) => { const r = createRenderer(), ui = stubs(); const Component = r.load(file, { ...ui.modules, ...inEuros, ...modules })[name]; r.mount(React.createElement(Component, props)); return text(r.tree); };
const foundation = (...names) => Object.fromEntries(names.map(name => ['@/components/presentation-foundation/' + name, hostModule()]));

test('Recurring › Reminders lists each reminder in the display currency (MONEY-008)', () => {
 const reminders = [{ key: 'rent', record: entry('Rent', 'Rent expense', 'USD', 1000), amount: 1000, date: '2026-10-10', overdue: false }, { key: 'tv', record: entry('Licence', 'Other expense', 'GBP', 50), amount: 50, date: '2026-10-12', overdue: true }];
 const panel = list => mountScreen('components/reminder-panel.tsx', 'ReminderPanel', { data: {}, preferences: { data: { preferences: [] }, save: async () => {} } }, { '@/lib/daily-finance': { dueReminders: () => list }, ...foundation('panel-title') });
 const shown = panel(reminders);
 assert.ok(shown.includes(eur(900)), shown);
 missingRate(shown);
 assert.ok(!panel(reminders.slice(0, 1)).includes('Exchange rate unavailable.'), 'the note only when a rate is missing');
});

test('Transactions suggestions and duplicates show amounts in the display currency (MONEY-008)', () => {
 const insights = { cadenceLabels: { monthly: 'Monthly' }, recurringPlanDraft: () => ({}), recurringSuggestions: () => [{ id: 's', record: entry('Gym', 'Other expense', 'USD', 50), cadence: 'monthly', next: '2026-11-01', changed: true, previous: 40 }], suspectedDuplicates: () => [[entry('Coffee', 'Other expense', 'GBP', 10), entry('Coffee', 'Other expense', 'GBP', 10)]] };
 const shown = mountScreen('components/transaction-insights.tsx', 'TransactionInsights', { owner: null, records: [], today: '2026-10-09', onReview() {} }, { '@/lib/recurring-insights': insights, '@/hooks/use-owner-resource': { useOwnerResource: () => ({}) }, '@/lib/planning': { emptyPlanning: {} }, ...foundation('resource-state') });
 assert.ok(shown.includes(eur(45)) && shown.includes('Last amount changed from ' + eur(36) + '.'), shown);
 missingRate(shown);
});

test('a business’s other assets and debts read in the display currency, a debt with its minus (MONEY-008)', () => {
 const shown = mountScreen('components/planning/accounts/business-holdings.tsx', 'BusinessHoldings', { records: [entry('Van', 'Vehicle', 'USD', 1000), entry('Credit', 'Loan', 'USD', 500), entry('Shop', 'Property', 'GBP', 100)], market }, foundation('category-icon', 'count', 'panel-title'));
 assert.ok(shown.includes(eur(900)) && shown.includes('−' + eur(450)), shown);
 assert.ok(!shown.includes('−—'), 'a debt without a rate is just missing');
 missingRate(shown);
});

test('monthly mortgage payments convert, and without a rate read as missing (MONEY-008)', () => {
 const props = { records: [entry('Home', 'Mortgage', 'USD', 100000, { estimated_monthly_payment: 1000 }), entry('Flat', 'Mortgage', 'GBP', 80000, { estimated_monthly_payment: 700 })], currency: 'EUR', market, loading: false, error: '', onPay() {}, onEdit() {} };
 const shown = mountScreen('components/monthly-mortgage-payments.tsx', 'MonthlyMortgagePayments', props, foundation('category-icon', 'inline-error', 'panel-title', 'row-menu', 'loading-placeholder'));
 assert.ok(shown.includes(eur(900)) && shown.includes(eur(90000)), shown);
 missingRate(shown);
});

const AssetCard = Object.assign(({ record, worth, fact, note, details }) => React.createElement('article', { 'data-id': record.id }, worth, ' ', fact?.value, note, details), { displayName: 'AssetCard' });
const assetModules = { '@/components/presentation-foundation/asset-card': { AssetCard }, ...foundation('count', 'inline-error', 'loading-placeholder', 'partial-total', 'empty-state', 'animated-money', 'segmented', 'pagination'), 'next/link': hostModule(), 'lucide-react': hostModule(), '@/components/ui/dropdown-menu': hostModule() };

test('an investment account card shows its total and each holding in the display currency (MONEY-008)', () => {
 const account = (id, currency) => ({ id, kind: 'Stock', name: id, currency });
 const holdings = [entry('AAA', 'Stock', 'USD', 100, { quantity: 2, holding_account_id: 'usd' }), entry('BBB', 'Stock', 'GBP', 10, { holding_account_id: 'usd' }), entry('CCC', 'Stock', 'USD', 50, { holding_account_id: 'pounds' })];
 const card = (accounts, records) => mountScreen('components/asset-accounts.tsx', 'AssetAccounts', { currency: 'EUR', portfolioTotal: 1000, onEdit() {}, onTrack() {}, demo: false, accountCount: 0, children: null, accounts, records, market, loading: false, error: '', onRetry() {}, onAdd() {} }, assetModules);
 const shown = card([account('usd', 'USD')], holdings.slice(0, 1));
 assert.equal(shown.split(eur(180)).length - 1, 2, 'the total and the holding both in euros: ' + shown);
 assert.doesNotMatch(shown, /\$/);
 // A USD account's pound holding reads "—", and so does the account total that needs it.
 const partial = card([account('usd', 'USD')], holdings.slice(0, 2));
 assert.ok(partial.startsWith('Accounts') && partial.includes('— ') && partial.includes('BBB—') && partial.includes('The account total is unavailable.') && !/£|\$/.test(partial), partial);
 // A GBP account (no rate) never shows its total in pounds; its dollar holding still converts.
 const pounds = card([account('pounds', 'GBP')], holdings.slice(2));
 assert.ok(pounds.includes(eur(45)) && pounds.includes('—') && !pounds.includes('£'), pounds);
});

test('a holding card converts, its converted price per unit reads to the cent, and one without a rate reads as missing (MONEY-006, MONEY-008)', () => {
 const props = { accounts: [], accountsLoading: false, accountsError: '', onRetryAccounts() {}, onAddHolding() {}, currency: 'EUR', market, netWorth: 0, debt: 0, forecast: {}, forecastReady: true, loading: false, demo: false, onAdd() {}, onEdit() {}, onTrack() {}, onDelete() {}, quoteLabel: () => 'Manual' };
 const dashboard = records => mountScreen('components/asset-dashboard.tsx', 'AssetDashboard', { ...props, records }, { ...assetModules, '@/components/asset-accounts': hostModule() });
 const shown = dashboard([entry('AAA', 'Stock', 'USD', 711.28, { quantity: 2 })]);
 assert.ok(shown.includes(eur(1280.304)) && shown.includes('€640.15'), shown);
 assert.doesNotMatch(shown, /€\d+\.\d{3,}/, 'no calculation tail');
 // A quote already in the display currency keeps the decimals the person typed.
 assert.ok(dashboard([entry('BBB', 'Stock', 'EUR', 0.12345678)]).includes('€0.12345678'));
 // Without a rate the worth, gain and price read "—"; only the labelled saved value keeps the record's own currency.
 missingRate(dashboard([entry('CCC', 'Stock', 'GBP', 10, { cost: 5 })]).replace(/Saved value.*/, ''));
});

test('a schedule’s details convert its totals, payments and chart, and without a rate the chart gives way to a note (MONEY-008)', () => {
 const pay = entry('Pay', 'Salary', 'USD', 1000, { date: '2026-08-15', frequency: 'Monthly' });
 const data = currency => ({ records: [{ ...pay, currency }, entry('a', 'Salary', currency, 800, { date: '2026-08-15' })], occurrences: [{ id: 'o', record_id: 'Pay', due_on: '2026-08-15', status: 'paid', transaction_id: 'a' }], debtPayments: [] });
 const item = currency => ({ key: 'Pay:2026-10-15', record: { ...pay, currency }, date: '2026-10-15', status: 'due', direction: 'income', amount: 1000 });
 const h = React.createElement, pass = name => Object.assign(({ children, data: points }) => h('div', { 'data-part': name, 'data-points': points && JSON.stringify(points) }, children), { displayName: name });
 const recharts = { ...Object.fromEntries(['ResponsiveContainer', 'BarChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip'].map(name => [name, pass(name)])), Bar: () => h('span', { 'data-bar': true }) };
 const r = createRenderer();
 const { RecurringDetails } = r.load('components/planning/recurring-details.tsx', { ...stubs().modules, ...inEuros, recharts, '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value } });
 r.mount(React.createElement(RecurringDetails, { item: item('USD'), data: data('USD'), today: '2026-10-20', onClose() {} }));
 const shown = text(r.tree);
 assert.ok(shown.includes(eur(900)) && shown.includes(eur(720)) && !shown.includes('$'), shown);
 const points = JSON.parse(r.find(node => node.props?.['data-part'] === 'BarChart').props['data-points']);
 assert.deepEqual(points.find(point => point.month === '2026-08'), { month: '2026-08', scheduled: 900, recorded: 720 });
 r.mount(React.createElement(RecurringDetails, { item: item('GBP'), data: data('GBP'), today: '2026-10-20', onClose() {} }));
 missingRate(text(r.tree));
 assert.equal(r.all(node => node.props?.['data-bar']).length, 0);
});
