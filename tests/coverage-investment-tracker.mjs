import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const h = React.createElement;
const { formatMoney, formatDate, formatMonthYear } = loadTS('lib/format.ts');
const { depositToday, depositInterest, depositProjection } = loadTS('lib/deposit-interest.ts');
const r = createRenderer();
// Each view renders its component from scratch; the view is the renderer, holding that tree.
const mount = (Component, props) => (r.mount(React.createElement(Component, props)), r);
const ui = stubs();
const named = (name, render) => Object.assign(render, { displayName: name });
const pass = name => named(name, ({ children }) => h('div', { 'data-part': name }, children));
const chart = Object.fromEntries(['ResponsiveContainer', 'LineChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip', 'Legend'].map(name => [name, pass(name)]));
const Line = named('Line', ({ dataKey, name }) => h('span', { 'data-line': dataKey }, name));
const ConfirmDialog = named('ConfirmDialog', ({ open, title, description, confirmLabel }) => open ? h('div', { role: 'dialog' }, h('h3', null, title), h('p', null, description), h('button', null, confirmLabel)) : null);
const InlineError = named('InlineError', ({ message }) => h('p', { className: 'inline-error' }, message));
const LoadingPlaceholder = named('LoadingPlaceholder', ({ label }) => h('p', { className: 'loading' }, label));
const ToggleGroup = named('ToggleGroup', ({ children, value }) => h('div', { 'data-toggle': value }, children));
const ToggleGroupItem = named('ToggleGroupItem', ({ children, value }) => h('button', { value }, children));
const AssetMovementDialog = named('AssetMovementDialog', ({ initial }) => h('div', { className: 'movement' }, JSON.stringify(initial)));
const fx = { rates: {}, retries: 0 };
const api = { calls: [], handler: async () => ({}) };
const feedback = { saved: 0 };
const { InvestmentTracker } = r.load('components/investment-tracker.tsx', {
 ...ui.modules,
 recharts: { ...chart, Line },
 '@/lib/feedback': { showSaved: () => feedback.saved++ },
 '@/lib/api-client': { requestJson: (url, options) => { api.calls.push({ url, ...options }); return api.handler(url, options); } },
 '@/components/discard-changes': { useDraftDialog: (value, onClose, busy) => ({ close: () => { if (!busy) onClose(); }, confirmation: h('i', { 'data-guard': '' }) }) },
 '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to) => ({ rate: !from || !to ? null : from === to ? 1 : fx.rates[from + to] ?? null, retry() { fx.retries++; } }) },
 '@/components/presentation-foundation/loading-placeholder': { LoadingPlaceholder },
 '@/components/presentation-foundation/confirm-dialog': { ConfirmDialog },
 '@/components/presentation-foundation/inline-error': { InlineError },
 '@/components/ui/toggle-group': { ToggleGroup, ToggleGroupItem },
 '@/components/planning/asset-movement-dialog': { AssetMovementDialog },
});

const money = (value, currency = 'USD') => formatMoney(value, currency, 'en-US');
const event = (id, event_type, occurred_on, extra = {}) => ({ id, record_id: 'r', event_type, occurred_on, amount: 0, balance: null, ownership_percentage: 100, principal: 0, interest: 0, notes: '', created_at: occurred_on + 'T00:00:00Z', account_link: null, ...extra });
const wallet = { id: 'cash', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 1000 };
const euro = { id: 'eur', name: 'Euro cash', kind: 'Cash', currency: 'EUR', amount: 1000 };
const broker = { id: 'brk', name: 'Brokerage', kind: 'Stock', currency: 'USD', amount: 500 };
const record = (kind, extra = {}) => ({ id: 'r', name: kind + ' asset', kind, currency: 'USD', amount: 0, rate: 0, ...extra });

let requests = [];
function serve(response) {
 requests = [];
 globalThis.fetch = (url, init) => { requests.push({ url, signal: init.signal }); return typeof response === 'function' ? response(url, init) : Promise.resolve({ ok: true, json: async () => response }); };
}

async function open(entry, events = [], props = {}) {
 serve(events);
 const calls = { closed: 0, saved: 0, payments: 0, draft: [] };
 const view = mount(InvestmentTracker, { record: entry, accounts: [wallet, euro, broker], onClose: () => calls.closed++, onSaved: () => calls.saved++, onPayment: () => calls.payments++, onDraftState: (dirty, busy) => calls.draft.push([dirty, busy]), ...props });
 await view.flush();
 const selects = () => view.all(element => element.type === ui.NativeSelect);
 const accountSelect = () => selects().find(element => element.props.required);
 const typeSelect = () => selects().find(element => !element.props.required);
 const setType = type => { typeSelect().props.onChange({ target: { value: type } }); view.update(); };
 const setAccount = id => { accountSelect().props.onChange({ target: { value: id } }); view.update(); };
 const inputs = () => view.all(element => element.type === ui.FormattedNumberInput);
 const label = prefix => view.find(element => element.type === 'label' && text(element).startsWith(prefix));
 const setNumber = (prefix, value, blank = false) => { label(prefix).props.children.find(child => child?.type === ui.FormattedNumberInput).props.onValueChange(value, blank); view.update(); };
 const saveButton = () => view.find(byType(ui.FormFooter)).props.children;
 const save = async () => { await saveButton().props.onClick(); view.update(); };
 const button = name => view.find(byType(ui.Button, name));
 return { view, calls, selects, accountSelect, typeSelect, setType, setAccount, inputs, label, setNumber, saveButton, save, button };
}

test('the tracker loads the record history and shows a loading placeholder until it arrives', async () => {
 let resolve;
 serve(() => new Promise(done => { resolve = done; }));
 const view = mount(InvestmentTracker, { record: record('Cash'), onClose() {}, onSaved() {}, onPayment() {} });
 assert.equal(requests[0].url, '/api/investment-history?record=r');
 assert.match(view.html(), /<p class="loading">Loading history…<\/p>/);
 assert.equal(view.find(byType('fieldset')).props.disabled, true);
 resolve({ ok: true, json: async () => [] });
 await view.flush();
 const html = view.html();
 assert.doesNotMatch(html, /Loading history/);
 assert.match(html, /<p>No history yet.<\/p>/);
 assert.match(html, /<small>Account balance<\/small><strong>—<\/strong>/);
 assert.match(html, /Account balance after update/);
});

test('a failed history request shows its error, and responses after closing are ignored', async () => {
 serve(() => Promise.resolve({ ok: false, json: async () => ({ error: 'History unavailable' }) }));
 const view = mount(InvestmentTracker, { record: record('Property'), onClose() {}, onSaved() {}, onPayment() {} });
 await view.flush();
 assert.match(view.html(), /role="alert">History unavailable</);
 assert.doesNotMatch(view.html(), /Loading history/);

 for (const outcome of ['resolve', 'reject']) {
  let settle;
  serve(() => new Promise((done, fail) => { settle = outcome === 'resolve' ? done : fail; }));
  const closed = mount(InvestmentTracker, { record: record('Property'), onClose() {}, onSaved() {}, onPayment() {} });
  closed.unmount();
  assert.equal(requests[0].signal.aborted, true);
  settle(outcome === 'resolve' ? { ok: true, json: async () => [event('late', 'valuation', '2026-01-01', { balance: 5 })] } : Error('aborted'));
  await closed.flush();
  assert.match(closed.html(), /Loading history…/);
  assert.doesNotMatch(closed.html(), /role="alert"/);
 }
});

test('a cash balance update needs an entered value, saves it, reloads history and offers transfers', async () => {
 const { view, calls, saveButton, save, setNumber, button } = await open(record('Cash', { amount: 800 }), [event('b', 'baseline', '2026-09-01', { balance: 800 })]);
 let html = view.html();
 assert.match(html, /<h2>Cash asset · Tracker<\/h2>/);
 assert.match(html, /Track your cash balance and transfers between accounts./);
 assert.ok(html.includes(`<small>Account balance</small><strong>${money(800)}</strong>`));
 assert.doesNotMatch(html, /Income received|Expense paid|data-line="contributions"/);
 assert.match(html, /Account balance after update/);
 assert.match(html, /Use Balance update to confirm a cash balance/);
 assert.match(html, /History shows confirmed balances and account movements./);
 assert.doesNotMatch(html, /Delete newer balance updates first/);
 assert.equal(view.all(element => element.type === ui.NativeSelect && element.props.required).length, 0);
 assert.equal(saveButton().props.disabled, true);
 await save();
 assert.equal(api.calls.length, 0);
 setNumber('Account balance after update', 950);
 assert.equal(saveButton().props.disabled, false);
 assert.deepEqual(calls.draft.at(-1), [true, false]);
 api.calls = []; feedback.saved = 0;
 api.handler = async () => ({});
 serve([event('b', 'baseline', '2026-09-01', { balance: 800 }), event('v', 'valuation', depositToday(), { balance: 950 })]);
 await save();
 assert.equal(api.calls[0].url, '/api/investment-history');
 assert.deepEqual({ ...api.calls[0].body, id: undefined }, { id: undefined, record_id: 'r', type: 'valuation', date: depositToday(), amount: 0, balance: 950, notes: '' });
 assert.equal(feedback.saved, 1);
 assert.equal(calls.saved, 1);
 assert.equal(calls.closed, 0);
 assert.match(view.html(), /Loading history…/);
 await view.flush();
 html = view.html();
 assert.equal(requests.length, 1);
 assert.ok(html.includes(`<strong>${money(950)}</strong>`));
 assert.equal(saveButton().props.disabled, true);
 button('Transfer money').props.onClick();
 view.update();
 const movement = view.find(byType(AssetMovementDialog));
 assert.deepEqual(movement.props.initial, { kind: 'transfer', source_id: 'r' });
 assert.deepEqual(movement.props.records.map(entry => entry.id), ['cash', 'eur', 'brk', 'r']);
 movement.props.onClose();
 view.update();
 assert.equal(view.all(element => element.type === AssetMovementDialog).length, 0);
});

test('a property contribution from a foreign-currency account converts the cash leg and can keep or replace the value', async () => {
 fx.rates = { EURUSD: 1.25 }; fx.retries = 0;
 const { view, setType, setAccount, setNumber, saveButton, save, typeSelect } = await open(record('Property', { amount: 90000 }), [event('b', 'baseline', '2026-01-01', { balance: 90000 })]);
 assert.deepEqual(typeSelect().props.children.map(text), ['Value update', 'Money invested', 'Sale / withdrawal', 'Rent income', 'Expense paid']);
 assert.match(view.html(), /Full asset value after update/);
 setType('contribution');
 let html = view.html();
 assert.match(html, /data-toggle="keep"/);
 assert.match(html, /The asset value stays unchanged. Only the cash movement is recorded./);
 assert.doesNotMatch(html, /Full asset value after update/);
 assert.match(html, /Cash amount \(your share\) · USD/);
 assert.match(html, /Use Value update for a valuation. Record invested money/);
 assert.match(html, /Past valuations do not replace a newer balance.</);
 setAccount('eur');
 setNumber('Cash amount', 500);
 html = view.html();
 assert.match(html, /class="fx">rate 1.25</);
 assert.ok(html.includes(`Available for this payment: ${money(1250)}`));
 assert.ok(html.includes(`Cash deducted from Euro cash: ${money(400, 'EUR')}`));
 assert.ok(html.includes(`Cash balance after update: ${money(600, 'EUR')}`));
 assert.equal(saveButton().props.disabled, false);

 const toggle = () => view.find(byType(ToggleGroup));
 toggle().props.onValueChange('');
 toggle().props.onValueChange('keep');
 view.update();
 assert.equal(toggle().props.value, 'keep');
 toggle().props.onValueChange('change');
 view.update();
 assert.equal(toggle().props.value, 'change');
 assert.match(view.html(), /Full asset value after update/);
 assert.equal(saveButton().props.disabled, true);
 setNumber('Full asset value after update', 91000);
 assert.equal(saveButton().props.disabled, false);
 toggle().props.onValueChange('change');
 toggle().props.onValueChange('keep');
 view.update();
 assert.equal(toggle().props.value, 'keep');
 toggle().props.onValueChange('change');
 view.update();
 setNumber('Full asset value after update', 91000);

 api.calls = [];
 api.handler = async () => { throw Object.assign(Error('Rate changed'), { confirmedFailure: true }); };
 await save();
 assert.equal(api.calls[0].url, '/api/investment-history/exchange');
 assert.equal(api.calls[0].body.exchange_rate, 1.25);
 assert.equal(api.calls[0].body.balance, 91000);
 assert.equal(fx.retries, 1);
 assert.match(view.html(), /role="alert">Rate changed</);
 assert.equal(text(saveButton()), 'Save update');

 api.handler = async () => { throw Error('Connection reset'); };
 await save();
 assert.equal(text(saveButton()), 'Retry update');
 assert.match(view.html(), /Retry with the same details to avoid duplicates./);
 assert.equal(view.find(byType('fieldset')).props.disabled, true);
 assert.equal(fx.retries, 1);
 api.handler = async () => ({});
 serve([]);
 await save();
 assert.equal(api.calls[2].body.id, api.calls[1].body.id);
 assert.equal(api.calls[2].body.exchange_rate, 1.25);
 assert.doesNotMatch(view.html(), /Retry with the same details/);
});

test('an outgoing payment larger than the cash balance is refused, and changing the type resets the cash leg', async () => {
 const { view, setType, setAccount, setNumber, saveButton } = await open(record('Stock', { amount: 1000 }), [], { initialType: 'expense' });
 assert.match(view.html(), /Use Value update for a valuation, Buy or Sell \/ convert for trades/);
 setAccount('cash');
 setNumber('Cash amount', 1500);
 assert.match(view.html(), /<p class="inline-error">Not enough money in the selected cash account.<\/p>/);
 assert.equal(saveButton().props.disabled, true);
 setType('income');
 assert.equal(view.find(byType(ui.NativeSelect, 'Choose a cash account')).props.value, '');
 assert.equal(view.all(element => element.type === ui.FormattedNumberInput)[0].props.value, 0);
 setAccount('cash');
 setNumber('Cash amount', 1500);
 assert.ok(view.html().includes(`Cash added to Wallet: ${money(1500)}`));
 assert.doesNotMatch(view.html(), /Available for this payment/);
 assert.equal(saveButton().props.disabled, false);
 setAccount('');
 assert.equal(saveButton().props.disabled, true);
});

test('money lent tracks additions and repayments against the outstanding balance', async () => {
 const events = [
  event('b', 'baseline', '2026-03-01', { balance: 1000, notes: 'Opening' }),
  event('c', 'contribution', '2026-04-01', { amount: 200, balance: 1200, account_link: { account_id: 'cash', amount: -200 } }),
  event('w', 'withdrawal', '2026-05-01', { amount: 100, balance: 1100, account_link: { account_id: 'gone', amount: 90, account_currency: 'EUR' } }),
 ];
 const { view, setType, setAccount, setNumber, saveButton, label, inputs } = await open(record('Money lent', { amount: 1100 }), events);
 let html = view.html();
 assert.match(html, /Track additions and repayments against the outstanding balance./);
 assert.ok(html.includes(`<small>Amount owed to you</small><strong>${money(1100)}</strong>`));
 assert.ok(html.includes(`<small>Repayments recorded</small><strong>${money(100)}</strong>`));
 assert.ok(html.includes(`<small>Additions recorded</small><strong>${money(200)}</strong>`));
 assert.match(html, /data-line="balance">Amount owed to you</);
 assert.doesNotMatch(html, /data-line="contributions"/);
 assert.match(html, /Delete newer balance updates first/);
 assert.match(html, /History starts with a balance snapshot/);
 assert.match(html, /Enter updates on or after the latest balance date/);
 assert.ok(html.includes(`Cash deducted from Wallet: ${money(200)}`));
 assert.ok(html.includes(`Cash added to Cash account: ${money(90, 'EUR')}`));
 assert.ok(html.includes(`Principal amount: ${money(200)}`));
 assert.ok(html.includes(`<time>${formatDate('2026-03-01', 'en-US')}</time><p>Opening</p>`));
 assert.equal(view.all(element => element.type === ui.Button && text(element) === 'Delete update').length, 2);
 assert.equal(view.find(byType(ui.DatePicker)).props.min, '2026-05-01');
 assert.match(text(label('Pay from cash account')), /Pay from cash account/);
 assert.ok(html.includes(`Outstanding balance after update: ${money(1100)}`));
 setType('withdrawal');
 assert.match(text(label('Receive into cash account')), /Receive into cash account/);
 assert.equal(inputs()[0].props.max, 1100);
 setAccount('cash');
 setNumber('Principal amount', 1500);
 assert.ok(view.html().includes(`Outstanding balance after update: ${money(-400)}`));
 assert.equal(saveButton().props.disabled, true);
 setNumber('Principal amount', 300);
 assert.equal(saveButton().props.disabled, false);
 view.find(byType(ui.DatePicker)).props.onChange('2026-04-15');
 view.update();
 assert.equal(saveButton().props.disabled, true);
 html = view.html();
 assert.ok(html.includes(`Outstanding balance after update: ${money(800)}`));
});

test('inline repayments use payment wording and close the panel once saved', async () => {
 const { view, calls, setAccount, setNumber, save, saveButton } = await open(record('Debt', { amount: 500 }), [event('b', 'baseline', '2026-03-01', { balance: 500 })], { inline: true, initialType: 'withdrawal' });
 assert.equal(view.all(element => element.type === ui.Dialog).length, 0);
 const html = view.html();
 assert.match(html, /Enter any amount up to the outstanding balance/);
 assert.doesNotMatch(html, /Add a dated update|Update type/);
 assert.match(html, /<label>Payment date/);
 assert.equal(text(saveButton()), 'Save payment');
 setAccount('cash');
 setNumber('Principal amount', 200);
 api.calls = []; api.handler = async () => ({});
 await save();
 assert.equal(api.calls[0].body.type, 'withdrawal');
 assert.equal(api.calls[0].body.balance, null);
 assert.equal(calls.closed, 1);
});

test('debts and loans name the outstanding balance, and waiting or missing cash accounts are explained', async () => {
 const debt = await open(record('Debt'), [event('b', 'baseline', '2026-03-01', { balance: 400 })], { accountsReady: false });
 let html = debt.view.html();
 assert.match(html, /<small>Outstanding balance<\/small>/);
 assert.match(html, /Waiting for current cash account balances./);
 assert.equal(debt.accountSelect().props.disabled, true);
 const loan = await open(record('Loan'), [], { accounts: [] });
 html = loan.view.html();
 assert.match(html, /Add a cash account to record this transaction./);
 assert.match(html, /<small>Outstanding balance<\/small><strong>—<\/strong>/);
 assert.equal(loan.view.find(byType(ui.DatePicker)).props.min, '');
});

test('deposits show the interest estimate and open top-up, withdrawal and interest movements', async () => {
 const events = [event('b', 'baseline', '2026-09-01', { balance: 10000 })];
 for (const [compounding, label] of [[undefined, 'Monthly compounding'], ['daily', 'Daily compounding'], ['none', 'No compounding']]) {
  const entry = record('Deposit', { rate: 12, deposit_compounding: compounding });
  const { view, calls, button } = await open(entry, events, { accounts: [wallet, entry] });
  const html = view.html();
  const mode = compounding ?? 'monthly';
  assert.ok(html.includes(`Estimated interest for ${formatMonthYear(depositToday().slice(0, 7), 'en-US')}: ${money(depositInterest(events, 12, undefined, mode))}`));
  assert.ok(html.includes(`Estimated balance including interest: ${money(depositProjection(events, 12, undefined, mode).total)}`));
  assert.ok(html.includes(label + '. Top-ups and withdrawals affect interest'));
  assert.match(html, /Use Top-up or Withdraw to move money between accounts/);
  assert.match(html, /Use Balance update for a confirmed bank balance/);
  assert.match(html, /<small>Account balance<\/small>/);
  if (compounding) continue;
  for (const [name, initial] of [['Top-up', { kind: 'transfer', target_id: 'r' }], ['Withdraw', { kind: 'transfer', source_id: 'r' }], ['Record capitalized interest', { kind: 'interest', source_id: 'r' }]]) {
   button(name).props.onClick();
   view.update();
   const movement = view.find(byType(AssetMovementDialog));
   assert.deepEqual(movement.props.initial, initial);
   assert.deepEqual(movement.props.records.map(item => item.id), ['cash', 'r']);
   movement.props.onClose();
   view.update();
  }
  button('Top-up').props.onClick();
  view.update();
  api.calls = []; feedback.saved = 0;
  await view.find(byType(AssetMovementDialog)).props.save({ id: 'm', kind: 'transfer' });
  assert.deepEqual(api.calls[0], { url: '/api/asset-movements', body: { id: 'm', kind: 'transfer' } });
  assert.equal(feedback.saved, 1);
  assert.equal(calls.saved, 1);
  assert.equal(calls.closed, 1);
 }
});

test('stocks plot value, contributions and income, and format chart axes through the shared formatters', async () => {
 const events = [
  event('b', 'baseline', '2026-01-10', { balance: 2000, ownership_percentage: 50 }),
  event('c', 'contribution', '2026-02-10', { amount: 300 }),
  event('i', 'income', '2026-03-10', { amount: 40 }),
  event('e', 'expense', '2026-03-12', { amount: 15 }),
 ];
 const { view, button } = await open(record('Stock'), events);
 const html = view.html();
 assert.ok(html.includes(`<small>Latest tracked value (your share)</small><strong>${money(1000)}</strong>`));
 assert.ok(html.includes(`<small>Income received</small><strong>${money(40)}</strong>`));
 assert.ok(html.includes(`<small>Expense paid</small><strong>${money(15)}</strong>`));
 assert.match(html, /data-line="balance">Value \(your share\)<\/span><span data-line="contributions">Net contributions recorded<\/span><span data-line="receipts">Income received</);
 assert.match(html, /Dated values and actual cash movements. Estimates stay separate./);
 assert.match(html, /History starts with a current snapshot/);
 assert.ok(html.includes(`<strong>${money(1000)}</strong><span>`) || html.includes(`<strong>${money(1000)}</strong></div>`));
 assert.equal(view.all(element => element.type === ui.Button && text(element) === 'Delete update').length, 0);
 const timestamp = Date.parse('2026-03-10T00:00:00Z');
 assert.equal(view.find(byType(chart.XAxis)).props.tickFormatter(timestamp), formatDate('2026-03-10', 'en-US'));
 assert.equal(view.find(byType(chart.YAxis)).props.tickFormatter(1234.4), money(1234));
 const tooltip = view.find(byType(chart.Tooltip)).props;
 assert.equal(tooltip.labelFormatter(String(timestamp)), formatDate('2026-03-10', 'en-US'));
 assert.equal(tooltip.formatter('99.6'), money(100));
 for (const [name, initial] of [['Buy', { kind: 'buy', target_id: 'r' }], ['Sell / convert', { kind: 'sell', source_id: 'r' }]]) {
  button(name).props.onClick();
  view.update();
  assert.deepEqual(view.find(byType(AssetMovementDialog)).props.initial, initial);
  view.find(byType(AssetMovementDialog)).props.onClose();
  view.update();
 }
});

test('mortgages show principal and interest paid and hand payments to the payment form', async () => {
 const events = [event('b', 'baseline', '2026-01-01', { balance: 100000 }), event('p', 'mortgage_payment', '2026-02-01', { amount: 1500, principal: 1000, interest: 500 })];
 const { view, calls, button, typeSelect } = await open(record('Mortgage'), events);
 const html = view.html();
 assert.ok(html.includes(`<small>Principal repaid</small><strong>${money(1000)}</strong>`));
 assert.ok(html.includes(`<small>Interest paid</small><strong>${money(500)}</strong>`));
 assert.ok(html.includes(`Principal repayment: ${money(1000)} · Interest paid: ${money(500)}`));
 assert.ok(html.includes(`Cash amount (your share): ${money(1500)}`));
 assert.ok(html.includes(`<small>Outstanding balance</small><strong>${money(100000)}</strong>`));
 assert.deepEqual(typeSelect().props.children.map(text), ['Additional borrowing']);
 assert.match(html, /Receive into cash account/);
 button('Record payment').props.onClick();
 assert.equal(calls.payments, 1);
 assert.equal(view.all(element => element.type === ui.Button && text(element) === 'Delete update').length, 0);
});

test('business updates can be deleted after confirmation, and a failed delete reports its error', async () => {
 const events = [event('b', 'baseline', '2026-01-01', { balance: 5000 }), event('v', 'valuation', '2026-02-01', { balance: 6000, amount: 250 })];
 const { view, calls } = await open(record('Business'), events);
 assert.match(view.html(), /Business valuations use the current ownership share./);
 const confirm = () => view.find(byType(ConfirmDialog));
 await confirm().props.onConfirm();
 assert.equal(api.calls.filter(call => call.method === 'DELETE').length, 0);
 const remove = () => view.find(byType(ui.Button, 'Delete update'));
 assert.equal(remove().props.disabled, false);
 remove().props.onClick();
 view.update();
 let html = view.html();
 assert.match(html, /<h3>Delete this tracker update\?<\/h3>/);
 assert.ok(html.includes(`Value update · ${formatDate('2026-02-01', 'en-US')} · ${money(250)}`));
 confirm().props.onClose();
 view.update();
 assert.equal(confirm().props.open, false);

 remove().props.onClick();
 view.update();
 api.calls = [];
 let finish;
 api.handler = () => new Promise(resolve => { finish = resolve; });
 serve([events[0]]);
 const pending = confirm().props.onConfirm();
 view.update();
 assert.equal(confirm().props.confirmLabel, 'Deleting…');
 assert.equal(confirm().props.busy, true);
 await confirm().props.onConfirm();
 assert.equal(api.calls.length, 1);
 finish(); await pending;
 assert.deepEqual(api.calls[0], { url: '/api/investment-history', method: 'DELETE', body: { id: 'v', record_id: 'r' } });
 assert.equal(calls.saved, 1);
 view.update();
 assert.equal(confirm().props.open, false);
 await view.flush();
 assert.equal(requests.length, 1);
 assert.equal(view.all(element => element.type === ui.Button && text(element) === 'Delete update').length, 0);

 const second = await open(record('Valuables'), [event('v', 'valuation', '2026-02-01', { balance: 10 })]);
 second.view.find(byType(ui.Button, 'Delete update')).props.onClick();
 second.view.update();
 assert.ok(second.view.html().includes(`Value update · ${formatDate('2026-02-01', 'en-US')}</p>`));
 api.handler = async () => { throw Error('Newer updates exist'); };
 await second.view.find(byType(ConfirmDialog)).props.onConfirm();
 second.view.update();
 assert.match(second.view.html(), /role="alert">Newer updates exist</);
 assert.equal(second.view.find(byType(ConfirmDialog)).props.open, false);
 assert.equal(second.calls.saved, 0);
});

test('an edited draft locks deletes, and the dialog closes through the guard unless saving', async () => {
 const { view, calls, setType, save, setAccount, setNumber } = await open(record('Property', { amount: 100 }), [event('v', 'valuation', '2026-02-01', { balance: 100 })], { initialType: 'withdrawal' });
 assert.equal(view.find(byType(ToggleGroup)).props.value, 'keep');
 view.find(byType('textarea')).props.onChange({ target: { value: 'Sold a room' } });
 view.update();
 assert.equal(view.find(byType('textarea')).props.value, 'Sold a room');
 assert.equal(view.find(byType(ui.Button, 'Delete update')).props.disabled, true);
 setType('valuation');
 assert.equal(view.all(element => element.type === ToggleGroup).length, 0);
 setType('withdrawal');
 setAccount('cash');
 setNumber('Cash amount', 50);
 let finish;
 api.handler = () => new Promise(resolve => { finish = resolve; });
 const pending = save();
 view.update();
 assert.equal(text(view.find(byType(ui.FormFooter)).props.children), 'Saving…');
 view.find(byType(ui.Dialog)).props.onOpenChange(false);
 assert.equal(calls.closed, 0);
 finish(); await pending;
 view.update();
 view.find(byType(ui.Dialog)).props.onOpenChange(true);
 assert.equal(calls.closed, 0);
 view.find(byType(ui.Dialog)).props.onOpenChange(false);
 assert.equal(calls.closed, 1);
});

test('an initial type the record does not support falls back to its first update type', async () => {
 const { view, typeSelect } = await open(record('Cash'), [], { initialType: 'income', onDraftState: undefined });
 assert.equal(typeSelect().props.value, 'valuation');
 assert.match(view.html(), /<h3>Add a dated update<\/h3>/);
 // A cash balance opened as a withdrawal falls back to a balance update and starts with an empty value.
 const cash = await open(record('Cash'), [], { initialType: 'withdrawal' });
 assert.equal(cash.typeSelect().props.value, 'valuation');
 assert.equal(cash.label('Account balance after update').props.children[1].props.value, 0);
 assert.equal(cash.saveButton().props.disabled, true);
 // History may arrive newest first; the latest balance date still bounds lending updates.
 const lent = await open(record('Money lent'), [event('n', 'valuation', '2026-06-01', { balance: 50 }), event('o', 'baseline', '2026-03-01', { balance: 100 })]);
 assert.equal(lent.view.find(byType(ui.DatePicker)).props.min, '2026-06-01');
 const bill = await open(record('Treasury bill', { rate: 5 }), []);
 assert.match(bill.view.html(), /Estimated interest for/);
 assert.deepEqual(bill.typeSelect().props.children.map(text), ['Balance update', 'Interest received', 'Expense paid']);
});

test('a foreign cash account without a quote shows no conversion, and amounts beyond the supported range are refused', async () => {
 fx.rates = {};
 const property = await open(record('Property'), [], { initialType: 'expense' });
 property.setAccount('eur');
 property.setNumber('Cash amount', 100);
 let html = property.view.html();
 assert.match(html, /class="fx">rate null</);
 assert.doesNotMatch(html, /Available for this payment|Cash deducted|Cash balance after update/);
 assert.equal(property.saveButton().props.disabled, true);

 const income = await open(record('Stock'), [], { initialType: 'income' });
 income.setAccount('cash');
 income.setNumber('Cash amount', 2e15);
 assert.equal(income.saveButton().props.disabled, true);
 income.setNumber('Cash amount', 1e6);
 assert.equal(income.saveButton().props.disabled, false);

 const lent = await open(record('Money lent'), [event('b', 'baseline', '2026-03-01', { balance: 100 })], { accounts: [{ ...wallet, amount: 5e15 }] });
 lent.setAccount('cash');
 lent.setNumber('Principal amount', 2e15);
 html = lent.view.html();
 assert.ok(html.includes(`Outstanding balance after update: ${money(2e15 + 100)}`));
 assert.equal(lent.saveButton().props.disabled, true);
});
