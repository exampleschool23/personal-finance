import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, hostModule, stubs, translate } from './helpers/component-tree.mjs';

const view = loadTS('lib/report-view.ts');
const { rankColor } = loadTS('lib/category-colors.ts');
const { workspaceOwners, demoHousehold } = loadTS('lib/household.ts');
const { depositToday } = loadTS('lib/deposit-interest.ts');
const today = depositToday(), year = today.slice(0, 4);
const day = n => `${year}-01-${String(n).padStart(2, '0')}`;

test('a Reports link picks a tab, businesses and a cash flow view, and ignores what it does not know', () => {
 assert.deepEqual(view.reportLink('?tab=income&business=b1,b2&business=b3&view=pnl'), { tab: 'income', businesses: ['b1', 'b2', 'b3'], view: 'pnl', mode: 'breakdown' });
 assert.deepEqual(view.reportLink('?view=trends'), { mode: 'trends' });
 assert.deepEqual(view.reportLink('?tab=nope&view=pie'), {});
 assert.deepEqual(view.reportTabsFor(false), ['cash_flow', 'spending', 'income']);
 assert.deepEqual(view.reportTabsFor(true), ['cash_flow', 'spending', 'income', 'tax']);
 const lines = [{ id: 'a', direction: 'income' }, { id: 'b', direction: 'expense' }];
 assert.deepEqual(['cash_flow', 'spending', 'income'].map(tab => view.tabLines(tab, lines).map(line => line.id)), [['a', 'b'], ['b'], ['a']]);
});

test('report names translate built-in categories, keep custom names, and call no business the household', () => {
 const names = view.reportNames([{ id: 'c1', name: 'Pottery', direction: 'expense' }], [{ id: 'b1', name: 'Bakery' }], key => 'T:' + key);
 assert.deepEqual([names.category('c1'), names.category('Charity'), names.icon('c1'), names.icon('Charity'), names.group('Bills')], ['Pottery', 'T:Charity', 'Pottery', 'Charity', 'T:Bills']);
 assert.deepEqual([names.business(null), names.business('household'), names.business('b1'), names.business('gone')], ['T:Household', 'T:Household', 'Bakery', 'T:Business']);
 assert.equal(names.businessRecord('b1').name, 'Bakery');
 const t = (message, values) => translate(message, values);
 assert.equal(view.describeDrill({ direction: 'expense', category: 'c1', business: null }, names, t), 'Pottery · T:Household');
 assert.equal(view.describeDrill({ direction: 'income', categories: ['a', 'b'] }, names, t), '2 categories');
 assert.equal(view.describeDrill({ direction: 'income', merchant: 'Etsy' }, names, t), 'Income · Etsy');
 assert.equal(view.describeDrill({}, names, t), '');
 const groupOf = view.groupFinder(new Map([['Charity', 'Giving']]), [{ id: 'side', name: 'Side gig', direction: 'income' }]);
 assert.deepEqual(['Charity', 'Salary', 'side', 'Living expense'].map(groupOf), ['Giving', 'Income', 'Income', 'Everyday spending']);
 assert.deepEqual(workspaceOwners(null, { shared: 'S', unnamed: 'P' }), []);
 assert.deepEqual(workspaceOwners(demoHousehold, { shared: 'S', unnamed: 'P' }).map(owner => owner.name), ['S', 'Alex', 'Sam']);
});

// The screen with its tabs, against stand-ins for the workspace, the charts and the data reads.
const r = createRenderer();
const ui = stubs();
const workspace = { user: { id: 'me' }, demo: true, reload() {}, currency: 'USD', market: null, transactionTools: { data: { splits: [] } }, businessList: [], workspacePreferences: { data: { preferences: [] }, save: async preference => saved.push(preference) }, setViewing: record => viewed.push(record.id), storedRecord: record => record, household: { state: null }, planning: { data: null, loading: false, error: '' } };
const saved = [], viewed = [];
let search = '', range = { data: null, loading: false, error: '', retry() { range.retried = true; } };
const charts = hostModule({ attributeColor: (attribute, key) => attribute + ':' + key });
const modules = {
 ...ui.modules,
 'lucide-react': hostModule(), '@/components/business-reports': charts, '@/components/cash-flow-report': hostModule(), '@/components/tax-prep-sheet': hostModule(),
 ...Object.fromEntries(['page-header', 'segmented', 'panel-title', 'stat-tile', 'business-filter', 'owner-filter', 'inline-error', 'loading-placeholder'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
 '@/components/presentation-foundation/tone': { signTone: value => value > 0 ? 'positive' : value < 0 ? 'negative' : undefined },
 '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
 '@/hooks/use-budget': { useBudget: () => ({ state: { categories: [] } }) },
 '@/hooks/use-location-search': { useLocationSearch: () => search },
 '@/hooks/use-report-data': { useRangeData: () => range },
};
const { ReportsScreen } = r.load('components/workspace/screens/reports-screen.tsx', modules);
const salary = { id: 's', name: 'Payroll', kind: 'Salary', currency: 'USD', amount: 3000, date: day(5), frequency: 'Once', shared: true };
const food = { id: 'f', name: 'Market', kind: 'Living expense', currency: 'USD', amount: 400, date: day(6), frequency: 'Once', shared: true };
const sale = { id: 'b', name: 'Bread stall', kind: 'Business income', currency: 'USD', amount: 900, date: day(7), frequency: 'Once', business_id: 'b1', shared: false, member_id: demoHousehold.people[1].id };
const data = (records = [salary, food, sale]) => ({ records, categories: [], goals: [], occurrences: [], activity: [] });
function open({ records, businesses = [{ id: 'b1', name: 'Bakery' }], link = '', household = null } = {}) {
 search = link;range = { ...range, data: data(records), loading: false, error: '' };
 workspace.businessList = businesses;workspace.household = { state: household };
 r.mount(React.createElement(ReportsScreen));
 search = '';
}
const header = () => r.find(byType('PageHeader'));
const switchTab = tab => r.fire(header().props.tabs, 'onChange', tab);
const segmented = label => r.find(node => node.type === 'Segmented' && node.props.label === label);
const pick = (label, value) => r.fire(segmented(label), 'onChange', value);
const tile = label => r.find(node => node.type === 'StatTile' && node.props.label === label).props;

test('Cash flow totals the period and switches between Sankey, profit and loss and trends', () => {
 open();
 assert.deepEqual(header().props.tabs.props.options.map(option => option.value), ['cash_flow', 'spending', 'income', 'tax']);
 assert.deepEqual([tile('Income').value, tile('Expenses').value, tile('Net income').value, tile('Net income').tone], ['$3,900', '$400', '$3,500', 'positive']);
 assert.ok(r.find(byType('BusinessSankeyChart')));
 pick('Chart type', 'pnl');
 assert.equal(r.find(byType('ProfitLossTable')).props.breakdown, 'category');
 pick('Rows', 'group');
 assert.equal(r.find(byType('ProfitLossTable')).props.breakdown, 'group');
 pick('Report view', 'trends');
 assert.equal(r.find(byType('TrendChart')).key, 'totals');
 pick('Chart type', 'stacked');pick('Interval', 'quarter');
 const stacked = r.find(byType('TrendChart')).props;
 assert.equal(stacked.stacked, true);assert.equal(stacked.interval, 'quarter');
 assert.ok(stacked.rows.every(row => row.expenses <= 0), 'stacked expenses draw below the line');
 pick('Series', 'business');
 assert.deepEqual(r.find(byType('TrendChart')).props.series.map(series => series.label), ['Household', 'Bakery']);
 assert.equal(r.all(byType('ReportSummary'))[0].props.mixed, true);
});

test('a chart click narrows the transactions, and changing a filter shows them all again', () => {
 open();
 r.fire(r.find(byType('BusinessSankeyChart')), 'onDrill', { direction: 'expense', category: 'Living expense' });
 let list = r.find(byType('ReportTransactions')).props;
 assert.equal(list.label, 'Living expense');assert.deepEqual(list.lines.map(line => line.id), ['f']);
 r.fire(r.find(byType('ReportTransactions')), 'onOpen', list.lines[0]);
 assert.deepEqual(viewed, ['f']);
 r.fire(r.find(byType('BusinessFilter')), 'onChange', ['b1']);
 list = r.find(byType('ReportTransactions')).props;
 assert.equal(list.label, null);assert.deepEqual(list.lines.map(line => line.id), ['b']);
 assert.equal(tile('Income').value, '$900');
 r.fire(r.find(byType('ReportTransactions')), 'onClear');
});

test('Spending and Income break down by category, group, merchant or business, as bars, a donut or trends', () => {
 open();
 switchTab('spending');
 assert.deepEqual([tile('Total spending').value, tile('Transactions').value], ['$400', '1']);
 assert.equal(r.find(byType('BreakdownDonut')).props.label('Living expense'), 'Living expense', 'the donut is the default view');
 r.fire(r.find(byType('BreakdownDonut')), 'onSelect', 'Living expense');
 assert.equal(r.find(byType('ReportTransactions')).props.label, 'Living expense');
 switchTab('income');
 assert.equal(tile('Total income').tone, 'positive');
 assert.equal(r.all(byType('ReportSummary'))[0].props.mixed, false);
 pick('Chart type', 'bars');
 const drills = {};
 for (const attribute of ['group', 'merchant', 'business']) {
  pick('Group by', attribute);
  const bars = r.find(byType('ShareBars'));
  drills[attribute] = bars.props.items.map(item => item.key);
  r.fire(bars, 'onSelect', bars.props.items[0].key);
 }
 assert.deepEqual(drills, { group: ['Income'], merchant: ['Payroll', 'Bread stall'], business: ['household', 'b1'] });
 assert.equal(r.find(byType('ReportTransactions')).props.label, 'Income · Household');
 pick('Group by', 'merchant');
 const colorKey = r.find(byType('ShareBars')).props.colorKey;
 assert.deepEqual(['Payroll', 'Bread stall'].map(colorKey), [rankColor(0), rankColor(1)], 'merchants take colours by their place in the breakdown');
 pick('Group by', 'business');
 pick('Chart type', 'donut');
 assert.equal(r.find(byType('BreakdownDonut')).props.colorOf('other'), 'var(--muted-foreground)');
 r.fire(r.find(byType('BreakdownDonut')), 'onSelect', 'b1');
 assert.equal(r.find(byType('ReportTransactions')).props.label, 'Income · Bakery');
 pick('Report view', 'trends');
 assert.ok(r.find(byType('TrendChart')).props.series.length > 0);
});

test('a link opens a tab, a business and a view; tax prep needs a business', () => {
 open({ link: '?tab=cash_flow&business=b1&view=trends' });
 assert.equal(r.find(byType('BusinessFilter')).props.value[0], 'b1');
 assert.ok(r.find(byType('TrendChart')));
 open({ link: '?tab=tax', businesses: [] });
 assert.equal(header().props.tabs.props.value, 'cash_flow');
 assert.equal(r.all(byType('BusinessFilter')).length, 0);
});

test('a custom range picks its own days, and loading or failed reads show their state', () => {
 open();
 r.fire(r.find(byType(ui.NativeSelect)), 'onChange', { currentTarget: { value: 'custom' } });
 const pickers = r.all(byType(ui.DatePicker));
 assert.equal(pickers.length, 2);
 r.fire(pickers[0], 'onChange', `${Number(year) - 3}-01-01`);
 assert.ok(r.html().includes('Reports cover up to 24 months.'));
 r.fire(r.all(byType(ui.DatePicker))[1], 'onChange', null);
 range = { ...range, loading: true };r.update();
 assert.ok(r.find(byType('PanelSkeleton')));
 range = { ...range, loading: false, error: 'Could not load records.' };r.update();
 r.fire(r.find(byType('InlineError')), 'onRetry');
 assert.equal(range.retried, true);
});

test('in a shared household reports filter by owner', () => {
 open({ household: demoHousehold });
 const owners = r.find(byType('OwnerFilter'));
 assert.deepEqual(owners.props.owners.map(owner => owner.name), ['Shared', 'Alex', 'Sam']);
 r.fire(owners, 'onChange', [demoHousehold.people[1].id]);
 assert.deepEqual(r.find(byType('ReportTransactions')).props.lines.map(line => line.id), ['b']);
});

test('tax prep reads its own year for one business and keeps sample settings in the sample workspace', async () => {
 open();
 switchTab('tax');
 assert.equal(r.all(byType(ui.NativeSelect)).length, 0, 'tax prep has its own period');
 const sheet = () => r.find(byType('TaxPrepSheet')).props;
 assert.equal(sheet().business, 'b1');assert.deepEqual(sheet().lines.map(line => line.id), ['b']);
 assert.equal(sheet().years[0], Number(year));
 assert.ok(sheet().categories.some(category => category.key === 'Living expense') && !sheet().categories.some(category => category.key === 'Salary'));
 await sheet().onSettings({ lines: [] });r.update();
 assert.deepEqual(sheet().settings, { lines: [] });assert.deepEqual(saved, []);
 workspace.demo = false;r.update();
 await sheet().onSettings({ lines: ['x'] });
 assert.deepEqual(saved, [{ key: 'tax_lines', data: { lines: ['x'] } }]);
 workspace.demo = true;r.update();
 r.fire(r.find(byType('TaxPrepSheet')), 'onYear', Number(year) - 1);r.fire(r.find(byType('TaxPrepSheet')), 'onPeriod', 'q1');
 assert.deepEqual(sheet().lines, []);
 range = { ...range, loading: true };r.update();
 assert.ok(r.find(byType('PanelSkeleton')));
 range = { ...range, loading: false, error: 'Could not load records.' };r.update();
 assert.ok(r.find(byType('InlineError')));
 range = { ...range, error: '' };
});

test('report data comes from the sample workspace, or from a read of the range for a signed-in person', () => {
 const reads = [];
 const own = { data: data([food]), initialLoading: true, error: 'remote', retry: () => 'retried' };
 const hooks = createRenderer();
 let current = { ...workspace, demo: true, planning: { data: data([salary]), loading: false, error: '' } };
 const { useRangeData } = hooks.load('hooks/use-report-data.ts', {
  '@/components/workspace/workspace-provider': { useWorkspace: () => current },
  '@/hooks/use-owner-resource': { useOwnerResource: (url, user, live) => { reads.push([url, live]); return own; } },
 });
 let result;
 const Probe = () => { result = useRangeData({ from: '2025-01-01', to: '2026-03-31' }); return null; };
 hooks.mount(React.createElement(Probe));
 assert.deepEqual(result.data.records.map(record => record.id), ['s']);assert.equal(result.loading, false);
 assert.equal(result.retry(), undefined);
 assert.match(reads[0][0], /scope=budget&month=2026-03&from=2025-01/);assert.equal(reads[0][1], false);
 current = { ...current, demo: false };
 hooks.mount(React.createElement(Probe));
 assert.deepEqual([result.data.records[0].id, result.loading, result.error, result.retry()], ['f', true, 'remote', 'retried']);
});
