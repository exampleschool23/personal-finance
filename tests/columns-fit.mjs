import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer } from './helpers/component-tree.mjs';
import { stylesheet } from './helpers/stylesheet.mjs';

const { columnsFit } = loadTS('lib/columns-fit.ts');

test('rows stay on one line while the name keeps its room beside the widest cell of each column', () => {
 // A month of short dollar amounts: 240 name + 32 padding + (100 + 12) + (70 + 12) + (172 + 12) = 650.
 const dollars = [[100, 70, 172], [96, 60, 172]];
 assert.equal(columnsFit({ available: 650, minName: 240, gap: 12, padding: 32, cells: dollars }), true);
 assert.equal(columnsFit({ available: 649, minName: 240, gap: 12, padding: 32, cells: dollars }), false);
 // One long spending plan amount widens its column for every row.
 assert.equal(columnsFit({ available: 650, minName: 240, gap: 12, padding: 32, cells: [...dollars, [128, 230, 172]] }), false);
 assert.equal(columnsFit({ available: 400, minName: 240, gap: 12, padding: 32, cells: [] }), true, 'nothing beside the name');
});

test('the hook measures the rows on screen, marks the list, and measures again only when its width changes', () => {
 const r = createRenderer();
 const { useColumnsFit } = r.load('hooks/use-columns-fit.ts');
 const cell = width => ({ getBoundingClientRect: () => ({ width }) });
 let rowWidth = 900, observed, disconnected = false, frames = [];
 const row = { children: [cell(300), cell(100), cell(70), cell(172)], getBoundingClientRect: () => ({ width: rowWidth }) };
 const list = { dataset: {}, querySelectorAll: selector => (assert.equal(selector, '.recurring-row'), [row]), getBoundingClientRect: () => ({ width: rowWidth }) };
 const names = ['getComputedStyle', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'], globals = Object.fromEntries(names.map(name => [name, globalThis[name]]));
 Object.assign(globalThis, {
  getComputedStyle: () => ({ paddingLeft: '16px', paddingRight: '16px', columnGap: '12px' }),
  ResizeObserver: class { constructor(callback) { observed = callback; } observe(target) { assert.equal(target, list); } disconnect() { disconnected = true; } },
  requestAnimationFrame: callback => frames.push(callback), cancelAnimationFrame() {},
 });
 try {
  const Host = () => { const ref = useColumnsFit('.recurring-row'); ref.current = list; return null; };
  r.mount(React.createElement(Host)); r.flush(0);
  assert.equal(list.dataset.layout, 'columns', '900px holds 240 + 32 + 112 + 82 + 184');
  rowWidth = 600;
  observed([{ contentRect: { width: 900 } }]);
  assert.equal(frames.length, 0, 'a height change alone is not measured');
  observed([{ contentRect: { width: 600 } }]);
  frames.forEach(frame => frame());
  assert.equal(list.dataset.layout, 'stacked');
  r.unmount();
  assert.equal(disconnected, true);
 } finally { Object.assign(globalThis, globals); }
});

test('Recurring and Subscriptions stack by what is on screen, not by a guessed breakpoint', () => {
 for (const file of ['components/planning/upcoming-page.tsx', 'components/planning/subscriptions-panel.tsx']) assert.match(fs.readFileSync(file, 'utf8'), /useColumnsFit<HTMLUListElement>\('\.recurring-row'\)/, file);
 const css = stylesheet();
 assert.doesNotMatch(css, /@container content \(max-width:\d+px\)\{[^}]*\.recurring-list>ul/, 'no width guess for the recurring rows');
 assert.match(css, /\[data-layout=stacked\]>\.recurring-row\{grid-template-columns:minmax\(0,1fr\) auto auto/);
 assert.match(css, /\[data-layout=stacked\]>\.recurring-row>:nth-child\(1\)\{grid-area:1\/1\/2\/3\}/, 'the name spans all but the amount');
});
