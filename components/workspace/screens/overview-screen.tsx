"use client";
import { useLanguage } from '@/components/language-provider';
import { WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { OverviewHeading, useOverviewCards } from '@/components/overview-page';
import { useState, type ReactNode } from 'react';
import { Check, LayoutGrid } from 'lucide-react';
import { CustomizeDashboardDialog, DashboardBoard } from '@/components/dashboard-board';
import { BudgetCard, GoalsCard, RecentTransactionsCard } from '@/components/dashboard-cards';
import { BusinessCard } from '@/components/business-card';
import { LowestBalanceCard } from '@/components/cash-forecast';
import { Button } from '@/components/ui/button';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import type { DashboardCard } from '@/lib/dashboard-layout';
import { depositToday } from '@/lib/deposit-interest';
import { savedGoalOrder } from '@/lib/goal-order';
import { firstVisit } from '@/lib/onboarding';
import { goalFinancials } from '@/lib/goal-projection';
import { PortfolioOverview } from '@/components/portfolio-overview';
import { SpendingPaceCard } from '@/components/spending-pace-card';
import { TelegramNudge } from '@/components/telegram-nudge';
import { ScreenNotices, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function OverviewScreen() {
 const { t } = useLanguage();
 const { user, demo, rows, addCashFlow, current, currency, market, reload, preferencesData, excludedCurrencies, snapshots, forecast, forecastReady, planning, transactionTools, expensePlans, workspacePreferences, workspaceLoading, businessList, setSettingUpBusinesses } = useWorkspace();
 const planningReady = demo || (!planning.loading && !planning.error);
 const cards = useOverviewCards({ entries: current, currency, excludedCurrencies, forecast, forecastReady, planning: planningReady ? planning.data : null });
 const { layout, change } = useDashboardLayout(workspacePreferences, demo);
 const [customizing, setCustomizing] = useState(false);
 // Rearrange mode: handles show and the cards wiggle until Done.
 const [arranging, setArranging] = useState(false);
 const card = ({ netWorth, income }: { netWorth: ReactNode; income: ReactNode }): Record<DashboardCard, ReactNode> => ({
  net_worth: netWorth,
  spending: planningReady && <SpendingPaceCard owner={user} demo={demo} revision={reload} data={planning.data} splits={transactionTools.data.splits} snapshots={snapshots.snapshots} currency={currency} market={market}/>,
  budget: planningReady && <BudgetCard owner={user} demo={demo} revision={reload} data={planning.data} currency={currency} market={market} splits={transactionTools.data.splits}/>,
  business: planningReady && <BusinessCard owner={user} demo={demo} revision={reload} data={planning.data} splits={transactionTools.data.splits} businesses={businessList} currency={currency} market={market} onSetup={() => setSettingUpBusinesses(true)}/>,
  commitments: cards.commitments,
  allocation: cards.allocation,
  goals: planningReady && <GoalsCard goals={planning.data.goals} order={savedGoalOrder(workspacePreferences.data.preferences)} data={planning.data} currency={currency} netWorth={code => goalFinancials(planning.data.records, [], depositToday().slice(0, 7), code, market, false).netWorth}/>,
  transactions: planningReady && <RecentTransactionsCard owner={user} demo={demo} revision={reload} data={planning.data}/>,
  upcoming: cards.upcoming,
  forecast: planningReady && !expensePlans.loading && <LowestBalanceCard data={planning.data} plans={expensePlans.plans} plansMonth={expensePlans.month} currency={currency} rates={market?.rates ?? market?.fx?.rate}/>,
  income,
 });
 return <>
  <div data-page="Overview" className="content overview-content">
   <OverviewHeading name={preferencesData.display_name?.trim()} firstVisit={!demo && firstVisit(preferencesData, depositToday())}>{arranging ? <Button onClick={() => setArranging(false)}><Check size={16} aria-hidden="true"/>{t('Done')}</Button> : <Button variant="outline" onClick={() => setCustomizing(true)}><LayoutGrid size={16} aria-hidden="true"/>{t('Customize')}</Button>}</OverviewHeading>
   <ScreenNotices/>
   {!workspaceLoading&&<TelegramNudge demo={demo}/>}
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Overview"/> : <PortfolioOverview excludedCurrencies={excludedCurrencies} snapshots={snapshots.snapshots} snapshotError={snapshots.error} onSnapshotRetry={snapshots.retry} key={demo ? 'demo' : user} entries={current} demoRecords={demo ? rows : undefined} currency={currency} market={market} demo={demo} revision={reload} onAddIncome={() => addCashFlow('Other income')} board={nodes => <DashboardBoard layout={layout} cards={card(nodes)} arranging={arranging} onChange={change}/>}/>}
  </div>
  {customizing&&<CustomizeDashboardDialog layout={layout} onChange={change} onRearrange={() => { setCustomizing(false); setArranging(true); }} onClose={() => setCustomizing(false)}/>}
  {(workspacePreferences.error||planning.error||transactionTools.error||expensePlans.error)&&<ToolsUnavailable/>}
 </>;
}
