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
