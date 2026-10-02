"use client";
import { MonthlyReview } from '@/components/financial-review';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton, WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { OverviewHeading, useOverviewCards } from '@/components/overview-page';
import { GoalsCard, RecentTransactionsCard } from '@/components/dashboard-cards';
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
 const aside = <>
  {planningReady && <GoalsCard goals={planning.data.goals} currency={currency}/>}
  {planningReady && <RecentTransactionsCard owner={user} demo={demo} revision={reload} data={planning.data}/>}
  {cards.upcoming}
 </>;
 return <>
  <div data-page="Overview" className="content overview-content">
   <OverviewHeading name={preferencesData.display_name?.trim()}/>
   <ScreenNotices/>
   {!workspaceLoading&&<TelegramNudge demo={demo}/>}
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Overview"/> : <PortfolioOverview excludedCurrencies={excludedCurrencies} snapshots={snapshots.snapshots} snapshotError={snapshots.error} onSnapshotRetry={snapshots.retry} key={demo ? 'demo' : user} entries={current} demoRecords={demo ? rows : undefined} currency={currency} market={market} demo={demo} revision={reload} onAddIncome={() => addCashFlow('Other income')} aside={aside}>
    {planningReady && <SpendingPaceCard owner={user} demo={demo} revision={reload} data={planning.data} splits={transactionTools.data.splits} snapshots={snapshots.snapshots} currency={currency} market={market}/>}
    {cards.commitments}
    {cards.allocation}
   </PortfolioOverview>}
  </div>
  {(workspacePreferences.error||planning.error||transactionTools.error||expensePlans.error)&&<ToolsUnavailable/>}
  {planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')} className="tools-panel monthly-review"/></div>}
  {!planning.loading&&!planning.error&&<div className="content review-content"><MonthlyReview owner={user} demo={demo} revision={reload} market={market} data={planning.data} tools={transactionTools} snapshots={snapshots.snapshots} historyError={snapshots.error} currency={currency}/></div>}
 </>;
}
