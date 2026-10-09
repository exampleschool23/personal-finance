import { cronAuthorized } from '@/lib/cron-auth';
import { reportError } from '@/lib/monitoring';
import { dueReminders, type ReminderSettings } from '@/lib/daily-finance';
import { depositToday } from '@/lib/deposit-interest';
import { digestMessage } from '@/lib/digest-message';
import { debtPaymentsFrom, type Occurrence } from '@/lib/planning';
import { ownerRows } from '@/lib/owner-rows';
import { periodTotals, shiftDay } from '@/lib/period-summary';
import { snapshotPoints } from '@/lib/portfolio-snapshots';
import { serviceDatabase } from '@/lib/service-role';
import { deliverTelegramMessage, telegramConfig } from '@/lib/telegram';
import { deliverToSubscribers, ownerDebtPayments, ownerProfile, ownerRecordsSince, ownerSpendingExtras, recentSnapshots } from '@/lib/telegram-owner';
export const maxDuration=60;
const defaultReminders:ReminderSettings={enabled:true,days_ahead:7,snoozed:[]};
/** Sends each linked owner their digest: a greeting, what is due, yesterday's net-worth change and the week's spending. One owner's failure never blocks the others; the response says how many were reached. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram digest is not configured.'},{status:503});
 const today=depositToday();
 try{
  // One digest per owner and day: a retried or overlapping run skips the owners already sent today.
  const {sent,failed,blocked}=await deliverToSubscribers(db,{kind:'digest',period:today},async({user_id,chat_id})=>{
    const [records,occurrences,profile,snapshots,reminders,[activity,mortgagePayments]]=await Promise.all([
     // Schedules and holdings in full; actual cash flow only for the two weeks of spending compared.
     ownerRecordsSince(db,user_id,shiftDay(today,-13)),
     ownerRows<Occurrence>(db,'payment_occurrences',user_id,'id,record_id,due_on,status'),
     ownerProfile(db,user_id),
     recentSnapshots(db,user_id,2),
     db.read<Array<{data:ReminderSettings}>>('/rest/v1/workspace_preferences?select=data&key=eq.reminders&user_id=eq.'+user_id),
     // Only repayments mark a loan installment as paid.
     ownerDebtPayments(db,user_id),
    ]);
    // The digest has its own switch, so the in-app reminder toggle only lends its window and snoozes.
    const settings={...defaultReminders,...reminders[0]?.data,enabled:true};
    const points=snapshotPoints(snapshots,profile.currency),latest=points[points.length-1];
    // Yesterday's figures only count while they are recent enough to be "yesterday".
    const netWorth=latest&&latest.date>=shiftDay(today,-3)?{amount:latest.net,change:points.length>1?latest.net-points[points.length-2].net:null}:undefined;
    const rates={...snapshots[snapshots.length-1]?.rates};
    // Splits and Tracker expenses count as they do in the app.
    const extras=await ownerSpendingExtras(db,user_id,shiftDay(today,-13),records);
    const current=periodTotals({records,...extras},shiftDay(today,-6),today,profile.currency,rates),previous=periodTotals({records,...extras},shiftDay(today,-13),shiftDay(today,-7),profile.currency,rates);
    const spending={current:current.spending,previous:previous.spending,missing:current.missing+previous.missing>0};
    const text=digestMessage(dueReminders({records,occurrences,categories:[],goals:[],activity:[],debtPayments:debtPaymentsFrom(activity,mortgagePayments)},settings,today),profile.language,today,{name:profile.name,currency:profile.currency,rates,netWorth,spending});
    return deliverTelegramMessage({chat_id,text},config);
  });
  if(failed)await reportError('cron:telegram-digest','Some Telegram digests were not delivered.',{route:'/api/cron/telegram-digest',status:503,counts:{sent,failed,blocked}},{alert:true});
  return Response.json({sent,failed,blocked},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(error){await reportError('cron:telegram-digest',error,{route:'/api/cron/telegram-digest',status:503},{alert:true});return Response.json({error:'Telegram digest failed. Digests already sent are not repeated on retry.',sent:0,failed:0,blocked:0},{status:503});}
}
