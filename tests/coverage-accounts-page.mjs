import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byLabel, byType, createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';

const { formatMoney, formatDate } = loadTS('lib/format.ts');
const { demoHousehold } = loadTS('lib/household.ts');
const directory = loadTS('lib/account-directory.ts');
const usd = (value, currency = 'USD') => formatMoney(value, currency, 'en-US');

const r = createRenderer();
const ui = stubs();
const errors = [], reorders = [];
let search = '';
const { AccountsPage } = r.load('components/planning/accounts-page.tsx', {
 ...ui.modules,
 '@/components/ui/dialog': { ...ui.modules['@/components/ui/dialog'], DialogTrigger: 'DialogTrigger' },
 '@/components/ui/dropdown-menu': hostModule(), '@/components/ui/input': hostModule(), 'lucide-react': hostModule(),
 'next/link': { __esModule: true, default: 'a' },
 ...Object.fromEntries(['page-header', 'segmented', 'empty-state', 'panel-title', 'stat-tile', 'animated-money', 'business-filter', 'business-mark', 'owner-filter', 'person-avatar', 'category-icon', 'count', 'sortable', 'pagination']
  .map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
 ...Object.fromEntries(['./statement-reconciliation', './corporate-event-dialog', './asset-movement-dialog', './account-operation', './holding-account-dialog', '@/components/account-businesses-dialog', '@/components/account-owners-dialog']
  .map(name => [name, hostModule()])),
 '@/hooks/use-location-search': { useLocationSearch: () => search, queryList: (query, key) => new URLSearchParams(query).getAll(key) },
 '@/hooks/use-display-order': { useDisplayOrder: (key, items) => ({ items, reorder: (...move) => reorders.push(move), disabled: false, error: '' }) },
 '@/lib/feedback': { showError: message => errors.push(message) },
 // Shown in a USD display currency at 1 USD = 0.9 EUR.
 '@/components/display-money': { useDisplayMoney: () => {
  const convert = (amount, from) => from === 'EUR' ? amount / 0.9 : amount, sum = list => list.reduce((total, row) => total + convert(row.amount, row.currency), 0);
  return { currency: 'USD', convert, sum, show: (amount, from) => usd(convert(amount, from)), showSum: list => usd(sum(list)) };
 } },
});

const wallet = { id: 'wallet', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 1000, rate: 0, date: '2026-01-01', shared: true };
const euro = { id: 'euro', name: 'Euro cash', kind: 'Cash', currency: 'EUR', amount: 500, rate: 0, date: '2026-01-01', business_id: 'b1', shared: false, member_id: demoHousehold.people[1].id };
const deposit = { id: 'dep', name: 'Savings deposit', kind: 'Deposit', currency: 'USD', amount: 2000, rate: 4.5, date: '2027-03-01', estimated_monthly_income: 7.5, shared: true };
const apple = { id: 'aapl', name: 'AAPL', kind: 'Stock', currency: 'USD', amount: 200, quantity: 10, holding_account_id: 'broker' };
const loose = { id: 'btc', name: 'Bitcoin', kind: 'Crypto', currency: 'USD', amount: 60000, quantity: 0.5 };
const van = { id: 'van', name: 'Delivery van', kind: 'Property', currency: 'USD', amount: 30000, quantity: 1, business_id: 'b1' };
const broker = { id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' };
const lunch = { id: 'lunch', name: 'Lunch', kind: 'Living expense', currency: 'USD', amount: 25, date: '2026-10-02', account_id: 'wallet' };
const data = {
 records: [wallet, euro, deposit, apple, loose, van, lunch], holdingAccounts: [broker], categories: [], occurrences: [],
 goals: [{ id: 'g1', account_id: 'wallet', allocated: 300, archived: false }, { id: 'g2', account_id: 'wallet', allocated: 999, archived: true }],
 activity: [{ id: 'op1', action: 'reconcile', account_id: 'wallet', target_id: null, amount: 40, fee: 0, occurred_on: '2026-10-01', notes: 'Counted', after_balance: 1000 }],
 movements: [{ id: 'm1', kind: 'buy', source_id: 'wallet', target_id: 'aapl', sent: 2000, received: 10, occurred_on: '2026-09-30', notes: '' }],
};

function open(props = {}) {
 const calls = { added: [], edited: [], deleted: [], assigned: [], saved: [] };
 r.mount(React.createElement(AccountsPage, {
  owner: 'me', onSaved() {}, data, save: async (action, payload) => { calls.saved.push([action, payload]); },
  onAdd: (...args) => calls.added.push(args), onEdit: record => calls.edited.push(record.id), onTrack() {}, onDelete: record => calls.deleted.push(record.id),
  demo: true, preferences: {}, market: null, currencies: ['USD', 'EUR'], currency: 'USD', saveAccount: async () => {},
  assignHolding: async (record, account) => { calls.assigned.push([record.id, account]); if (account === 'fail') throw Error('Could not move it.'); },
  businesses: [{ id: 'b1', name: 'Bakery' }], onAccountBusiness: async () => 0, household: null, onAccountOwner: async () => 0, ...props,
 }));
 return calls;
}
const html = () => r.html();
const button = label => r.find(node => node.type === ui.Button && text(node).includes(label));
const item = label => r.find(node => node.type === 'DropdownMenuItem' && text(node) === label);
const rowNames = () => r.all(node => node.type === 'span' && node.props.className === 'account-list-title').map(text);
const component = name => node => node.type?.name === name;
const showActivity = () => r.fire(r.find(byType('PageHeader')).props.tabs, 'onChange', 'activity');
const select = name => { r.fire(r.find(node => node.type === 'button' && node.props.className === 'account-list-row' && text(node).startsWith(name)), 'onClick'); };

test('the directory lists balances and investment accounts by group, with one total per currency', () => {
 const items = directory.directoryItems(data, null);
 assert.deepEqual(items.map(item => [item.key, item.group, item.total, item.count]), [['record:wallet', 'cash', 1000, null], ['record:euro', 'cash', 500, null], ['record:dep', 'deposits', 2000, null], ['investment:broker', 'investments', 2000, 1]]);
 assert.deepEqual(directory.currencyTotals(items), [{ currency: 'USD', total: 5000 }, { currency: 'EUR', total: 500 }]);
 assert.deepEqual(directory.currencyTotals([...items, { ...items[3], account: { ...broker, currency: 'EUR' }, total: null }]).map(item => item.total), [5000, null], 'a currency with an unpriced account has no total');
 assert.equal(directory.allocatedToGoals(data.goals, 'wallet'), 300, 'archived goals hold nothing');
 assert.deepEqual([directory.directoryBusiness(items[1]), directory.directoryBusiness(items[3])], ['b1', null]);
 assert.deepEqual(directory.unassignedHoldings(data.records).map(record => record.id), ['btc']);
});

test('Accounts shows one total in the display currency, the grouped directory and the selected cash account', () => {
 const calls = open();
 // One total in the display currency, never a figure per currency (XAPP-019): wallet 1,000 + €500 / 0.9 + deposit 2,000 + broker 10 × 200.
 assert.deepEqual(r.all(node => node.type === 'StatTile').map(node => node.props.label), ['Total']);
 assert.equal(Math.round(r.find(node => node.type === 'StatTile').props.value.props.value), 5556);
 const groups = r.all(node => node.type === 'details').map(node => text(node.children[0]));
 assert.equal(groups.length, 3);
 assert.ok(groups[0].startsWith('Cash') && groups[0].includes(usd(1000 + 500 / 0.9)) && !groups[0].includes('€'), groups[0]);
 assert.ok(html().includes('Bakery'), 'the business of an account is named under it');
 assert.equal(r.all(node => node.props?.['aria-label'] === 'Search accounts').length, 0, 'no search with six accounts or fewer');
 // The first account is selected: its goals' share and what is left.
 const card = r.find(node => node.type === 'article');
 assert.ok(text(card).includes('Wallet') && text(card).includes('Allocated to goals') && text(card).includes('Available'));
 assert.deepEqual(r.all(node => node.type === 'AnimatedMoney' && r.all(() => true, [card]).includes(node)).map(node => node.props.value), [1000, 300, 700]);
 r.fire(button('Adjust balance'), 'onClick');
 assert.deepEqual(r.find(byType('AccountOperation')).props.operation, { action: 'reconcile', account_id: 'wallet', amount: 1000 });
 r.fire(button('Reconcile statement'), 'onClick');
 assert.equal(r.find(byType('StatementReconciliation')).props.account.id, 'wallet');
 r.fire(item('Edit'), 'onSelect');
 assert.deepEqual(calls.edited, ['wallet']);
 // An account that savings goals still use is not deleted; the reason is shown instead.
 r.fire(item('Delete'), 'onSelect');
 assert.deepEqual(calls.deleted, []);assert.equal(errors.length, 1);
 // Dragging an account reorders it within its group.
 r.fire(r.find(node => node.type === 'SortableList' && node.props.id === 'accounts-cash'), 'onMove', 'euro', 'wallet');
 assert.deepEqual(reorders.at(-1), ['euro', 'wallet', ['wallet', 'euro']]);
});

test('reconciling a statement waits for a signed-in owner', () => {
 open({ owner: null });
 const reconcile = button('Reconcile statement');
 assert.equal(reconcile.props['aria-disabled'], true);assert.equal(reconcile.props.title, 'Available after you sign in.');
 r.fire(reconcile, 'onClick');
 assert.equal(r.all(byType('StatementReconciliation')).length, 0);
});

test('a deposit tops up, withdraws, records interest and shows its details', () => {
 open();
 select('Savings deposit');
 assert.ok(text(r.find(node => node.type === 'article')).includes('4.5% annual interest'));
 r.fire(button('Top-up'), 'onClick');
 assert.deepEqual(r.find(byType('AssetMovementDialog')).props.initial, { kind: 'transfer', target_id: 'dep' });
 r.fire(button('Withdraw'), 'onClick');
 assert.deepEqual(r.find(byType('AssetMovementDialog')).props.initial, { kind: 'transfer', source_id: 'dep' });
 r.fire(item('Record capitalized interest'), 'onSelect');
 assert.deepEqual(r.find(byType('AssetMovementDialog')).props.initial, { kind: 'interest', source_id: 'dep' });
 const details = html();
 assert.ok(details.includes(usd(7.5)) && details.includes(formatDate('2027-03-01', 'en-US')));
 r.fire(r.find(byType('AssetMovementDialog')), 'onClose');
 assert.equal(r.all(byType('AssetMovementDialog')).length, 0);
});

test('an investment account lists its holdings, which move, sell and change account from their rows', async () => {
 const calls = open();
 select('Broker');
 const card = text(r.find(node => node.type === 'article'));
 assert.ok(card.includes('1 holdings · USD') && card.includes('Stock account'));
 r.fire(button('Add holding'), 'onClick');
 r.fire(item('Add cash balance'), 'onSelect');
 assert.deepEqual(calls.added, [['Stock', 'broker'], ['Cash', 'broker']]);
 r.fire(item('Edit account'), 'onSelect');
 assert.equal(r.find(byType('HoldingAccountDialog')).props.existing, true);
 r.fire(r.all(node => node.type === 'DropdownMenuItem' && text(node) === 'Sell / convert')[0], 'onSelect');
 assert.deepEqual(r.find(byType('AssetMovementDialog')).props.initial, { kind: 'sell', source_id: 'aapl' });
 r.fire(r.all(node => node.type === 'DropdownMenuItem' && text(node) === 'Investment events')[0], 'onSelect');
 assert.equal(r.find(byType('CorporateEventDialog')).props.record.id, 'aapl');
 // The holding without an account sits in its own panel; moving it into one goes through assignHolding.
 const unassigned = r.find(node => node.type === 'section' && node.props.className === 'panel account-unassigned');
 const choose = r.all(node => node.type === ui.NativeSelect, [unassigned])[0];
 await choose.props.onChange({ target: { value: 'fail' } });r.update();
 assert.deepEqual(calls.assigned, [['btc', 'fail']]);
 assert.ok(html().includes('Could not move it.'));
});

test('Add account hands back cash and deposits, and opens the investment account form for the rest', () => {
 const calls = open();
 r.fire(button('Add account'), 'onClick');
 const dialog = r.find(component('AddAccountDialog'));
 assert.equal(dialog.props.open, true);
 const choose = title => r.fire(r.find(node => node.type === 'button' && text(node).startsWith(title)), 'onClick');
 choose('Interest-bearing deposit');
 assert.deepEqual(calls.added, [['Deposit']]);
 assert.equal(r.find(component('AddAccountDialog')).props.open, false);
 choose('Cash investment account');
 assert.deepEqual({ ...r.find(byType('HoldingAccountDialog')).props.account, id: undefined }, { id: undefined, kind: 'Cash', name: '', currency: 'USD' });
 assert.equal(r.find(byType('HoldingAccountDialog')).props.existing, false);
});

test('a business filter from the link narrows the accounts and lists the business’s other assets', () => {
 search = '?business=b1';
 open();
 search = '';
 assert.deepEqual(rowNames(), ['Euro cash']);
 assert.ok(text(r.find(node => node.type === 'section' && node.props.className === 'panel account-business-holdings')).includes('Delivery van'));
});

test('a shared household filters accounts by owner and shows who owns each', () => {
 open({ household: demoHousehold });
 assert.ok(button('Edit owners'));
 const filter = r.find(byType('OwnerFilter'));
 assert.deepEqual(filter.props.owners.map(owner => owner.name), ['Shared', 'Alex', 'Sam']);
 r.fire(filter, 'onChange', [demoHousehold.people[1].id]);
 assert.deepEqual(rowNames(), ['Euro cash']);
 assert.equal(r.all(byType('OwnerAvatar')).length, 1);
 r.fire(button('Edit owners'), 'onClick');
 assert.ok(r.find(byType('AccountOwnersDialog')));
});

test('more than six accounts bring a search, and an empty workspace offers to add the first account', () => {
 const many = Array.from({ length: 7 }, (_, i) => ({ ...wallet, id: 'w' + i, name: 'Wallet ' + i }));
 open({ data: { ...data, records: many, holdingAccounts: [] } });
 const box = r.find(byLabel('Search accounts'));
 r.fire(box, 'onChange', { target: { value: 'wallet 3' } });
 assert.deepEqual(rowNames(), ['Wallet 3']);
 r.fire(r.find(byLabel('Search accounts')), 'onChange', { target: { value: 'nothing' } });
 assert.ok(html().includes('No accounts match your search.'));
 open({ data: { ...data, records: [], holdingAccounts: [] } });
 assert.ok(r.find(byType('EmptyState')));
});

test('Recent activity lists operations, movements and income and expenses a page at a time', () => {
 open();
 showActivity();
 const page = html();
 assert.ok(page.includes('Reconcile balance') && page.includes('Counted') && page.includes(usd(40)));
 assert.ok(page.includes('Buy holding') && page.includes('10 units') && page.includes(usd(2000)));
 assert.ok(page.includes('Income &amp; expenses') && page.includes(usd(-25)), 'spending is money out');
 const pages = r.find(byType('Pagination')).props;
 assert.deepEqual([pages.summary, pages.page, pages.pageCount, pages.hasNext], ['Page 1 of 1 · 3 records', 1, 1, false]);
 open({ data: { ...data, activity: [], movements: [], records: [wallet] } });
 showActivity();
 assert.ok(html().includes('No account operations yet.'));
});
