"use client";
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AssetDashboard } from '@/components/asset-dashboard';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton, WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { PortfolioAllocationPlan } from '@/components/portfolio-allocation-plan';
import { Button } from '@/components/ui/button';
import { ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function AssetsScreen() {
 const { t } = useLanguage();
 // Two views switched from the top bar: what you hold, and the target mix with its suggested contributions.
 const [view, setView] = useState<'holdings' | 'allocation'>('holdings');
 const { user, demo, rows, currency, market, preferencesData, excludedCurrencies, planning, workspacePreferences, netWorth, totalDebt, forecast, forecastReady, tableLoading, workspaceLoading, addRecord, addAccountRecord, editRecord, setTracking, investIn, requestDelete, quoteLabel, refreshRecords } = useWorkspace();
 return <>
  <div data-page="Assets & investments" className="content assets-content">
   <PageHeader title={t('Investments')} tabs={<Segmented className="page-tabs" as="nav" label={t('Investments')} options={[{ value: 'holdings', label: t('Holdings') }, { value: 'allocation', label: t('Target allocation') }] as const} value={view} onChange={setView}/>}><Button onClick={addRecord}><Plus size={17} aria-hidden="true"/>{t("Add asset")}</Button></PageHeader>
   <ScreenNotices/>
   {view === 'holdings' && (workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Assets & investments"/> : <AssetDashboard excludedCurrencies={excludedCurrencies} accounts={planning.data.holdingAccounts??[]} accountsLoading={planning.loading} accountsError={planning.error} onRetryAccounts={refreshRecords} onAddHolding={addAccountRecord} records={rows} currency={currency} market={market} netWorth={netWorth} debt={totalDebt} forecast={forecast} forecastReady={forecastReady} loading={tableLoading} demo={demo} onAdd={addRecord} onEdit={editRecord} onTrack={setTracking} onInvest={investIn} onDelete={requestDelete} quoteLabel={quoteLabel}/>)}
  </div>
  {view === 'allocation' && planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')}/></div>}
  {view === 'allocation' && !planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><PortfolioAllocationPlan currencies={preferencesData.currencies} records={planning.data.records} currency={currency} market={market} preferences={workspacePreferences}/></div>}
 </>;
}
