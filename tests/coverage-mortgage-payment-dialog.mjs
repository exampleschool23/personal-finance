import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const { formatMoney } = loadTS('lib/format.ts');
const { depositToday } = loadTS('lib/deposit-interest.ts');
const r = createRenderer();
// Each view renders its component from scratch; the view is the renderer, holding that tree.
const mount = (Component, props) => (r.mount(React.createElement(Component, props)), r);
const ui = stubs();
const fx = { rates: {}, retries: 0 };
const guard = { closes: [] };
const { MortgagePaymentDialog } = r.load('components/mortgage-payment-dialog.tsx', {
 ...ui.modules,
 '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to) => ({ rate: !from || !to ? null : from === to ? 1 : fx.rates[from + to] ?? null, retry() { fx.retries++; } }) },
 '@/components/discard-changes': { useDiscardChanges: (dirty, onClose, busy) => ({ close: () => { guard.closes.push({ dirty, busy }); if (!busy) onClose(); }, confirmation: React.createElement('i', { 'data-dirty': String(dirty) }) }) },
});

const mortgage = { id: 'm1', name: 'Home loan', kind: 'Mortgage', currency: 'USD', amount: 100000, opened_on: '2026-01-15' };
const cash = { id: 'c1', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 5000 };
const euro = { id: 'c2', name: 'Euro account', kind: 'Cash', currency: 'EUR', amount: 1000 };
const stock = { id: 's1', name: 'Shares', kind: 'Stock', currency: 'USD', amount: 9000 };

function open(props = {}) {
 const calls = { saved: [], closed: 0, draft: [] };
 const view = mount(MortgagePaymentDialog, { mortgage, accounts: [cash, euro, stock], onClose: () => calls.closed++, onSave: async payment => { calls.saved.push(payment); }, onDraftState: (dirty, busy) => calls.draft.push([dirty, busy]), ...props });
 const number = index => view.all(element => element.type === ui.FormattedNumberInput)[index];
 const save = () => view.find(byType(ui.Button));
 const setPrincipal = value => { number(0).props.onValueChange(value); view.update(); };
 const setInterest = value => { number(1).props.onValueChange(value); view.update(); };
 const choose = id => { view.find(byType(ui.NativeSelect)).props.onChange({ target: { value: id } }); view.update(); };
 return { view, calls, save, number, setPrincipal, setInterest, choose };
}

test('mortgage payment dialog opens empty with the outstanding balance and only cash accounts to choose', () => {
 const { view, save, calls, number } = open();
 const html = view.html();
 assert.match(html, /<h2>Record mortgage payment<\/h2>/);
 assert.ok(html.includes(`Home loan · Outstanding balance: ${formatMoney(100000, 'USD', 'en-US')}`));
 assert.ok(html.includes(`Total payment: ${formatMoney(0, 'USD', 'en-US')}`));
 assert.ok(html.includes(`Remaining balance: ${formatMoney(100000, 'USD', 'en-US')}`));
 const options = view.all(element => element.type === 'option').map(text);
 assert.deepEqual(options, ['Choose a cash account', `Wallet · ${formatMoney(5000, 'USD', 'en-US')}`, `Euro account · ${formatMoney(1000, 'EUR', 'en-US')}`]);
 assert.doesNotMatch(html, /Add a cash account to record this transaction/);
 assert.equal(number(0).props.max, 100000);
 const date = view.find(byType(ui.DatePicker));
 assert.equal(date.props.min, '2026-01-15');
 assert.equal(date.props.max, depositToday());
 assert.equal(date.props.value, depositToday());
 assert.equal(save().props.disabled, true);
 assert.deepEqual(calls.draft, [[false, false]]);
 assert.match(html, /data-dirty="false"/);
});

test('a same-currency payment shows the cash debit, saves without a rate and closes', async () => {
 const { view, calls, save, setPrincipal, setInterest, choose } = open();
 setPrincipal(1200); setInterest(300); choose('c1');
 const html = view.html();
 assert.ok(html.includes(`Cash deducted from Wallet: ${formatMoney(1500, 'USD', 'en-US')}`));
 assert.ok(html.includes(`Cash balance after update: ${formatMoney(3500, 'USD', 'en-US')}`));
 assert.ok(html.includes(`Total payment: ${formatMoney(1500, 'USD', 'en-US')}`));
 assert.ok(html.includes(`Remaining balance: ${formatMoney(98800, 'USD', 'en-US')}`));
 assert.doesNotMatch(html, /class="fx"|Not enough money/);
 assert.equal(save().props.disabled, false);
 assert.deepEqual(calls.draft.at(-1), [true, false]);
 await save().props.onClick();
 assert.equal(calls.saved.length, 1);
 const [payment] = calls.saved;
 assert.equal(payment.exchange_rate, undefined);
 assert.deepEqual({ ...payment, id: undefined }, { id: undefined, mortgage_id: 'm1', principal: 1200, interest: 300, date: depositToday(), notes: '', account_id: 'c1', exchange_rate: undefined });
 assert.equal(calls.closed, 1);
});

test('a cross-currency payment converts the debit, sends the rate and retries the quote after a confirmed failure', async () => {
 fx.rates.EURUSD = 2; fx.retries = 0;
 let fail = { message: 'Bank rejected', confirmedFailure: true };
 const attempts = [];
 const { view, save, setPrincipal, choose, calls } = open({ onSave: async payment => { attempts.push(payment); if (fail) throw Object.assign(Error(fail.message), { confirmedFailure: fail.confirmedFailure }); } });
 setPrincipal(1000); choose('c2');
 let html = view.html();
 assert.match(html, /class="fx">rate 2</);
 assert.ok(html.includes(`Cash deducted from Euro account: ${formatMoney(500, 'EUR', 'en-US')}`));
 assert.ok(html.includes(`Cash balance after update: ${formatMoney(500, 'EUR', 'en-US')}`));
 await save().props.onClick();
 view.update();
 assert.equal(attempts[0].exchange_rate, 2);
 assert.equal(fx.retries, 1);
 html = view.html();
 assert.match(html, /role="alert" data-detail="Retry the same payment to avoid duplicates.">Bank rejected</);
 // The confirmed failure unlocks the form again so the person can change the details.
 assert.equal(view.find(byType('fieldset')).props.disabled, false);
 assert.equal(calls.closed, 0);

 // An unknown outcome keeps the submitted payload locked, so the retry re-sends the same id and rate.
 fail = { message: 'Network lost', confirmedFailure: false };
 await save().props.onClick();
 view.update();
 assert.equal(view.find(byType('fieldset')).props.disabled, true);
 assert.match(view.html(), /Network lost/);
 assert.equal(fx.retries, 1);
 fail = null;
 await save().props.onClick();
 assert.equal(attempts.length, 3);
 assert.equal(attempts[2].id, attempts[1].id);
 assert.equal(attempts[2].exchange_rate, 2);
 assert.equal(calls.closed, 1);
});

test('the save button shows progress and ignores a second press while the payment is saving', async () => {
 let finish;
 const saves = [];
 const { view, save, setPrincipal, choose } = open({ onSave: payment => { saves.push(payment); return new Promise(resolve => { finish = resolve; }); } });
 setPrincipal(100); choose('c1');
 const pending = save().props.onClick();
 view.update();
 assert.equal(text(save()), 'Saving…');
 assert.equal(save().props.disabled, true);
 save().props.onClick();
 assert.equal(saves.length, 1);
 finish(); await pending;
});

test('payments that overdraw the account, exceed the balance, predate the mortgage or are empty cannot be saved', async () => {
 const { view, save, setPrincipal, setInterest, choose, calls } = open();
 choose('c1');
 assert.equal(save().props.disabled, true);
 setInterest(6000);
 assert.match(view.html(), /<p class="error">Not enough money in the selected cash account.<\/p>/);
 assert.equal(save().props.disabled, true);
 await save().props.onClick();
 assert.equal(calls.saved.length, 0);
 setInterest(10); setPrincipal(100001);
 assert.equal(save().props.disabled, true);
 setPrincipal(10);
 assert.equal(save().props.disabled, false);
 view.find(byType(ui.DatePicker)).props.onChange('2026-01-01');
 view.update();
 assert.equal(save().props.disabled, true);
 view.find(byType(ui.DatePicker)).props.onChange('2026-02-01');
 view.update();
 assert.equal(save().props.disabled, false);
 // Clearing the account selection stores no account and blocks saving again.
 choose('');
 assert.equal(save().props.disabled, true);
 assert.doesNotMatch(view.html(), /Cash deducted/);
});

test('a cross-currency account without a quote shows no debit and cannot be saved', () => {
 fx.rates = {};
 const { view, save, setPrincipal, choose } = open();
 setPrincipal(100); choose('c2');
 assert.match(view.html(), /class="fx">rate null</);
 assert.doesNotMatch(view.html(), /Cash deducted/);
 assert.equal(save().props.disabled, true);
});

test('notes are kept, and closing goes through the discard guard unless saving', () => {
 const { view, calls } = open({ mortgage: { ...mortgage, opened_on: null }, accounts: [] });
 assert.match(view.html(), /Add a cash account to record this transaction./);
 assert.equal(view.find(byType(ui.DatePicker)).props.min, undefined);
 view.find(byType('textarea')).props.onChange({ target: { value: 'Statement 9' } });
 view.update();
 assert.equal(view.find(byType('textarea')).props.value, 'Statement 9');
 assert.match(view.html(), /data-dirty="true"/);
 const dialog = view.find(byType(ui.Dialog));
 dialog.props.onOpenChange(true);
 assert.equal(calls.closed, 0);
 dialog.props.onOpenChange(false);
 assert.equal(calls.closed, 1);
 assert.equal(guard.closes.at(-1).dirty, true);
});

test('inline mode renders the payment form without its own dialog', () => {
 const { view } = open({ inline: true, onDraftState: undefined });
 assert.equal(view.all(element => element.type === ui.Dialog).length, 0);
 const html = view.html();
 assert.match(html, /Enter principal and interest from your bank statement/);
 assert.doesNotMatch(html, /Record mortgage payment/);
 view.find(byType(ui.FormFooter)).props.onCancel();
 assert.equal(guard.closes.at(-1).busy, false);
});
