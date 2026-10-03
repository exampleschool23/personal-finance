import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { normalizeLayout, dashboardColumns, dropCard, placeCard, toggleCard, defaultDashboardLayout } = loadTS('lib/dashboard-layout.ts');
const { workspacePreferenceSchema } = loadTS('lib/workspace-preferences.ts');

test('dashboard cards drag within and across columns, old saves load and every card can be hidden', () => {
 assert.deepEqual(dashboardColumns(defaultDashboardLayout), { left: ['net_worth', 'spending', 'budget', 'commitments', 'allocation', 'business'], right: ['goals', 'transactions', 'upcoming', 'forecast', 'income'] });
 const old = normalizeLayout({ order: ['upcoming', 'recap', 'removed_card', 'allocation', 'upcoming'], hidden: ['goals', 'recap', 'nope'] });
 assert.deepEqual(old.columns.right, ['upcoming', 'goals', 'transactions', 'forecast', 'income'], 'a single-list save keeps its columns, new cards appended, removed cards dropped');
 assert.equal(old.columns.left[0], 'allocation');
 assert.equal(old.columns.left.length + old.columns.right.length, 11);
 assert.deepEqual(old.hidden, ['goals']);
 const repaired = normalizeLayout({ columns: { left: ['goals', 'goals', 'x'], right: ['goals', 'budget'] }, hidden: [] });
 assert.deepEqual(repaired.columns.right.slice(0, 1), ['budget'], 'a card appears once, in the first column that lists it');
 assert.equal(repaired.columns.left.filter(card => card === 'goals').length, 1);
 // Same column: dropping on a card takes its place, in both directions.
 let layout = dropCard(defaultDashboardLayout, 'budget', 'net_worth');
 assert.deepEqual(layout.columns.left.slice(0, 3), ['budget', 'net_worth', 'spending']);
 layout = dropCard(layout, 'budget', 'commitments');
 assert.deepEqual(layout.columns.left.slice(0, 4), ['net_worth', 'spending', 'commitments', 'budget']);
 assert.equal(dropCard(layout, 'budget', 'budget'), layout);
 // Across columns: the card lands before the one it was dropped on, or at the end of an empty column.
 layout = dropCard(layout, 'net_worth', 'goals');
 assert.deepEqual(layout.columns.right, ['net_worth', 'goals', 'transactions', 'upcoming', 'forecast', 'income']);
 assert.ok(!layout.columns.left.includes('net_worth'));
 layout = dropCard(layout, 'transactions', 'left');
 assert.equal(layout.columns.left.at(-1), 'transactions');
 let empty = defaultDashboardLayout;
 for (const card of ['goals', 'transactions', 'upcoming', 'forecast', 'income']) empty = dropCard(empty, card, 'left');
 assert.deepEqual(empty.columns.right, []);
 assert.deepEqual(dropCard(empty, 'budget', 'right').columns.right, ['budget'], 'an empty column still takes a card');
 assert.deepEqual(placeCard(defaultDashboardLayout, 'goals', 'left', 99).columns.left.at(-1), 'goals', 'an index past the end is clamped');
 layout = toggleCard(toggleCard(layout, 'net_worth'), 'allocation');
 assert.ok(!dashboardColumns(layout).right.includes('net_worth'));
 assert.ok(layout.columns.right.includes('net_worth'), 'a hidden card keeps its place');
 assert.ok(dashboardColumns(toggleCard(layout, 'allocation')).left.includes('allocation'));
 assert.ok(workspacePreferenceSchema.safeParse({ key: 'dashboard', data: layout }).success);
 assert.ok(workspacePreferenceSchema.safeParse({ key: 'dashboard', data: { order: ['goals', 'recap'], hidden: ['recap'] } }).success, 'saves from before, naming the removed weekly recap, still load');
 assert.ok(!workspacePreferenceSchema.safeParse({ key: 'dashboard', data: { columns: { left: ['hack'], right: [] }, hidden: [] } }).success);
 assert.ok(!workspacePreferenceSchema.safeParse({ key: 'dashboard', data: { order: ['hack'], hidden: [] } }).success);
});

test('dashboard cards move only in rearrange mode, which wiggles them until Done', async () => {
 const { readFileSync } = await import('node:fs');
 const css = readFileSync('app/globals.css', 'utf8'), board = readFileSync('components/dashboard-board.tsx', 'utf8'), screen = readFileSync('components/workspace/screens/overview-screen.tsx', 'utf8');
 assert.match(css, /\.dashboard-card>\.drag-handle\{display:none\}/, 'no handles outside rearrange mode');
 assert.match(css, /\.dashboard-grid\[data-arranging\] \.dashboard-card>\.panel\{[^}]*animation:card-wiggle/, 'cards wiggle while rearranging');
 assert.match(css, /prefers-reduced-motion:reduce\)\{\.dashboard-grid\[data-arranging\] \.dashboard-card>\.panel\{animation:none\}/, 'reduced motion keeps them still');
 assert.match(board, /data-arranging=\{arranging \|\| undefined\}/);
 assert.match(board, /TouchSensor, \{ activationConstraint: \{ delay: \d+/, 'a finger lifts a card after a hold, so the page still scrolls');
 assert.match(board, /onClick=\{onRearrange\}.*Rearrange cards/);
 assert.match(screen, /arranging \? <Button onClick=\{\(\) => setArranging\(false\)\}>.*'Done'/, 'Done ends rearrange mode');
});
