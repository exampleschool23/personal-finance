import { cronAuthorized } from '@/lib/cron-auth';
import { dueReminders, type ReminderSettings } from '@/lib/daily-finance';
import { depositToday } from '@/lib/deposit-interest';
import { digestMessage } from '@/lib/digest-message';
import type { Entry } from '@/lib/finance';
import { debtPaymentsFrom, type Occurrence } from '@/lib/planning';
import { ownerRows } from '@/lib/owner-rows';
import { periodTotals, shiftDay } from '@/lib/period-summary';
import { snapshotPoints } from '@/lib/portfolio-snapshots';
import { serviceDatabase } from '@/lib/service-role';
import { sendTelegramMessage, telegramConfig } from '@/lib/telegram';
import { ownerProfile, recentSnapshots } from '@/lib/telegram-owner';
export const maxDuration=60;
const defaultReminders:ReminderSettings={enabled:true,days_ahead:7,snoozed:[]};
/** Sends each linked owner their digest: a greeting, what is due, yesterday's net-worth change and the week's spending. One owner's failure never blocks the others; the response says how many were reached. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram digest is not configured.'},{status:503});
 const today=depositToday();
 let sent=0,failed=0;
 try{
  const subscriptions=await db.read<Array<{user_id:string;chat_id:number}>>('/rest/v1/telegram_subscriptions?select=user_id,chat_id&chat_id=not.is.null&digest_enabled=is.true');
  for(const {user_id,chat_id} of subscriptions){
   try{
    const [records,occurrences,profile,snapshots,reminders,activity,mortgagePayments]=await Promise.all([
     ownerRows<Entry>(db,'finance_records',user_id),
     ownerRows<Occurrence>(db,'payment_occurrences',user_id,'id,record_id,due_on,status'),
     ownerProfile(db,user_id),
     recentSnapshots(db,user_id,2),
     db.read<Array<{data:ReminderSettings}>>('/rest/v1/workspace_preferences?select=data&key=eq.reminders&user_id=eq.'+user_id),
     ownerRows<{action:string;target_id:string|null;occurred_on:string}>(db,'account_activity',user_id,'action,target_id,occurred_on'),
     ownerRows<{mortgage_id:string;paid_on:string}>(db,'mortgage_payments',user_id,'mortgage_id,paid_on'),
    ]);
    // The digest has its own switch, so the in-app reminder toggle only lends its window and snoozes.
    const settings={...defaultReminders,...reminders[0]?.data,enabled:true};
    const points=snapshotPoints(snapshots,profile.currency),latest=points[points.length-1];
    // Yesterday's figures only count while they are recent enough to be "yesterday".
    const netWorth=latest&&latest.date>=shiftDay(today,-3)?{amount:latest.net,change:points.length>1?latest.net-points[points.length-2].net:null}:undefined;
    const rates={...snapshots[snapshots.length-1]?.rates};
    const spending={current:periodTotals(records,shiftDay(today,-6),today,profile.currency,rates).spending,previous:periodTotals(records,shiftDay(today,-13),shiftDay(today,-7),profile.currency,rates).spending};
    const text=digestMessage(dueReminders({records,occurrences,categories:[],goals:[],activity:[],debtPayments:debtPaymentsFrom(activity,mortgagePayments)},settings,today),profile.language,today,{name:profile.name,currency:profile.currency,netWorth,spending});
    if(await sendTelegramMessage({chat_id,text},config))sent++;else failed++;
   }catch{failed++;}
  }
  return Response.json({sent,failed},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Telegram digest failed. Digests already sent are not repeated on retry.',sent,failed},{status:503});}
}
