"use client";
import { useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder, PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { UpcomingPage } from '@/components/planning/upcoming-page';
import { ReminderPanel } from '@/components/reminder-panel';
import { PlanningError, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function UpcomingScreen() {
 const { t } = useLanguage();
 const { user, planning, workspacePreferences } = useWorkspace();
 return <>
  <div data-page="Upcoming payments" className="content">
   <PlanningError/>
   {planning.loading ? <LoadingPlaceholder label={t('Loading records…')}/> : <UpcomingPage data={planning.data} save={planning.save}/>}
  </div>
  {(workspacePreferences.error||planning.error)&&<ToolsUnavailable/>}
  {(planning.loading||workspacePreferences.loading)&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')} rows={2}/></div>}
  {!planning.loading&&!planning.error&&!workspacePreferences.loading&&!workspacePreferences.error&&<div className="content review-content" key={'reminders:'+user}><ReminderPanel data={planning.data} preferences={workspacePreferences}/></div>}
 </>;
}
