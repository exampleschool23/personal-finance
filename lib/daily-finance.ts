import {shiftDay} from './calendar-days';
import {upcomingPayments,type PlanningData} from './planning';
import type {WorkspacePreference} from './workspace-preferences';
export type ReminderSettings=Extract<WorkspacePreference,{key:'reminders'}>['data'];
export function dueReminders(data:PlanningData,settings:ReminderSettings,today:string){
 if(!settings.enabled)return [];
 const through=shiftDay(today,settings.days_ahead);
 return upcomingPayments(data.records,data.occurrences,today,through,data.debtPayments).filter(item=>!settings.snoozed.some(s=>s.key===item.key&&s.until>today));
}
