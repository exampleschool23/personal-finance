import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, event, hostModule, language, stubs, text } from './helpers/component-tree.mjs';

test('Add recurring offers income, a bill and a spending plan, each opening its schedule form', () => {
 const r = createRenderer(), ui = stubs(), chosen = [];
 const { AddRecurringMenu } = r.load('components/planning/add-recurring-menu.tsx', {
  ...ui.modules, '@/components/language-provider': language('en'), '@/components/ui/dropdown-menu': hostModule(), 'lucide-react': hostModule(),
 });
 r.mount(React.createElement(AddRecurringMenu, { onAdd: kind => chosen.push(kind) }));
 assert.equal(text(r.find(node => node.type?.displayName === 'Button')), 'Add recurring');
 const items = r.all(node => node.type === 'DropdownMenuItem');
 assert.deepEqual(items.map(text), ['Recurring income', 'Recurring bill', 'Monthly spending plan']);
 for (const item of items) r.fire(item, 'onSelect');
 assert.deepEqual(chosen, ['income', 'bill', 'plan']);
});

test('a stepper focuses the step heading when it opens and after each step, not on its first render', () => {
 const focused = [];
 const heading = { tabIndex: 0, focus() { focused.push('heading'); } };
 let withHeading = true;
 const step = { querySelector: selector => { assert.equal(selector, 'h1'); return withHeading ? heading : null; } };
 const r = createRenderer({ attach: node => node.type === 'section' ? step : null });
 const { useStepFocus } = r.load('hooks/use-step-focus.ts');
 let focus;
 function Stepper({ at }) { focus = useStepFocus(at); return React.createElement('section', { ref: focus.ref }); }
 r.mount(React.createElement(Stepper, { at: 1 }));
 assert.deepEqual(focused, [], 'opening leaves focus to the dialog, which calls onOpenAutoFocus');
 const opening = event();
 focus.onOpenAutoFocus(opening);
 assert.ok(opening.defaultPrevented);assert.equal(heading.tabIndex, -1);assert.deepEqual(focused, ['heading']);
 r.render(React.createElement(Stepper, { at: 2 }));
 assert.deepEqual(focused, ['heading', 'heading'], 'Next moves focus to the new heading');
 r.render(React.createElement(Stepper, { at: 2 }));
 assert.equal(focused.length, 2, 'a render on the same step leaves focus alone');
 // Without a heading the dialog keeps its own first focus.
 withHeading = false;
 const fallback = event();
 focus.onOpenAutoFocus(fallback);
 assert.equal(fallback.defaultPrevented, false);
 r.render(React.createElement(Stepper, { at: 3 }));
 assert.equal(focused.length, 2);
});
