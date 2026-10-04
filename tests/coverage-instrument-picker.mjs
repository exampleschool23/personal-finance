import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createHarness, stubs, text } from './helpers/coverage-component-harness.mjs';

const h = React.createElement;
const harness = createHarness();
const ui = stubs();
const pass = name => Object.assign(({ children }) => h('div', { 'data-part': name }, children), { displayName: name });
const Popover = pass('Popover'), PopoverTrigger = pass('PopoverTrigger'), PopoverContent = pass('PopoverContent');
const Command = pass('Command'), CommandList = pass('CommandList'), CommandEmpty = pass('CommandEmpty');
const CommandGroup = Object.assign(({ children, heading }) => h('div', { 'data-heading': heading }, children), { displayName: 'CommandGroup' });
const CommandItem = Object.assign(({ children, value }) => h('div', { role: 'option', 'data-value': value }, children), { displayName: 'CommandItem' });
const CommandInput = Object.assign(({ value, placeholder }) => h('input', { value, placeholder, readOnly: true }), { displayName: 'CommandInput' });
const icon = name => Object.assign(() => h('svg', { 'data-icon': name }), { displayName: name });
const { InstrumentPicker } = loadTS('components/instrument-picker.tsx', {
 react: harness.react,
 ...ui.modules,
 'lucide-react': { Check: icon('check'), ChevronsUpDown: icon('chevrons'), Plus: icon('plus') },
 '@/components/ui/popover': { Popover, PopoverContent, PopoverTrigger },
 '@/components/ui/command': { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList },
});

function open(props) {
 const changes = [];
 const view = harness.mount(InstrumentPicker, { kind: 'Stock', value: '', onChange: value => changes.push(value), ...props });
 const search = query => { view.byType(CommandInput).props.onValueChange(query); view.render(); };
 const setOpen = next => { view.byType(Popover).props.onOpenChange(next); view.render(); };
 const options = () => view.all(element => element.type === CommandItem);
 return { view, changes, search, setOpen, options };
}

test('an empty stock picker prompts for a choice and labels the combobox for screen readers', () => {
 const { view } = open();
 const trigger = view.byType(ui.Button);
 const id = trigger.props.id;
 assert.equal(trigger.props.role, 'combobox');
 assert.equal(trigger.props['aria-expanded'], false);
 assert.equal(trigger.props['aria-controls'], undefined);
 assert.equal(trigger.props['aria-labelledby'], `${id}-label ${id}-value`);
 assert.equal(trigger.props.className, 'instrument-trigger');
 const html = view.html();
 assert.match(html, new RegExp(`<label id="${id}-label" for="${id}">Stock or ETF \\(USD-listed\\)</label>`));
 assert.match(html, /<span id="[^"]+-value">Select a stock or ETF<\/span><svg data-icon="chevrons">/);
 assert.match(html, /Choose a USD-listed stock or ETF, or type another ticker/);
 assert.match(html, /placeholder="Search by name or symbol"/);
});

test('a selected coin shows its name and symbol, marks its option and closes after another choice', () => {
 const { view, changes, search, setOpen, options } = open({ kind: 'Crypto', value: 'Toncoin (TON)' });
 assert.match(view.html(), />Toncoin \(TON\)<\/span>/);
 assert.match(view.html(), /Prices depend on market-data availability/);
 assert.match(view.html(), />Coin<\/label>/);
 setOpen(true);
 const trigger = view.byType(ui.Button);
 assert.equal(trigger.props['aria-expanded'], true);
 assert.equal(trigger.props['aria-controls'], trigger.props.id + '-list');
 search('ton');
 const ton = options().find(option => option.props.value === 'TON');
 assert.ok(ton, 'TON is listed for its search');
 assert.match(text(ton), /^TONToncoin$/);
 assert.equal(view.all(element => element.type === CommandItem && element.props.value === 'TON')[0].props.children[1].props['aria-hidden'], 'true');
 assert.equal(options().filter(option => option.props.children[1]).length, 1);
 const bitcoin = (search('bitcoin'), options().find(option => option.props.value === 'BTC'));
 bitcoin.props.onSelect();
 view.render();
 assert.deepEqual(changes, ['Bitcoin (BTC)']);
 assert.equal(view.byType(ui.Button).props['aria-expanded'], false);
 assert.equal(view.byType(CommandInput).props.value, '');
});

test('closing the popover clears the search, while reopening keeps it', () => {
 const { view, search, setOpen } = open({ kind: 'Crypto' });
 assert.match(view.html(), />Select a coin</);
 setOpen(true); search('eth');
 setOpen(true);
 assert.equal(view.byType(CommandInput).props.value, 'eth');
 setOpen(false);
 assert.equal(view.byType(CommandInput).props.value, '');
});

test('an unknown crypto search shows the empty message and never offers a custom ticker', () => {
 const { view, search, options } = open({ kind: 'Crypto' });
 search('zzzz-not-a-coin');
 assert.equal(options().length, 0);
 assert.match(view.html(), /No matching instruments./);
 assert.doesNotMatch(view.html(), /Other ticker/);
});

test('an unlisted stock ticker is offered as a custom choice unless it is excluded', () => {
 const { view, changes, search, options } = open({ value: 'DXYZ' });
 assert.match(view.html(), />DXYZ<\/span>/);
 search('dxyz');
 const custom = options().find(option => option.props.value === 'custom:DXYZ');
 assert.equal(text(custom), 'Use ticker DXYZ');
 assert.match(view.html(), /data-heading="Other ticker"/);
 assert.doesNotMatch(view.html(), /No matching instruments/);
 custom.props.onSelect();
 assert.deepEqual(changes, ['DXYZ']);

 const excluded = open({ excludedSymbols: ['DXYZ'] });
 excluded.search('dxyz');
 assert.equal(excluded.options().length, 0);
 assert.match(excluded.view.html(), /No matching instruments./);
});

test('excluded symbols are hidden from matches, and the add variant shows its action label with a plus icon', () => {
 const { view, changes, search, options } = open({ actionLabel: 'Add holding', excludedSymbols: ['AAPL'], disabled: true });
 const trigger = view.byType(ui.Button);
 assert.equal(trigger.props.disabled, true);
 assert.equal(trigger.props.className, 'instrument-trigger instrument-add-trigger');
 const html = view.html();
 assert.match(html, /^<div class="instrument-field instrument-add"><label class="sr-only"/);
 assert.match(html, /<svg data-icon="plus"><\/svg><span id="[^"]+-value">Add holding<\/span>/);
 assert.doesNotMatch(html, /data-icon="chevrons"/);
 search('apple');
 assert.equal(options().some(option => option.props.value === 'AAPL'), false);
 search('msft');
 options().find(option => option.props.value === 'MSFT').props.onSelect();
 assert.deepEqual(changes, ['MSFT']);
});
