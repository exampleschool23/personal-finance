"use client";
import { useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { AccountsPage } from '@/components/planning/accounts-page';
import { PlanningError } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function AccountsScreen() {
 const { t } = useLanguage();
 const { user, demo, currency, market, preferencesData, planning, refreshRecords, addAccountRecord, editRecord, requestDelete, setTracking, saveHoldingAccount, assignHolding, workspacePreferences } = useWorkspace();
 return <div data-page="Accounts" className="content">
  <PlanningError/>
  {planning.loading ? <LoadingPlaceholder label={t('Loading records…')}/> : <AccountsPage owner={demo?null:user} onSaved={refreshRecords} currency={currency} data={planning.data} save={planning.save} onAdd={addAccountRecord} onEdit={editRecord} onDelete={requestDelete} demo={demo} preferences={workspacePreferences} onTrack={demo?undefined:setTracking} market={market} currencies={preferencesData.currencies} saveAccount={saveHoldingAccount} assignHolding={assignHolding}/>}
 </div>;
}
