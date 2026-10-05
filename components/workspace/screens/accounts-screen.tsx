"use client";
import { useLanguage } from '@/components/language-provider';
import { AccountsSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { AccountsPage } from '@/components/planning/accounts-page';
import { PlanningError } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { sharedWorkspace } from '@/lib/household';

export function AccountsScreen() {
 const { t } = useLanguage();
 const { user, demo, currency, market, preferencesData, planning, refreshRecords, addAccountRecord, editRecord, requestDelete, setTracking, saveHoldingAccount, assignHolding, workspacePreferences, businessList, setAccountBusiness, household, readOnly, setAccountOwner } = useWorkspace();
 return <div data-page="Accounts" className="content">
  <PlanningError/>
  {planning.loading ? <AccountsSkeleton label={t('Loading records…')} currencies={preferencesData.currencies?.length} filters={!!household.state&&sharedWorkspace(household.state)}/> : <AccountsPage owner={demo?null:user} onSaved={refreshRecords} currency={currency} data={planning.data} save={planning.save} onAdd={addAccountRecord} onEdit={editRecord} onDelete={requestDelete} demo={demo} preferences={workspacePreferences} onTrack={demo?undefined:setTracking} market={market} currencies={preferencesData.currencies} saveAccount={saveHoldingAccount} assignHolding={assignHolding} businesses={businessList} onAccountBusiness={setAccountBusiness} household={household.state} readOnly={readOnly} onAccountOwner={setAccountOwner}/>}
 </div>;
}
