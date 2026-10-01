"use client";
import { AccountAccessPanel } from '@/components/account-access-panel';
import { DataTools } from '@/components/data-tools';
import { ImportHistory } from '@/components/import-history';
import { InvestmentComparisonSettings } from '@/components/investment-comparison-settings';
import { SettingsLayout } from '@/components/settings-layout';
import { SettingsPanel } from '@/components/settings-panel';
import { TelegramPanel } from '@/components/telegram-panel';
import { TransactionToolsPanel } from '@/components/transaction-tools-panel';
import { PlanningError } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function SettingsScreen() {
 const { user, demo, currency, market, reload, preferencesData, applyPreferences, settingsLoading, settingsError, retrySettings, planning, workspacePreferences, refreshRecords, clearLocalSession, restartOnboarding } = useWorkspace();
 return <div data-page="Settings" className="content">
  <SettingsLayout
   preferences={<><SettingsPanel key={String(user) + settingsLoading} initial={preferencesData} demo={demo} onSaved={applyPreferences} loading={!demo && settingsLoading} loadError={settingsError} onRetry={retrySettings} onRestartSetup={demo?undefined:restartOnboarding}/><TelegramPanel demo={demo}/><PlanningError/></>}
   benchmarks={<InvestmentComparisonSettings demo={demo} currencies={preferencesData.currencies}/>}
   security={<AccountAccessPanel settings onSignedOut={clearLocalSession}/>}
   categories={<TransactionToolsPanel onDeleted={refreshRecords} categories={planning.data.categories} loading={planning.loading} error={planning.error} onRetry={refreshRecords} saveCategory={async (name,direction)=>{await planning.save('category',{id:crypto.randomUUID(),name,direction});}}/>}
   data={<><DataTools owner={user} currency={currency} market={market} preferences={workspacePreferences} records={planning.data.records} onSaved={refreshRecords} demo={demo}/><ImportHistory owner={user} demo={demo} revision={reload} onSaved={refreshRecords}/></>}
  />
 </div>;
}
