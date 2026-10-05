import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text, walk } from './helpers/component-tree.mjs';

const { formatMoney, formatNumber } = loadTS('lib/format.ts');
const { depositToday } = loadTS('lib/deposit-interest.ts');
const r = createRenderer();
// Each view renders its component from scratch; the view is the renderer, holding that tree.
const mount = (Component, props) => (r.mount(React.createElement(Component, props)), r);
const ui = stubs();
const fx = { rates: {}, retries: 0, calls: [] };
const guard = { closes: [] };
const { AssetMovementDialog } = r.load('components/planning/asset-movement-dialog.tsx', {
 ...ui.modules,
 '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to, date) => { fx.calls.push([from, to, date]); return { rate: !from || !to ? null : from === to ? 1 : fx.rates[from + to] ?? null, retry() { fx.retries++; } }; } },
 '@/components/discard-changes': { useDiscardChanges: (dirty, onClose, busy) => ({ close: () => { guard.closes.push({ dirty, busy }); if (!busy) onClose(); }, confirmation: React.createElement('i', { 'data-dirty': String(dirty) }) }) },
});

const usd = (value, currency = 'USD') => formatMoney(value, currency, 'en-US');
const units = value => `${formatNumber(value, 'en-US', 8)} units`;
const wallet = { id: 'cash', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 1000 };
const euro = { id: 'eur', name: 'Euro cash', kind: 'Cash', currency: 'EUR', amount: 500 };
const deposit = { id: 'dep', name: 'Savings deposit', kind: 'Deposit', currency: 'USD', amount: 2000 };
const apple = { id: 'aapl', name: 'AAPL', kind: 'Stock', currency: 'USD', amount: 0, quantity: 10, holding_account_id: 'broker' };
const bitcoin = { id: 'btc', name: 'Bitcoin (BTC)', kind: 'Crypto', currency: 'USD', amount: 0, quantity: 0.5 };
const records = [wallet, euro, deposit, apple, bitcoin];
const brokers = [{ id: 'broker', name: 'Broker' }];

function open(initial, props = {}) {
 const calls = { saved: [], closed: 0 };
 const view = mount(AssetMovementDialog, { initial, records, accounts: brokers, save: async movement => { calls.saved.push(movement); }, onClose: () => calls.closed++, ...props });
 const selects = () => view.all(element => element.type === ui.NativeSelect);
 const choose = (index, value) => { selects()[index].props.onChange({ target: { value } }); view.update(); };
 const field = label => view.find(element => element.type === 'label' && text(element).startsWith(label)).props.children.find(child => child?.type === ui.FormattedNumberInput);
 const enter = (label, value) => { field(label).props.onValueChange(value); view.update(); };
 const submit = async () => { await view.find(byType('form')).props.onSubmit({ preventDefault() {} }); view.update(); };
 const save = () => view.find(byType(ui.Button));
 return { view, calls, selects, choose, field, enter, submit, save };
}
const optionTexts = select => [...walk(select)].filter(element => element.type === 'option').map(text);

test('a same-currency transfer deducts the fee from what arrives and saves both sides together', async () => {
 const { view, calls, selects, choose, enter, submit, save } = open({ kind: 'transfer', source_id: 'cash' });
 let html = view.html();
 assert.match(html, /<h2>Transfer money<\/h2>/);
 assert.match(html, /Both sides are saved together/);
 assert.deepEqual(optionTexts(selects()[0]), ['Select account', `Wallet · ${usd(1000)}`, `Euro cash · ${usd(500, 'EUR')}`, `Savings deposit · ${usd(2000)}`]);
 assert.deepEqual(optionTexts(selects()[1]), ['Select account', `Euro cash · ${usd(500, 'EUR')}`, `Savings deposit · ${usd(2000)}`]);
 assert.ok(html.includes(`Available: ${usd(1000)}`));
 assert.match(html, /Total amount debited USD/);
 assert.match(html, /Fee included in these amounts USD/);
 assert.equal(save().props.disabled, true);
 choose(1, 'dep');
 enter('Total amount debited', 300);
 enter('Fee included in these amounts', 10);
 html = view.html();
 assert.ok(html.includes(`Net amount received: ${usd(290)}`));
 assert.ok(html.includes(`Wallet: ${usd(700)}`));
 assert.ok(html.includes(`Savings deposit: ${usd(2290)}`));
 assert.match(html, /Balances after this transaction/);
 assert.doesNotMatch(html, /class="fx"|role="alert"/);
 assert.match(html, /data-dirty="true"/);
 assert.equal(save().props.disabled, false);
 await submit();
 assert.equal(calls.saved.length, 1);
 const { id, ...movement } = calls.saved[0];
 assert.match(id, /^[0-9a-f-]{36}$/);
 assert.deepEqual(movement, { exchange_rate: undefined, kind: 'transfer', source_id: 'cash', target_id: 'dep', sent: 300, received: 290, source_value: 300, target_value: 290, fee: 10, date: depositToday(), notes: '' });
 assert.equal(calls.closed, 1);
});

test('a transfer fee at or above the amount sent is explained and blocks saving', async () => {
 const { view, calls, choose, enter, submit, save } = open({ kind: 'transfer', source_id: 'cash', target_id: 'dep' });
 enter('Total amount debited', 50);
 enter('Fee included in these amounts', 50);
 assert.match(view.html(), /<small role="alert" class="negative">The transfer fee must be less than the amount sent.<\/small>/);
 assert.equal(save().props.disabled, true);
 await submit();
 assert.equal(calls.saved.length, 0);
 // Choosing the destination as the new source clears the destination and the entered amounts.
 choose(0, 'dep');
 assert.equal(view.all(element => element.type === ui.NativeSelect)[1].props.value, '');
 assert.equal(view.find(byType(ui.FormattedNumberInput)).props.value, 0);
 choose(0, 'eur');
 assert.equal(view.all(element => element.type === ui.NativeSelect)[0].props.value, 'eur');
});

test('a cross-currency transfer converts with the dated rate, retries the quote after a refusal and resends the same rate', async () => {
 fx.rates = { USDEUR: 0.9 }; fx.retries = 0;
 let failure = { message: 'Rate expired', confirmedFailure: true };
 const attempts = [];
 const { view, calls, enter, submit, save } = open({ kind: 'transfer', source_id: 'cash', target_id: 'eur' }, { save: async movement => { attempts.push(movement); if (failure) throw Object.assign(Error(failure.message), { confirmedFailure: failure.confirmedFailure }); } });
 enter('Total amount debited', 100);
 let html = view.html();
 assert.match(html, /class="fx">rate 0.9</);
 assert.ok(html.includes(`Net amount received: ${usd(90, 'EUR')}`));
 assert.ok(html.includes(`Euro cash: ${usd(590, 'EUR')}`));
 await submit();
 assert.equal(attempts[0].exchange_rate, 0.9);
 assert.equal(attempts[0].received, 90);
 assert.equal(fx.retries, 1);
 assert.match(view.html(), /role="alert">Rate expired</);
 assert.equal(view.find(byType('fieldset')).props.disabled, false);
 assert.equal(text(save()), 'Save');

 // An unconfirmed failure keeps the stored rate even if the live quote moves.
 failure = { message: 'Timed out', confirmedFailure: false };
 await submit();
 fx.rates.USDEUR = 0.5;
 view.update();
 assert.equal(view.find(byType('fieldset')).props.disabled, true);
 assert.equal(text(save()), 'Retry');
 assert.equal(save().props.disabled, false);
 assert.equal(fx.retries, 1);
 failure = null;
 await submit();
 assert.equal(attempts[2].id, attempts[1].id);
 assert.equal(attempts[2].exchange_rate, 0.9);
 assert.equal(attempts[2].received, 90);
 assert.equal(calls.closed, 1);
});

test('a cross-currency transfer without a quote has nothing to receive and cannot be saved', () => {
 fx.rates = {};
 const { view, enter, save } = open({ kind: 'transfer', source_id: 'cash', target_id: 'eur' });
 enter('Total amount debited', 100);
 assert.match(view.html(), /class="fx">rate null</);
 assert.doesNotMatch(view.html(), /Net amount received:/);
 assert.equal(save().props.disabled, true);
});

test('buying a holding with same-currency cash uses the cash amount as the cost on both sides', async () => {
 const { view, calls, selects, choose, enter, submit, field } = open({ kind: 'buy', target_id: 'aapl' });
 let html = view.html();
 assert.match(html, /<h2>Buy holding<\/h2>/);
 assert.deepEqual(optionTexts(selects()[0]).slice(1), [`Wallet · ${usd(1000)}`, `Euro cash · ${usd(500, 'EUR')}`, `Savings deposit · ${usd(2000)}`, 'Broker · AAPL · USD', 'Bitcoin (BTC) · USD']);
 assert.deepEqual(optionTexts(selects()[1]).slice(1), ['Broker · AAPL · USD', 'Bitcoin (BTC) · USD']);
 assert.match(html, /Quantity received AAPL/);
 assert.match(html, /Fee included in these amounts USD/);
 assert.doesNotMatch(html, /Add the source and destination first/);
 choose(0, 'cash');
 enter('Total amount debited', 400);
 enter('Quantity received', 2);
 html = view.html();
 assert.doesNotMatch(html, /Total purchase cost|USDT and USDC/);
 assert.ok(html.includes(`Wallet: ${usd(600)}`));
 assert.ok(html.includes(`AAPL: ${units(12)}`));
 assert.equal(field('Total amount debited').props.maxMessage, `Only ${usd(1000)} available`);
 await submit();
 assert.deepEqual({ ...calls.saved[0], id: undefined }, { id: undefined, exchange_rate: undefined, kind: 'buy', source_id: 'cash', target_id: 'aapl', sent: 400, received: 2, source_value: 400, target_value: 400, fee: 0, date: depositToday(), notes: '' });
});

test('buying with another currency asks for the holding cost in its own currency', async () => {
 const { view, calls, enter, submit, save } = open({ kind: 'buy', source_id: 'eur', target_id: 'aapl' });
 enter('Total amount debited', 100);
 enter('Quantity received', 1);
 assert.match(view.html(), /Total purchase cost \(including fees\) USD/);
 assert.equal(save().props.disabled, true);
 enter('Total purchase cost (including fees) USD', 110);
 assert.equal(save().props.disabled, false);
 await submit();
 assert.equal(calls.saved[0].source_value, 100);
 assert.equal(calls.saved[0].target_value, 110);
 assert.equal(calls.saved[0].exchange_rate, undefined);
});

test('selling crypto for same-currency cash values both sides at the proceeds and notes stablecoins are holdings', async () => {
 const { view, calls, enter, submit, choose, field } = open({ kind: 'sell', source_id: 'btc' });
 let html = view.html();
 assert.match(html, /<h2>Sell \/ convert holding<\/h2>/);
 assert.ok(html.includes(`Available: ${units(0.5)}`));
 assert.match(html, /Quantity sent Bitcoin \(BTC\)/);
 assert.equal(field('Quantity sent').props.maxMessage, `Only ${units(0.5)} available`);
 choose(1, 'cash');
 enter('Quantity sent', 0.1);
 enter('Net amount received', 6000);
 html = view.html();
 assert.match(html, /USDT and USDC are crypto holdings/);
 assert.doesNotMatch(html, /Net sale proceeds/);
 assert.ok(html.includes(`Bitcoin (BTC): ${units(0.4)}`));
 assert.ok(html.includes(`Wallet: ${usd(7000)}`));
 await submit();
 assert.equal(calls.saved[0].source_value, 6000);
 assert.equal(calls.saved[0].target_value, 6000);
});

test('converting one holding into another asks for the shared proceeds value', async () => {
 const { view, calls, enter, submit, save } = open({ kind: 'sell', source_id: 'aapl', target_id: 'btc' });
 enter('Quantity sent', 5);
 enter('Quantity received', 0.01);
 assert.match(view.html(), /Net sale proceeds \(after fees\) USD/);
 assert.equal(save().props.disabled, true);
 enter('Net sale proceeds (after fees) USD', 900);
 await submit();
 assert.equal(calls.saved[0].source_value, 900);
 assert.equal(calls.saved[0].target_value, 900);
 // Selling more than is held is refused.
 const over = open({ kind: 'sell', source_id: 'aapl', target_id: 'btc' });
 over.enter('Quantity sent', 11);
 over.enter('Quantity received', 1);
 over.enter('Net sale proceeds (after fees) USD', 900);
 assert.equal(over.save().props.disabled, true);
});

test('buying a holding with a holding in another currency asks for both costs', () => {
 const sap = { id: 'sap', name: 'SAP', kind: 'Stock', currency: 'EUR', amount: 0, quantity: 3 };
 const { view } = open({ kind: 'buy', source_id: 'sap', target_id: 'aapl' }, { records: [...records, sap] });
 const labels = view.all(element => element.type === 'label').map(text);
 assert.ok(labels.includes('Total purchase cost (including fees) EUR'));
 assert.ok(labels.includes('Total purchase cost (including fees) USD'));
});

test('capitalized interest credits the deposit itself and sends no amount out', async () => {
 const { view, calls, enter, submit, save } = open({ kind: 'interest', source_id: 'dep' });
 let html = view.html();
 assert.match(html, /<h2>Record capitalized interest<\/h2>/);
 assert.match(html, /Record interest your bank has added to this deposit/);
 assert.equal(view.all(element => element.type === ui.NativeSelect).length, 1);
 assert.match(html, />Deposit<select/);
 assert.doesNotMatch(html, /Available:|Fee included|Add the source and destination first/);
 assert.equal(save().props.disabled, true);
 enter('Interest credited', 25);
 html = view.html();
 assert.ok(html.includes(`Savings deposit: ${usd(2025)}`));
 assert.doesNotMatch(html, /Wallet:/);
 await submit();
 assert.deepEqual({ ...calls.saved[0], id: undefined }, { id: undefined, exchange_rate: undefined, kind: 'interest', source_id: 'dep', target_id: 'dep', sent: 0, received: 25, source_value: 0, target_value: 25, fee: 0, date: depositToday(), notes: '' });
});

test('with nothing to move the dialog asks for accounts first', () => {
 const { view } = open({ kind: 'sell' }, { records: [wallet], accounts: undefined });
 assert.match(view.html(), /Add the source and destination first. For a new holding or proceeds balance, start at zero./);
});

test('future dates block saving, notes are kept, and saving locks the form and ignores another submit', async () => {
 let finish;
 const saved = [];
 const { view, calls, enter, submit, save } = open({ kind: 'transfer', source_id: 'cash', target_id: 'dep' }, { save: movement => { saved.push(movement); return new Promise(resolve => { finish = resolve; }); } });
 enter('Total amount debited', 10);
 view.find(byType(ui.DatePicker)).props.onChange('2999-01-01');
 view.update();
 assert.equal(save().props.disabled, true);
 view.find(byType(ui.DatePicker)).props.onChange('2026-01-02');
 view.update();
 view.find(byType('textarea')).props.onChange({ target: { value: 'Moving savings' } });
 view.update();
 assert.equal(view.find(byType('textarea')).props.value, 'Moving savings');
 assert.equal(view.find(byType(ui.DatePicker)).props.max, depositToday());
 const pending = view.find(byType('form')).props.onSubmit({ preventDefault() {} });
 view.update();
 assert.equal(text(save()), 'Saving…');
 assert.equal(view.find(byType(ui.FormFooter)).props.busy, true);
 await submit();
 assert.equal(saved.length, 1);
 // Closing is ignored while the movement is being saved.
 view.find(byType(ui.Dialog)).props.onOpenChange(false);
 assert.equal(calls.closed, 0);
 finish(); await pending;
 assert.equal(saved[0].notes, 'Moving savings');
 assert.equal(saved[0].date, '2026-01-02');
 assert.equal(calls.closed, 1);
});

test('the dialog closes through the discard guard', () => {
 const { view, calls } = open({ kind: 'transfer' });
 view.find(byType(ui.Dialog)).props.onOpenChange(true);
 assert.equal(calls.closed, 0);
 view.find(byType(ui.Dialog)).props.onOpenChange(false);
 assert.equal(calls.closed, 1);
 assert.deepEqual(guard.closes.at(-1), { dirty: false, busy: false });
 view.find(byType(ui.FormFooter)).props.onCancel();
 assert.equal(calls.closed, 2);
 assert.match(view.html(), /Fee included in these amounts <span/);
});
