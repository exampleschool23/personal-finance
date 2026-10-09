"use client";
import { useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { GoalsPage } from '@/components/planning/goals-page';
import { PlanningError } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function GoalsScreen() {
 const { t } = useLanguage();
 const { user, demo, currency, market, reload, preferencesData, planning, workspacePreferences, snapshots, refreshRecords } = useWorkspace();
 return <div data-page="Savings goals" className="content">
  <PlanningError/>
  {planning.loading ? <LoadingPlaceholder label={t('Loading records…')}/> : <GoalsPage currency={currency} preferences={workspacePreferences} owner={user} demo={demo} revision={reload} onSaved={refreshRecords} data={planning.data} save={planning.save} currencies={preferencesData.currencies} market={market} snapshots={snapshots.snapshots} historyError={snapshots.error}/>}
 </div>;
}
