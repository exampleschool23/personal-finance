"use client";
import { MonthlyReview } from '@/components/financial-review';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton, WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { OverviewHeading, OverviewSummary } from '@/components/overview-page';
import { PortfolioOverview } from '@/components/portfolio-overview';
import { TelegramNudge } from '@/components/telegram-nudge';
import { DemoBanner, ScreenNotices, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function OverviewScreen() {
 const { t } = useLanguage();
 const { user, demo, rows, addCashFlow, current, currency, market, reload, preferencesData, excludedCurrencies, snapshots, forecast, forecastReady, planning, transactionTools, expensePlans, workspacePreferences, workspaceLoading } = useWorkspace();
 return <>
  <div data-page="Overview" className="content overview-content">
   <DemoBanner/>
   <OverviewHeading name={preferencesData.display_name?.trim()}/>
   <ScreenNotices/>
   {!workspaceLoading&&<TelegramNudge demo={demo}/>}
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Overview"/> : <PortfolioOverview excludedCurrencies={excludedCurrencies} snapshots={snapshots.snapshots} snapshotError={snapshots.error} onSnapshotRetry={snapshots.retry} key={demo ? 'demo' : user} entries={current} demoRecords={demo ? rows : undefined} currency={currency} market={market} demo={demo} revision={reload} onAddIncome={() => addCashFlow('Other income')}>
    <OverviewSummary entries={current} currency={currency} excludedCurrencies={excludedCurrencies} forecast={forecast} forecastReady={forecastReady} planning={demo || (!planning.loading && !planning.error) ? planning.data : null}/>
   </PortfolioOverview>}
  </div>
  {(workspacePreferences.error||planning.error||transactionTools.error||expensePlans.error)&&<ToolsUnavailable/>}
  {planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')} className="tools-panel monthly-review"/></div>}
  {!planning.loading&&!planning.error&&<div className="content review-content"><MonthlyReview owner={user} demo={demo} revision={reload} market={market} data={planning.data} tools={transactionTools} snapshots={snapshots.snapshots} historyError={snapshots.error} currency={currency}/></div>}
 </>;
}
