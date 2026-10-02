"use client";
import { MonthlyReview } from '@/components/financial-review';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton, WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { OverviewHeading, useOverviewCards } from '@/components/overview-page';
import { Fragment, useState, type ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';
import { BudgetCard, CustomizeDashboardDialog, GoalsCard, RecentTransactionsCard, WeeklyRecapCard } from '@/components/dashboard-cards';
import { Button } from '@/components/ui/button';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { dashboardColumns, type DashboardCard } from '@/lib/dashboard-layout';
import { PortfolioOverview } from '@/components/portfolio-overview';
import { SpendingPaceCard } from '@/components/spending-pace-card';
import { TelegramNudge } from '@/components/telegram-nudge';
import { ScreenNotices, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function OverviewScreen() {
 const { t } = useLanguage();
 const { user, demo, rows, addCashFlow, current, currency, market, reload, preferencesData, excludedCurrencies, snapshots, forecast, forecastReady, planning, transactionTools, expensePlans, workspacePreferences, workspaceLoading } = useWorkspace();
 const planningReady = demo || (!planning.loading && !planning.error);
 const cards = useOverviewCards({ entries: current, currency, excludedCurrencies, forecast, forecastReady, planning: planningReady ? planning.data : null });
 const { layout, change } = useDashboardLayout(workspacePreferences, demo);
 const [customizing, setCustomizing] = useState(false);
 const columns = dashboardColumns(layout);
 const card: Record<DashboardCard, ReactNode> = {
  net_worth: null,
  spending: planningReady && <SpendingPaceCard owner={user} demo={demo} revision={reload} data={planning.data} splits={transactionTools.data.splits} snapshots={snapshots.snapshots} currency={currency} market={market}/>,
  budget: planningReady && <BudgetCard owner={user} demo={demo} revision={reload} data={planning.data} currency={currency} market={market} splits={transactionTools.data.splits}/>,
  recap: planningReady && <WeeklyRecapCard owner={user} demo={demo} revision={reload} data={planning.data} currency={currency} market={market}/>,
  commitments: cards.commitments,
  allocation: cards.allocation,
  goals: planningReady && <GoalsCard goals={planning.data.goals} currency={currency}/>,
  transactions: planningReady && <RecentTransactionsCard owner={user} demo={demo} revision={reload} data={planning.data}/>,
  upcoming: cards.upcoming,
 };
 const place = (list: DashboardCard[]) => list.map(id => <Fragment key={id}>{card[id]}</Fragment>);
 const aside = <>{place(columns.right)}</>;
 return <>
  <div data-page="Overview" className="content overview-content">
   <OverviewHeading name={preferencesData.display_name?.trim()}><Button variant="outline" onClick={() => setCustomizing(true)}><LayoutGrid size={16} aria-hidden="true"/>{t('Customize')}</Button></OverviewHeading>
   <ScreenNotices/>
   {!workspaceLoading&&<TelegramNudge demo={demo}/>}
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Overview"/> : <PortfolioOverview excludedCurrencies={excludedCurrencies} snapshots={snapshots.snapshots} snapshotError={snapshots.error} onSnapshotRetry={snapshots.retry} key={demo ? 'demo' : user} entries={current} demoRecords={demo ? rows : undefined} currency={currency} market={market} demo={demo} revision={reload} onAddIncome={() => addCashFlow('Other income')} aside={aside} showNetWorth={columns.left.includes('net_worth')}>
    {place(columns.left)}
   </PortfolioOverview>}
  </div>
  {customizing&&<CustomizeDashboardDialog layout={layout} onChange={change} onClose={() => setCustomizing(false)}/>}
  {(workspacePreferences.error||planning.error||transactionTools.error||expensePlans.error)&&<ToolsUnavailable/>}
  {planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')} className="tools-panel monthly-review"/></div>}
  {!planning.loading&&!planning.error&&<div className="content review-content"><MonthlyReview owner={user} demo={demo} revision={reload} market={market} data={planning.data} tools={transactionTools} snapshots={snapshots.snapshots} historyError={snapshots.error} currency={currency}/></div>}
 </>;
}
