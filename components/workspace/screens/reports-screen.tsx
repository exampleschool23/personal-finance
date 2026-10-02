"use client";
import { useMemo, useState } from 'react';
import { attributeColor, BreakdownDonut, BusinessSankeyChart, ProfitLossTable, ReportTransactions, TrendChart, type ReportNames } from '@/components/business-reports';
import { ShareBars } from '@/components/cash-flow-report';
import { useLanguage } from '@/components/language-provider';
import { BusinessFilter } from '@/components/presentation-foundation/business-filter';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { TaxPrepSheet } from '@/components/tax-prep-sheet';
import { NativeSelect } from '@/components/ui/native-select';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useBudget } from '@/hooks/use-budget';
import { queryList, useLocationSearch } from '@/hooks/use-location-search';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { budgetCategories } from '@/lib/budget';
import { HOUSEHOLD } from '@/lib/business';
import { attributeTrend, businessKey, businessSankey, cashFlowTrend, drillMatches, filterLines, intervals, profitAndLoss, rangeFor, rangeMonths, readableRange, reportLedger, reportRangeLabels, reportRanges, sharesBy, type Attribute, type Direction, type Drill, type Interval, type LedgerLine, type ReportRange, type ReportRangePreset } from '@/lib/business-report';
import { defaultTaxSettings, taxPeriodRange, type TaxPeriod, type TaxSettings } from '@/lib/business-tax';
import { depositToday } from '@/lib/deposit-interest';
import { expenses, income, normalizeEntry } from '@/lib/finance';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import type { WorkspacePreference } from '@/lib/workspace-preferences';

const tabs = ['cash_flow', 'spending', 'income', 'tax'] as const;
type Tab = typeof tabs[number];
const tabLabels: Record<Tab, string> = { cash_flow: 'Cash flow', spending: 'Spending', income: 'Income', tax: 'Business tax prep' };
const intervalLabels: Record<Interval, string> = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
const attributeLabels: Record<Attribute, string> = { category: 'Category', group: 'Group', merchant: 'Merchant', business: 'Business' };

/** Planning data for a range: the sample workspace's own records, or a read of at most 24 months. */
function useRangeData(range: ReportRange) {
 const { user, demo, reload, planning } = useWorkspace();
 const live = !!user && !demo, read = readableRange(range);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${read.to.slice(0, 7)}&from=${read.from.slice(0, 7)}`, user, live, reload, emptyPlanning);
 const data: PlanningData = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 return { data, loading: live ? remote.initialLoading : planning.loading, error: live ? remote.error : planning.error, retry: live ? remote.retry : () => undefined };
}

/** Reports: cash flow, spending and income for the household and each business, with breakdowns, trends and a
 * profit and loss table, and business tax prep. Every chart narrows the transactions below it. */
export function ReportsScreen() {
 const { t, locale } = useLanguage();
 const { user, demo, reload, currency, market, transactionTools, businessList, workspacePreferences, setViewing, storedRecord } = useWorkspace();
 const today = depositToday();
 const search = useLocationSearch();
 const [tab, setTab] = useState<Tab>('cash_flow');
 const [businesses, setBusinesses] = useState<string[]>([]);
 const [preset, setPreset] = useState<ReportRangePreset | 'custom'>('this_year');
 const [custom, setCustom] = useState<ReportRange>(() => rangeFor('last_3_months', today));
 const [cashView, setCashView] = useState<'sankey' | 'pnl'>('sankey');
 const [cashMode, setCashMode] = useState<'breakdown' | 'trends'>('breakdown');
 const [appliedSearch, setAppliedSearch] = useState('');
 // Dashboard links open a tab, a business and a view: /reports?tab=cash_flow&business=…&view=pnl.
 if (search !== appliedSearch) {
  setAppliedSearch(search);
  const params = new URLSearchParams(search), wanted = params.get('tab');
  if (wanted && (tabs as readonly string[]).includes(wanted)) setTab(wanted as Tab);
  if (params.has('business')) setBusinesses(queryList(search, 'business'));
  const view = params.get('view');
  if (view === 'pnl' || view === 'sankey') { setCashView(view); setCashMode('breakdown'); }
  if (view === 'trends') setCashMode('trends');
 }
 const range = preset === 'custom' ? readableRange(custom) : rangeFor(preset, today);
 const { data, loading, error, retry } = useRangeData(range);
 const rates = market?.rates ?? market?.fx?.rate;
 const splits = transactionTools.data.splits;
 const ledger = useMemo(() => reportLedger(data, splits, range, currency, today, rates), [data, splits, range, currency, today, rates]);
 const lines = useMemo(() => filterLines(ledger.lines, businesses), [ledger.lines, businesses]);
 const budget = useBudget(user, demo, reload);
 const groups = useMemo(() => new Map(budgetCategories(data.categories, budget.state.categories).map(category => [category.key, category.group])), [data.categories, budget.state.categories]);
 const groupOf = (key: string) => groups.get(key) ?? (income.includes(key) || data.categories.some(category => category.id === key && category.direction === 'income') ? 'Income' : 'Everyday spending');
 const names: ReportNames = {
  category: key => data.categories.find(category => category.id === key)?.name ?? t(key),
  icon: key => data.categories.find(category => category.id === key)?.name ?? key,
  group: key => t(key),
  business: id => !id || id === HOUSEHOLD ? t('Household') : businessList.find(item => item.id === id)?.name ?? t('Business'),
  businessRecord: id => businessList.find(item => item.id === id),
 };
 const [drill, setDrill] = useState<{ drill: Drill; label: string } | null>(null);
 const describe = (next: Drill) => [next.category ? names.category(next.category) : next.categories ? t('{count} categories', { count: next.categories.length }) : next.direction ? t(next.direction === 'income' ? 'Income' : 'Expenses') : null, next.merchant, next.business !== undefined ? names.business(next.business) : null].filter(Boolean).join(' · ');
 const narrow = (next: Drill) => setDrill({ drill: next, label: describe(next) });
 const tabLines = tab === 'spending' ? lines.filter(line => line.direction === 'expense') : tab === 'income' ? lines.filter(line => line.direction === 'income') : lines;
 const shown = tabLines.filter(line => drillMatches(drill?.drill ?? null, line));
 const visibleTabs = tabs.filter(item => item !== 'tax' || businessList.length > 0);
 const rangeLabel = `${formatDate(range.from, locale)} – ${formatDate(range.to < today ? range.to : today, locale)}`;

 return <div data-page="Reports" className="content reports-content">
  <PageHeader title={t('Reports')} hint={t('Cash flow, spending and income for your household and each business. Click any part of a chart or table to see its transactions.')}>
   {tab !== 'tax' && businessList.length > 0 && <BusinessFilter businesses={businessList} value={businesses} onChange={value => { setBusinesses(value); setDrill(null); }}/>}
   {tab !== 'tax' && <NativeSelect aria-label={t('Date range')} value={preset} onChange={event => { setPreset(event.currentTarget.value as ReportRangePreset | 'custom'); setDrill(null); }}>
    {reportRanges.map(item => <option key={item} value={item}>{t(reportRangeLabels[item])}</option>)}
    <option value="custom">{t('Custom range')}</option>
   </NativeSelect>}
  </PageHeader>
  {tab !== 'tax' && preset === 'custom' && <div className="transactions-tools report-custom-range">
   <DatePicker value={custom.from} max={custom.to} onChange={from => from && setCustom({ ...custom, from })}/>
   <DatePicker value={custom.to} min={custom.from} max={today} onChange={to => to && setCustom({ ...custom, to })}/>
   {rangeMonths(custom).length > 24 && <span className="bulk-bar-note">{t('Reports cover up to 24 months.')}</span>}
  </div>}
  <Segmented as="nav" className="cashflow-tabs" label={t('Reports')} options={visibleTabs.map(value => ({ value, label: t(tabLabels[value]) }))} value={visibleTabs.includes(tab) ? tab : 'cash_flow'} onChange={value => { setTab(value); setDrill(null); }}/>
  {tab === 'tax' && businessList.length > 0 ? <TaxTab preferences={workspacePreferences.data.preferences} save={workspacePreferences.save} names={names} onOpen={line => line.record && setViewing(storedRecord(line.record))}/>
   : error ? <InlineError message={t(error)} onRetry={retry}/> : loading ? <PanelSkeleton label={t('Loading records…')} rows={6}/> : <>
   {tab === 'cash_flow' ? <CashFlowTab lines={lines} range={range} rangeLabel={rangeLabel} includeHousehold={!businesses.length || businesses.includes(HOUSEHOLD)} businessIds={businessList.map(item => item.id).filter(id => businesses.includes(id) || (!businesses.length && lines.some(line => line.business === id)))} names={names} groupOf={groupOf} currency={currency} view={cashView} onView={setCashView} mode={cashMode} onMode={setCashMode} onDrill={narrow}/>
    : <AttributeTab key={tab} direction={tab === 'spending' ? 'expense' : 'income'} lines={tabLines} range={range} rangeLabel={rangeLabel} names={names} groupOf={groupOf} hasBusinesses={businessList.length > 0} currency={currency} onDrill={narrow}/>}
   {ledger.missing > 0 && <p className="muted">{t('{count} transactions in other currencies are left out until exchange rates load.', { count: ledger.missing })}</p>}
   <ReportTransactions key={drill?.label ?? 'all'} lines={shown} drill={drill?.drill ?? null} label={drill?.label ?? null} names={names} currency={currency} onClear={() => setDrill(null)}/>
  </>}
 </div>;
}

type TabProps = { lines: LedgerLine[]; range: ReportRange; rangeLabel: string; names: ReportNames; groupOf: (key: string) => string; currency: string; onDrill: (drill: Drill) => void };

/** Cash flow: the period's totals, its breakdown as a Sankey or a profit and loss table, and its trend over time. */
function CashFlowTab({ lines, range, rangeLabel, includeHousehold, businessIds, names, groupOf, currency, view, onView, mode, onMode: setMode, onDrill }: TabProps & { includeHousehold: boolean; businessIds: string[]; view: 'sankey' | 'pnl'; onView: (view: 'sankey' | 'pnl') => void; mode: 'breakdown' | 'trends'; onMode: (mode: 'breakdown' | 'trends') => void }) {
 const { t, locale } = useLanguage();
 const [breakdown, setBreakdown] = useState<'category' | 'group' | 'both'>('category');
 const [stacked, setStacked] = useState(false), [interval, setInterval] = useState<Interval>('month');
 const pnl = useMemo(() => profitAndLoss(lines, businessIds, line => line.category, includeHousehold), [lines, businessIds, includeHousehold]);
 const totals = lines.reduce((sum, line) => line.direction === 'income' ? { ...sum, income: sum.income + line.amount } : { ...sum, expenses: sum.expenses + line.amount }, { income: 0, expenses: 0 });
 const net = totals.income - totals.expenses;
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const sankey = businessSankey(pnl, { category: names.category, business: id => names.business(id), total: t(businessIds.length ? 'Household income' : 'Income'), savings: t('Savings'), profit: t('Net profit'), loss: name => t('{name} net loss', { name }), otherIncome: t('Other income'), otherExpense: t('Other expense') });
 const trend = cashFlowTrend(lines, range, interval);
 return <>
  <StatTiles columns={4} label={t('Cash flow')}>
   <StatTile label={t('Income')} value={money(totals.income)} tone={totals.income > 0 ? 'positive' : undefined}/>
   <StatTile label={t('Expenses')} value={money(totals.expenses)}/>
   <StatTile label={t('Net income')} value={money(net)} tone={signTone(net)}/>
   <StatTile label={t('Savings rate')} value={totals.income > 0 ? formatPercent(net / totals.income * 100, locale) : '—'} tone={totals.income > 0 ? signTone(net) : undefined}/>
  </StatTiles>
  <section className="panel">
   <PanelTitle title={<>{t(mode === 'breakdown' ? 'Breakdown' : 'Trends')} <span className="panel-figure">{rangeLabel}</span></>}>
    <div className="cash-flow-switches">
     <Segmented label={t('Report view')} options={[{ value: 'breakdown', label: t('Breakdown') }, { value: 'trends', label: t('Trends') }] as const} value={mode} onChange={setMode}/>
     {mode === 'breakdown' ? <Segmented label={t('Chart type')} options={[{ value: 'sankey', label: t('Sankey') }, { value: 'pnl', label: t('Profit & loss') }] as const} value={view} onChange={onView}/>
      : <><Segmented label={t('Chart type')} options={[{ value: 'grouped', label: t('Grouped') }, { value: 'stacked', label: t('Stacked') }] as const} value={stacked ? 'stacked' : 'grouped'} onChange={value => setStacked(value === 'stacked')}/>
       <Segmented label={t('Interval')} options={intervals.map(value => ({ value, label: t(intervalLabels[value]) }))} value={interval} onChange={setInterval}/></>}
     {mode === 'breakdown' && view === 'pnl' && <Segmented label={t('Rows')} options={[{ value: 'category', label: t('Categories') }, { value: 'group', label: t('Groups') }, { value: 'both', label: t('Both') }] as const} value={breakdown} onChange={setBreakdown}/>}
    </div>
   </PanelTitle>
   {mode === 'trends' ? <TrendChart rows={stacked ? trend.map(row => ({ period: row.period, income: row.income, expenses: -row.expenses })) : trend} interval={interval} currency={currency} stacked={stacked} series={[{ key: 'income', label: t('Income'), color: 'var(--positive)' }, { key: 'expenses', label: t('Expenses'), color: 'color-mix(in srgb, var(--foreground) 55%, transparent)' }]}/>
    : view === 'sankey' ? <BusinessSankeyChart data={sankey} currency={currency} onDrill={onDrill}/>
    : <ProfitLossTable pnl={pnl} breakdown={breakdown} names={names} groupOf={groupOf} currency={currency} onDrill={onDrill}/>}
  </section>
 </>;
}

/** Spending or income: the total, a breakdown by category, group, merchant or business (bars or a donut), and trends. */
function AttributeTab({ direction, lines, range, rangeLabel, names, groupOf, hasBusinesses, currency, onDrill }: TabProps & { direction: Direction; hasBusinesses: boolean }) {
 const { t, locale } = useLanguage();
 const [mode, setMode] = useState<'breakdown' | 'trends'>('breakdown');
 const [attribute, setAttribute] = useState<Attribute>('category');
 const [visual, setVisual] = useState<'bars' | 'donut'>('bars');
 const [stacked, setStacked] = useState(true), [interval, setInterval] = useState<Interval>('month');
 const keyOf = (line: LedgerLine) => attribute === 'category' ? line.category : attribute === 'group' ? groupOf(line.category) : attribute === 'merchant' ? line.name : businessKey(line);
 const label = (key: string) => attribute === 'category' ? names.category(key) : attribute === 'group' ? names.group(key) : attribute === 'merchant' ? key : names.business(key);
 const color = (key: string) => key === 'other' ? 'var(--muted-foreground)' : attributeColor(attribute, key, names);
 const drillOf = (key: string): Drill => attribute === 'category' ? { direction, category: key } : attribute === 'merchant' ? { direction, merchant: key } : attribute === 'business' ? { direction, business: key === HOUSEHOLD ? null : key } : { direction, categories: [...new Set(lines.filter(line => groupOf(line.category) === key).map(line => line.category))] };
 const items = sharesBy(lines, keyOf);
 const trend = attributeTrend(lines, range, interval, keyOf);
 const total = lines.reduce((sum, line) => sum + line.amount, 0);
 const attributes = (['category', 'group', 'merchant', ...(hasBusinesses ? ['business'] : [])] as Attribute[]);
 return <>
  <StatTiles columns="auto" label={t(direction === 'expense' ? 'Spending' : 'Income')}>
   <StatTile label={t(direction === 'expense' ? 'Total spending' : 'Total income')} value={formatMoney(total, currency, locale)} tone={direction === 'income' && total > 0 ? 'positive' : undefined}/>
   <StatTile label={t('Transactions')} value={String(lines.length)}/>
  </StatTiles>
  <section className="panel">
   <PanelTitle title={<>{t(mode === 'breakdown' ? 'Breakdown' : 'Trends')} <span className="panel-figure">{rangeLabel}</span></>}>
    <div className="cash-flow-switches">
     <Segmented label={t('Report view')} options={[{ value: 'breakdown', label: t('Breakdown') }, { value: 'trends', label: t('Trends') }] as const} value={mode} onChange={setMode}/>
     <Segmented label={t('Group by')} options={attributes.map(value => ({ value, label: t(attributeLabels[value]) }))} value={attribute} onChange={setAttribute}/>
     {mode === 'breakdown' ? <Segmented label={t('Chart type')} options={[{ value: 'bars', label: t('Bars') }, { value: 'donut', label: t('Donut') }] as const} value={visual} onChange={setVisual}/>
      : <><Segmented label={t('Chart type')} options={[{ value: 'grouped', label: t('Grouped') }, { value: 'stacked', label: t('Stacked') }] as const} value={stacked ? 'stacked' : 'grouped'} onChange={value => setStacked(value === 'stacked')}/>
       <Segmented label={t('Interval')} options={intervals.map(value => ({ value, label: t(intervalLabels[value]) }))} value={interval} onChange={setInterval}/></>}
    </div>
   </PanelTitle>
   {mode === 'trends' ? <TrendChart key={attribute + interval} rows={trend.rows} interval={interval} currency={currency} stacked={stacked} series={trend.keys.map(key => ({ key, label: key === 'other' ? t('Other') : label(key), color: color(key) }))}/>
    : visual === 'donut' ? <BreakdownDonut items={items} label={label} colorOf={color} currency={currency} onSelect={key => onDrill(drillOf(key))}/>
    : <ShareBars items={items} label={label} colorKey={color} currency={currency} limit={15} onSelect={key => onDrill(drillOf(key))}/>}
  </section>
 </>;
}

/** Business tax prep reads its own tax year, whatever range the other tabs show. */
function TaxTab({ preferences, save, names, onOpen }: { preferences: readonly WorkspacePreference[]; save: (preference: WorkspacePreference) => Promise<void>; names: ReportNames; onOpen: (line: LedgerLine) => void }) {
 const { demo, currency, market, transactionTools, businessList } = useWorkspace();
 const today = depositToday(), thisYear = Number(today.slice(0, 4));
 const [business, setBusiness] = useState(businessList[0]?.id ?? '');
 const [year, setYear] = useState(thisYear), [period, setPeriod] = useState<TaxPeriod>('year');
 const saved = preferences.find((item): item is Extract<WorkspacePreference, { key: 'tax_lines' }> => item.key === 'tax_lines')?.data as TaxSettings | undefined;
 const [sample, setSample] = useState<TaxSettings>(defaultTaxSettings);
 const settings = demo ? sample : saved ?? defaultTaxSettings;
 const range = taxPeriodRange(year, period);
 const { data, loading, error, retry } = useRangeData(range);
 const rates = market?.rates ?? market?.fx?.rate;
 const lines = useMemo(() => reportLedger(data, transactionTools.data.splits, range, currency, today, rates).lines.filter(line => line.business === (businessList.some(item => item.id === business) ? business : businessList[0]?.id)), [data, transactionTools.data.splits, range, currency, today, rates, business, businessList]);
 const categories = useMemo(() => [...income.filter(kind => kind !== 'Salary').map(key => ({ key, direction: 'income' as const })), ...expenses.map(key => ({ key, direction: 'expense' as const })), ...data.categories.map(category => ({ key: category.id, direction: category.direction }))], [data.categories]);
 const { t } = useLanguage();
 if (error) return <InlineError message={t(error)} onRetry={retry}/>;
 if (loading) return <PanelSkeleton label={t('Loading records…')} rows={6}/>;
 return <TaxPrepSheet lines={lines} businesses={businessList} business={businessList.some(item => item.id === business) ? business : businessList[0]?.id ?? ''} onBusiness={setBusiness} year={year} years={[thisYear, thisYear - 1]} onYear={setYear} period={period} onPeriod={setPeriod} categories={categories} settings={settings} onSettings={async next => { if (demo) setSample(next); else await save({ key: 'tax_lines', data: next }); }} names={names} currency={currency} onOpen={onOpen}/>;
}
