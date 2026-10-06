import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, language, stubs, text } from './helpers/component-tree.mjs';

const { categoryIconGroups, categoryEmojis, isCategoryIcon, chosenCategoryEmoji } = loadTS('lib/category-icons.ts');
const h = React.createElement;

test('the icon catalogue is large, grouped, has no repeats and includes every default icon', () => {
 const icons = categoryIconGroups.flatMap(group => group.icons);
 assert.ok(icons.length >= 120, `${icons.length} icons`);
 assert.equal(new Set(icons).size, icons.length, 'no icon is listed twice');
 assert.ok(categoryIconGroups.every(group => group.icons.length >= 10), 'every group has a real choice');
 for (const [kind, icon] of Object.entries(categoryEmojis)) if (!['Cash', 'Stock', 'Crypto', 'Deposit', 'Treasury bill', 'Property', 'Valuables', 'Money lent', 'Mortgage', 'Loan', 'Debt', 'Business'].includes(kind)) assert.ok(isCategoryIcon(icon), `${kind}'s default ${icon} can be chosen back`);
 assert.equal(isCategoryIcon('A'), false);
 assert.equal(isCategoryIcon('🦄'), false);
});

test('a chosen icon wins over the default, by built-in name, added category id or its name', () => {
 const categories = [{ id: 'c1', name: 'Side job' }, { id: 'c2', name: '🏋️ Gym' }];
 const icons = { Salary: '💵', c1: '💻', c2: 'not an icon' };
 assert.equal(chosenCategoryEmoji('Salary', icons, categories), '💵');
 assert.equal(chosenCategoryEmoji('c1', icons, categories), '💻');
 assert.equal(chosenCategoryEmoji('Side job', icons, categories), '💻', 'screens that know only the name find it too');
 assert.equal(chosenCategoryEmoji('🏋️ Gym', icons, categories), '🏋️', 'an icon outside the catalogue is ignored');
 assert.equal(chosenCategoryEmoji('Charity', icons, categories), '🤲', 'no choice keeps the default');
 assert.equal(chosenCategoryEmoji('Unknown', {}), '🏷️');
});

test('the category_icons preference accepts only catalogue icons, and migration 114 allows the key', () => {
 const { workspacePreferenceSchema } = loadTS('lib/workspace-preferences.ts');
 assert.ok(workspacePreferenceSchema.safeParse({ key: 'category_icons', data: { icons: { Salary: '💵', 'a1b2': '🍕' } } }).success);
 assert.equal(workspacePreferenceSchema.safeParse({ key: 'category_icons', data: { icons: { Salary: '<b>' } } }).success, false);
 assert.equal(workspacePreferenceSchema.safeParse({ key: 'category_icons', data: { icons: { '': '💵' } } }).success, false);
 const migration = fs.readFileSync('migrations/114_category_icons.sql', 'utf8');
 assert.match(migration, /'tax_lines','category_icons'\)\)/);
 assert.ok(fs.readFileSync('database/setup.sql', 'utf8').includes(migration), 'setup.sql includes migration 114');
});

test('category icons, badges and record icons show the icon the workspace chose', () => {
 const chosen = { '@/components/category-icons-context': { useCategoryEmoji: () => kind => kind === 'Salary' ? '💵' : '🧾', useCategoryHue: () => kind => kind === 'Salary' ? 175 : 10 } };
 const load = name => loadTS(`components/presentation-foundation/${name}`, chosen);
 const render = (component, props) => renderToStaticMarkup(h(component, props));
 assert.match(render(load('category-icon.tsx').CategoryIcon, { kind: 'Salary' }), />💵<\/span>$/);
 assert.match(render(load('category-badge.tsx').CategoryBadge, { kind: 'Salary', label: 'Salary' }), /<span aria-hidden="true">💵<\/span>Salary/);
 assert.match(render(load('category-badge.tsx').CategoryBadge, { kind: 'Salary', label: 'Salary', icon: h('button', null, 'pick') }), /<button>pick<\/button>Salary/, 'Settings puts its picker in place of the icon');
 assert.match(render(load('record-icon.tsx').RecordIcon, { record: { kind: 'Salary', name: 'Pay' } }), />💵<\/span>$/);
 // The colour chosen for a category tints all three.
 for (const markup of [render(load('category-icon.tsx').CategoryIcon, { kind: 'Salary' }), render(load('category-badge.tsx').CategoryBadge, { kind: 'Salary', label: 'Salary' }), render(load('record-icon.tsx').RecordIcon, { record: { kind: 'Salary', name: 'Pay' } })]) assert.match(markup, /--category-hue:175/);
 // Outside a workspace the defaults show.
 const { useCategoryEmoji } = loadTS('components/category-icons-context.ts');
 const Probe = () => useCategoryEmoji()('Charity');
 assert.equal(renderToStaticMarkup(h(Probe)), '🤲');
 const { useCategoryHue } = loadTS('components/category-icons-context.ts');
 const HueProbe = () => String(useCategoryHue()('Charity'));
 assert.equal(renderToStaticMarkup(h(HueProbe)), '290');
});

test('a chosen colour wins over the default hue, by built-in name, added category id or its name', () => {
 const { chosenCategoryHue, categoryHue, categoryPaletteColors } = loadTS('lib/category-colors.ts');
 const categories = [{ id: 'c1', name: 'Side job' }];
 const colors = { Salary: 'red', c1: 'violet', Charity: 'slate' };
 assert.equal(chosenCategoryHue('Salary', colors, categories), 0);
 assert.equal(chosenCategoryHue('c1', colors, categories), 270);
 assert.equal(chosenCategoryHue('Side job', colors, categories), 270, 'screens that know only the name find it too');
 assert.equal(chosenCategoryHue('Charity', colors, categories), categoryHue('Charity'), 'grey cannot tint a badge, so it is ignored');
 assert.equal(chosenCategoryHue('Rent expense', colors, categories), categoryHue('Rent expense'), 'no choice keeps the stable default');
 assert.equal(categoryPaletteColors.includes('slate'), false);
 const { workspacePreferenceSchema } = loadTS('lib/workspace-preferences.ts');
 assert.ok(workspacePreferenceSchema.safeParse({ key: 'category_icons', data: { icons: {}, colors: { Salary: 'teal' } } }).success);
 assert.equal(workspacePreferenceSchema.safeParse({ key: 'category_icons', data: { icons: {}, colors: { Salary: 'slate' } } }).success, false);
 assert.equal(workspacePreferenceSchema.safeParse({ key: 'category_icons', data: { icons: {}, colors: { Salary: '#ff0000' } } }).success, false);
});

test('an icon and a colour change together in one save; a failed save puts both back', async () => {
 const r = createRenderer();
 const { useCategoryIcons } = r.load('hooks/use-category-icons.ts');
 const saved = [];
 let fail = false, controller;
 const preferences = { data: { preferences: [{ key: 'category_icons', data: { icons: { Salary: '💵' } } }] }, initialLoading: false, error: '', save: async preference => { if (fail) throw Error('Could not save.'); saved.push(preference); } };
 const Host = () => { controller = useCategoryIcons(preferences, 'me', false, [{ id: 'c1', name: 'Side job', direction: 'income' }]); return null; };
 r.mount(h(Host));
 await controller.update('c1', { icon: '💻', color: 'blue' }); r.update();
 assert.equal(saved.length, 1);
 assert.deepEqual(saved[0], { key: 'category_icons', data: { icons: { Salary: '💵', c1: '💻' }, colors: { c1: 'blue' } } });
 assert.deepEqual([controller.emojiOf('Side job'), controller.hueOf('Side job')], ['💻', 215]);
 await controller.update('c1', { color: null }); r.update();
 assert.deepEqual(saved.at(-1).data, { icons: { Salary: '💵', c1: '💻' } }, 'the default colour needs nothing saved; the icon stays');
 fail = true;
 await assert.rejects(controller.update('c1', { icon: '🎨', color: 'red' }), /Could not save/); r.update();
 assert.deepEqual([controller.emojiOf('c1'), controller.hueOf('Side job')], ['💻', controller.hueOf('Side job')]);
 assert.equal(controller.colors.c1, undefined, 'the previous colour is back');
});

test('choosing an icon shows at once and saves it for the workspace; a failed save puts the old one back', async () => {
 const r = createRenderer();
 const { useCategoryIcons } = r.load('hooks/use-category-icons.ts');
 const saved = [];
 let fail = false, controller;
 const preferences = { data: { preferences: [{ key: 'category_icons', data: { icons: { Salary: '💵' } } }] }, initialLoading: false, error: '', save: async preference => { if (fail) throw Error('Could not save.'); saved.push(preference); } };
 const Host = props => { controller = useCategoryIcons(props.preferences, props.owner, props.demo, [{ id: 'c1', name: 'Side job', direction: 'income' }]); return null; };
 r.mount(h(Host, { preferences, owner: 'me', demo: false }));
 assert.equal(controller.emojiOf('Salary'), '💵');
 await controller.choose('c1', '💻'); r.update();
 assert.deepEqual(saved.at(-1), { key: 'category_icons', data: { icons: { Salary: '💵', c1: '💻' } } });
 assert.equal(controller.emojiOf('Side job'), '💻');
 await controller.choose('Salary', null); r.update();
 assert.deepEqual(saved.at(-1).data.icons, { c1: '💻' }, 'the default needs nothing saved');
 fail = true;
 await assert.rejects(controller.choose('c1', '🎨'), /Could not save/); r.update();
 assert.equal(controller.emojiOf('c1'), '💻', 'the previous icon is back');
 // Nothing can be chosen before saved preferences load; the sample workspace keeps choices for the visit.
 r.mount(h(Host, { preferences: { ...preferences, initialLoading: true }, owner: 'me', demo: false }));
 assert.equal(controller.disabled, true);
 const count = saved.length; fail = false;
 r.mount(h(Host, { preferences: { ...preferences, data: { preferences: [] } }, owner: null, demo: true }));
 await controller.choose('Charity', '🙏'); r.update();
 assert.deepEqual([controller.emojiOf('Charity'), saved.length], ['🙏', count]);
});

test('the picker lists every group, marks the chosen icon and offers the default only when one was chosen', () => {
 const r = createRenderer();
 const named = (name, render) => Object.assign(render, { displayName: name });
 const popover = {
  Popover: named('Popover', ({ children, open }) => h('div', { 'data-open': open }, children)),
  PopoverTrigger: named('PopoverTrigger', ({ children }) => children),
  PopoverContent: named('PopoverContent', ({ children }) => h('section', null, children)),
 };
 const ui = stubs();
 const { CategoryIconPicker } = r.load('components/category-icon-picker.tsx', { ...ui.modules, '@/components/ui/popover': popover, '@/components/language-provider': language('en-US') });
 const chosen = [];
 r.mount(h(CategoryIconPicker, { icon: '🍕', label: 'Change icon for Eating out', chosen: true, onChoose: icon => chosen.push(icon) }));
 const trigger = r.find(node => node.props?.className === 'category-icon-button');
 assert.equal(trigger.props['aria-label'], 'Change icon for Eating out');
 assert.deepEqual(r.all(byType('h4')).map(text), categoryIconGroups.map(group => group.name));
 assert.deepEqual(r.all(node => node.props?.['aria-pressed'] === true).map(text), ['🍕']);
 r.fire(r.find(node => node.type === 'button' && node.props['aria-label'] === '🎨'), 'onClick');
 r.fire(r.find(byType(ui.Button)), 'onClick');
 assert.deepEqual(chosen, ['🎨', null]);
 assert.equal(r.find(node => node.props?.['data-open'] !== undefined).props['data-open'], false, 'a choice closes the picker');
 r.mount(h(CategoryIconPicker, { icon: '🏷️', label: 'Choose an icon', chosen: false, onChoose() {} }));
 assert.equal(r.all(byType(ui.Button)).length, 0, 'nothing to reset');
 assert.equal(r.all(node => node.props?.['aria-pressed'] === true).length, 0, 'the default is not marked as chosen');
});

test('report breakdowns colour categories and groups with the colour chosen for them', () => {
 const { attributeColor } = loadTS('components/business-reports.tsx');
 const { categoryHue } = loadTS('lib/category-colors.ts');
 const names = { icon: key => key === 'c1' ? 'Side job' : key, businessRecord: () => null };
 const hueOf = kind => kind === 'Side job' ? 270 : kind === 'Charity' ? 0 : categoryHue(kind);
 assert.equal(attributeColor('category', 'c1', names, hueOf), 'hsl(270 60% 48%)', 'an added category is found by its name');
 assert.equal(attributeColor('group', 'Charity', names, hueOf), 'hsl(0 60% 48%)');
 assert.equal(attributeColor('category', 'Salary', names), `hsl(${categoryHue('Salary')} 60% 48%)`, 'outside a workspace the stable default shows');
 assert.equal(attributeColor('merchant', 'Shop', names, hueOf), 'var(--foreground)');
});
