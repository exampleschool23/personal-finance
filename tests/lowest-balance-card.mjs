import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

// The Overview's Lowest balance card against stand-ins for the UI kit: it waits for the saved Budget and says when a
// budget could not be converted (MONEY-008).
const r = createRenderer();
const ui = stubs();
const { depositToday } = loadTS('lib/deposit-interest.ts');
const today = depositToday();
const modules = {
 ...ui.modules,
 'lucide-react': hostModule(), '@/components/charts-lazy': hostModule(), '@/components/display-money': { useDisplayMoney: () => ({}) },
 ...Object.fromEntries(['category-icon', 'count', 'drawer-link', 'empty-state', 'inline-error', 'loading-placeholder', 'panel-title', 'segmented', 'stat-tile', 'rolling-text'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
 '@/components/presentation-foundation/tone': { signTone: value => value < 0 ? 'negative' : undefined },
 '@/components/ui/input': hostModule(),
};
const { LowestBalanceCard } = r.load('components/cash-forecast.tsx', modules);
const cash = { id: 'cash', name: 'Checking', kind: 'Cash', currency: 'USD', amount: 1000, quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '' };
const data = { records: [cash], occurrences: [], debtPayments: [], goals: [], categories: [], activity: [] };
const line = { key: 'food', name: 'Groceries', categoryKeys: ['food'], amount: 300 };
const card = props => { r.mount(React.createElement(LowestBalanceCard, { data, currency: 'USD', rates: { USD: 1 }, ...props })); return r; };
const found = (type, view = r) => view.all(node => node.type === type);

test('Lowest balance waits for the saved Budget and shows its failure with Retry', () => {
 let retried = 0;
 card({ budget: { linesFor: () => ({ lines: [line], missing: 0 }), spent: new Map() }, budgetState: { loading: true, error: '', retry() {} } });
 assert.equal(found('PanelSkeleton').length, 1, 'a skeleton while Budget loads');
 assert.equal(found('RollingText').length, 0, 'no figure without the budget');
 card({ budgetState: { loading: false, error: 'Could not load budget.', retry: () => retried++ } });
 const error = found('InlineError')[0];
 assert.equal(error.props.message, 'Could not load budget.');
 error.props.onRetry();
 assert.equal(retried, 1);
 assert.equal(found('RollingText').length, 0);
});

test('Lowest balance spends the budget and notes a budget no rate converts instead of dropping it silently', () => {
 card({ budget: { linesFor: () => ({ lines: [line], missing: 0 }), spent: new Map() }, budgetState: { loading: false, error: '', retry() {} } });
 assert.equal(found('RollingText').length, 1);
 assert.doesNotMatch(text(r.tree ?? []), /could not be converted/);
 card({ budget: { linesFor: month => ({ lines: [], missing: month === today.slice(0, 7) ? 1 : 0 }), spent: new Map() }, budgetState: { loading: false, error: '', retry() {} } });
 assert.ok(r.all(node => node.type === 'p' && node.props.role === 'status').some(node => /could not be converted/.test(text(node))), 'the Exchange rate note shows');
});
