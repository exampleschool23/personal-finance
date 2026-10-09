"use client";
import { useMemo, useState, type ReactNode } from 'react';
import { ReportSummary, ReportTransactions, type ReportNames } from '@/components/business-reports';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { AttributeTab } from '@/components/reports/attribute-tab';
import { CashFlowTab } from '@/components/reports/cash-flow-tab';
import { ReportFilters, type RangeChoice } from '@/components/reports/report-filters';
import { TaxTab } from '@/components/reports/tax-tab';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useBudget } from '@/hooks/use-budget';
import { useReportLink } from '@/hooks/use-report-link';
import { useRangeData } from '@/hooks/use-report-data';
import { budgetCategories } from '@/lib/budget';
import { HOUSEHOLD } from '@/lib/business';
import { drillMatches, filterLines, rangeFor, rangeMonths, readableRange, reportLedger, type Drill, type LedgerLine, type ReportRange } from '@/lib/business-report';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate } from '@/lib/format';
import { inOwnerFilter, ownerOf, SHARED, workspaceOwners } from '@/lib/household';
import { describeDrill, groupFinder, reportNames, reportTabsFor, tabLines, type ReportTab } from '@/lib/report-view';

const tabLabels: Record<ReportTab, string> = { cash_flow: 'Cash flow', spending: 'Spending', income: 'Income', tax: 'Business tax prep' };

/** Reports: cash flow, spending and income for the household and each business, with breakdowns, trends and a
 * profit and loss table, and business tax prep. Every chart narrows the transactions below it. */
export function ReportsScreen() {
 const { t, locale } = useLanguage();
 const { user, demo, reload, currency, market, transactionTools, businessList, workspacePreferences, setViewing, storedRecord, household } = useWorkspace();
 // In a shared household, reports narrow to what one person owns or to what is shared.
 const homes = household.state;
 const owners = workspaceOwners(homes, { shared: t('Shared'), unnamed: t('Partner') });
 const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
 const today = depositToday();
 const { tab, setTab, businesses, setBusinesses, cashView, setCashView, cashMode, setCashMode } = useReportLink();
 const [preset, setPreset] = useState<RangeChoice>('this_year');
 const [custom, setCustom] = useState<ReportRange>(() => rangeFor('last_3_months', today));
 const range = preset === 'custom' ? readableRange(custom) : rangeFor(preset, today);
 const { data, loading, error, retry } = useRangeData(range);
 const rates = market?.rates ?? market?.fx?.rate;
 const splits = transactionTools.data.splits;
 const ledger = useMemo(() => reportLedger(data, splits, range, currency, today, rates), [data, splits, range, currency, today, rates]);
 // Costs that come from an asset's history rather than a transaction belong to the household.
 const lines = useMemo(() => filterLines(ledger.lines, businesses).filter(line => !homes || inOwnerFilter(ownerFilter, line.record ? ownerOf(line.record, homes) : SHARED)), [ledger.lines, businesses, homes, ownerFilter]);
 const budget = useBudget(user, demo, reload);
 const groups = useMemo(() => new Map(budgetCategories(data.categories, budget.state.categories).map(category => [category.key, category.group])), [data.categories, budget.state.categories]);
 const groupOf = groupFinder(groups, data.categories);
 const names = reportNames(data.categories, businessList, t);
 const [drill, setDrill] = useState<{ drill: Drill; label: string } | null>(null);
 const narrow = (next: Drill) => setDrill({ drill: next, label: describeDrill(next, names, t) });
 // Changing what the page shows starts again from every transaction.
 const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setDrill(null); };
 const visibleTabs = reportTabsFor(businessList.length > 0);
 const shownTab = visibleTabs.includes(tab) ? tab : 'cash_flow';
 const end = range.to < today ? range.to : today;
 const rangeLabel = `${formatDate(range.from, locale)} – ${formatDate(end, locale)}`;
 const open = (line: LedgerLine) => line.record && setViewing(storedRecord(line.record));
 const tabProps = { range, rangeLabel, names, groupOf, currency, onDrill: narrow };

 return <div data-page="Reports" className="content reports-content">
  <PageHeader title={t('Reports')} tabs={<Segmented as="nav" className="page-tabs" label={t('Reports')} options={visibleTabs.map(value => ({ value, label: t(tabLabels[value]) }))} value={shownTab} onChange={reset(setTab)}/>} hint={t('Cash flow, spending and income for your household and each business. Click any part of a chart or table to see its transactions.')}>
   {shownTab !== 'tax' && <ReportFilters businesses={businessList} business={businesses} onBusiness={reset(setBusinesses)} owners={owners} owner={ownerFilter} onOwner={reset(setOwnerFilter)} preset={preset} range={preset === 'custom' ? custom : { from: range.from, to: range.to < today ? range.to : today }} today={today} onPreset={reset(setPreset)} onRange={reset((next: ReportRange) => { setCustom(next); setPreset('custom'); })}/>}
  </PageHeader>
  {shownTab !== 'tax' && preset === 'custom' && rangeMonths(custom).length > 24 && <p className="bulk-bar-note" role="status">{t('Reports cover up to 24 months.')}</p>}
  {shownTab === 'tax' ? <TaxTab preferences={workspacePreferences.data.preferences} save={workspacePreferences.save} names={names} onOpen={open}/>
   : error ? <InlineError message={t(error)} onRetry={retry}/> : loading ? <PanelSkeleton label={t('Loading records…')} rows={6}/> : <ReportBody tab={shownTab} lines={lines} names={names} currency={currency} drill={drill} onClear={() => setDrill(null)} missing={ledger.missing} fileName={`${shownTab.replace('_', '-')}-${range.from}-${end}`} onOpen={open}>
    {shownTab === 'cash_flow' ? <CashFlowTab {...tabProps} lines={lines} includeHousehold={!businesses.length || businesses.includes(HOUSEHOLD)} businessIds={businessList.map(item => item.id).filter(id => businesses.includes(id) || (!businesses.length && lines.some(line => line.business === id)))} view={cashView} onView={setCashView} mode={cashMode} onMode={setCashMode}/>
     : <AttributeTab {...tabProps} key={shownTab} direction={shownTab === 'spending' ? 'expense' : 'income'} lines={tabLines(shownTab, lines)} hasBusinesses={businessList.length > 0}/>}
   </ReportBody>}
 </div>;
}

/** A report tab's chart, then the transactions it narrows to beside their summary. */
function ReportBody({ tab, lines, names, currency, drill, onClear, missing, fileName, onOpen, children }: { tab: ReportTab; lines: LedgerLine[]; names: ReportNames; currency: string; drill: { drill: Drill; label: string } | null; onClear: () => void; missing: number; fileName: string; onOpen: (line: LedgerLine) => void; children: ReactNode }) {
 const { t } = useLanguage();
 const shown = tabLines(tab, lines).filter(line => drillMatches(drill?.drill ?? null, line));
 return <>
  {children}
  {missing > 0 && <p className="muted">{t('{count} transactions in other currencies are left out until exchange rates load.', { count: missing })}</p>}
  <div className="transactions-layout">
   <ReportTransactions key={drill?.label ?? 'all'} lines={shown} drill={drill?.drill ?? null} label={drill?.label ?? null} names={names} currency={currency} onClear={onClear} onOpen={onOpen}/>
   <ReportSummary lines={shown} mixed={tab === 'cash_flow'} names={names} currency={currency} fileName={fileName}/>
  </div>
 </>;
}
