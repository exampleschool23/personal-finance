import { accountOrigin } from '@/lib/account-access';
import { cronAuthorized } from '@/lib/cron-auth';
import type { Entry } from '@/lib/finance';
import { translate } from '@/lib/i18n';
import { ownerRows } from '@/lib/owner-rows';
import { categoryKey, periodTotals, shiftDay, topCategory } from '@/lib/period-summary';
import { recapMessage } from '@/lib/recap-message';
import { serviceDatabase } from '@/lib/service-role';
import { sendTelegramMessage, telegramConfig } from '@/lib/telegram';
import { claimDay, ownerProfile, recentSnapshots, releaseDay } from '@/lib/telegram-owner';
import { currentInstant, recapDue } from '@/lib/timezones';
export const maxDuration=60;
/** Runs every hour and sends each linked owner whose local Sunday evening it is the recap of the seven days ending that Sunday.
 * The Sunday is claimed before sending, so nobody gets two recaps a week. One owner's failure never blocks the others. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram recap is not configured.'},{status:503});
 const now=currentInstant(),shareOrigin=accountOrigin();
 let sent=0,failed=0;
 try{
  const subscriptions=await db.read<Array<{user_id:string;chat_id:number;recap_sent_on?:string|null}>>('/rest/v1/telegram_subscriptions?select=user_id,chat_id,recap_sent_on&chat_id=not.is.null&digest_enabled=is.true');
  for(const {user_id,chat_id,recap_sent_on} of subscriptions){
   try{
    const profile=await ownerProfile(db,user_id);
    const to=recapDue(now,profile.timezone,recap_sent_on);
    if(!to||!await claimDay(db,user_id,'recap_sent_on',to))continue;
    const from=shiftDay(to,-6);
    const [records,categories,snapshots,goalEvents]=await Promise.all([
     ownerRows<Entry>(db,'finance_records',user_id),
     db.read<Array<{id:string;name:string}>>('/rest/v1/custom_categories?select=id,name&user_id=eq.'+user_id),
     recentSnapshots(db,user_id,1),
     db.read<Array<{goal_id:string}>>(`/rest/v1/goal_events?select=goal_id&user_id=eq.${user_id}&event_type=eq.contribution&delta=gt.0&occurred_on=gte.${from}&occurred_on=lte.${to}`),
    ]);
    const totals=periodTotals(records,from,to,profile.currency,{...snapshots[0]?.rates}),best=topCategory(totals.byCategory);
    // Built-in categories are translated; an added category shows the owner's own name.
    const label=best&&(best.key.startsWith('c:')?categories.find(category=>category.id===best.key.slice(2))?.name:translate(profile.language,best.key.slice(2)));
    const message=recapMessage({name:profile.name,currency:profile.currency,from,to,income:totals.income,spending:totals.spending,top:best&&label?{label,amount:best.amount}:null,goalsMoved:new Set(goalEvents.map(event=>event.goal_id)).size,shareOrigin},profile.language);
    if(await sendTelegramMessage({chat_id,...message},config))sent++;else{failed++;await releaseDay(db,user_id,'recap_sent_on',to,recap_sent_on??null);}
   }catch{failed++;}
  }
  return Response.json({sent,failed},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Telegram recap failed. Recaps already sent are not repeated on retry.',sent,failed},{status:503});}
}
