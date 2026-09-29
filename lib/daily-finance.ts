import {upcomingPayments,type PlanningData} from './planning';
import type {WorkspacePreference} from './workspace-preferences';
export type ReminderSettings=Extract<WorkspacePreference,{key:'reminders'}>['data'];
export function dueReminders(data:PlanningData,settings:ReminderSettings,today:string){
 if(!settings.enabled)return [];
 const through=new Date(Date.parse(today+'T00:00:00Z')+settings.days_ahead*86400000).toISOString().slice(0,10);
 return upcomingPayments(data.records,data.occurrences,today,through).filter(item=>!settings.snoozed.some(s=>s.key===item.key&&s.until>today));
}
