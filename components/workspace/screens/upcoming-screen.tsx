"use client";
import { useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder, PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { SubscriptionsPanel } from '@/components/planning/subscriptions-panel';
import { UpcomingPage } from '@/components/planning/upcoming-page';
import { ReminderPanel } from '@/components/reminder-panel';
import { PlanningError, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useSubscriptions } from '@/hooks/use-subscriptions';

export function UpcomingScreen() {
 const { t } = useLanguage();
 const { user, demo, reload, planning, workspacePreferences, currency, market, reviewRecurring } = useWorkspace();
 const subscriptions = useSubscriptions(user, demo, reload, planning.data.records);
 return <>
  <div data-page="Upcoming payments" className="content">
   <PlanningError/>
   {planning.loading ? <LoadingPlaceholder label={t('Loading records…')}/> : <UpcomingPage data={planning.data} save={planning.save} currency={currency} rates={market?.rates ?? market?.fx?.rate}/>}
   {!planning.loading && <SubscriptionsPanel records={subscriptions.records} decisions={subscriptions.decisions} loading={subscriptions.loading} error={subscriptions.error} onRetry={subscriptions.retry} decide={subscriptions.decide} restore={subscriptions.restore} onTrack={reviewRecurring}/>}
  </div>
  {(workspacePreferences.error||planning.error)&&<ToolsUnavailable/>}
  {(planning.loading||workspacePreferences.loading)&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')} rows={2}/></div>}
  {!planning.loading&&!planning.error&&!workspacePreferences.loading&&!workspacePreferences.error&&<div className="content review-content" key={'reminders:'+user}><ReminderPanel data={planning.data} preferences={workspacePreferences}/></div>}
 </>;
}
