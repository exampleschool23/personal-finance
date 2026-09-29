"use client";
import { Plus } from 'lucide-react';
import { AssetDashboard } from '@/components/asset-dashboard';
import { useLanguage } from '@/components/language-provider';
import { WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { PortfolioAllocationPlan } from '@/components/portfolio-allocation-plan';
import { Button } from '@/components/ui/button';
import { DemoBanner, ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function AssetsScreen() {
 const { t } = useLanguage();
 const { user, demo, rows, currency, market, preferencesData, excludedCurrencies, planning, workspacePreferences, netWorth, totalDebt, forecast, forecastReady, tableLoading, workspaceLoading, addRecord, addAccountRecord, editRecord, setTracking, requestDelete, quoteLabel, refreshRecords } = useWorkspace();
 return <>
  <div data-page="Assets & investments" className="content assets-content">
   <DemoBanner/>
   <PageHeader title={t('Assets & investments')} description={t("Manage your records and keep your balances up to date.")}><Button onClick={addRecord}><Plus size={17} aria-hidden="true"/>{t("Add asset")}</Button></PageHeader>
   <ScreenNotices/>
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Assets & investments"/> : <AssetDashboard excludedCurrencies={excludedCurrencies} accounts={planning.data.holdingAccounts??[]} accountsLoading={planning.loading} accountsError={planning.error} onRetryAccounts={refreshRecords} onAddHolding={addAccountRecord} records={rows} currency={currency} market={market} netWorth={netWorth} debt={totalDebt} forecast={forecast} forecastReady={forecastReady} loading={tableLoading} demo={demo} onAdd={addRecord} onEdit={editRecord} onTrack={setTracking} onDelete={requestDelete} quoteLabel={quoteLabel}/>}
  </div>
  {!planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><PortfolioAllocationPlan currencies={preferencesData.currencies} records={planning.data.records} currency={currency} market={market} preferences={workspacePreferences}/></div>}
 </>;
}
