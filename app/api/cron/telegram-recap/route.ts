import { accountOrigin } from '@/lib/account-access';
import { cronAuthorized } from '@/lib/cron-auth';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { translate } from '@/lib/i18n';
import { ownerRows } from '@/lib/owner-rows';
import { periodTotals, shiftDay, topCategory } from '@/lib/period-summary';
import { recapMessage } from '@/lib/recap-message';
import { serviceDatabase } from '@/lib/service-role';
import { sendTelegramMessage, telegramConfig } from '@/lib/telegram';
import { deliverToSubscribers, ownerProfile, recentSnapshots } from '@/lib/telegram-owner';
export const maxDuration=60;
/** Sends each linked owner the recap of the seven days ending today (scheduled for Sunday evening). One owner's failure never blocks the others. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram recap is not configured.'},{status:503});
 const to=depositToday(),from=shiftDay(to,-6),shareOrigin=accountOrigin();
 try{
  const {sent,failed}=await deliverToSubscribers(db,async({user_id,chat_id})=>{
    const [records,categories,profile,snapshots,goalEvents]=await Promise.all([
     ownerRows<Entry>(db,'finance_records',user_id),
     db.read<Array<{id:string;name:string}>>('/rest/v1/custom_categories?select=id,name&user_id=eq.'+user_id),
     ownerProfile(db,user_id),
     recentSnapshots(db,user_id,1),
     db.read<Array<{goal_id:string}>>(`/rest/v1/goal_events?select=goal_id&user_id=eq.${user_id}&event_type=eq.contribution&delta=gt.0&occurred_on=gte.${from}&occurred_on=lte.${to}`),
    ]);
    const totals=periodTotals(records,from,to,profile.currency,{...snapshots[0]?.rates}),best=topCategory(totals.byCategory);
    // Built-in categories are translated; an added category shows the owner's own name.
    const label=best&&(best.key.startsWith('c:')?categories.find(category=>category.id===best.key.slice(2))?.name:translate(profile.language,best.key.slice(2)));
    const message=recapMessage({name:profile.name,currency:profile.currency,from,to,income:totals.income,spending:totals.spending,top:best&&label?{label,amount:best.amount}:null,goalsMoved:new Set(goalEvents.map(event=>event.goal_id)).size,shareOrigin},profile.language);
    return sendTelegramMessage({chat_id,...message},config);
  });
  return Response.json({sent,failed},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Telegram recap failed. Recaps already sent are not repeated on retry.',sent:0,failed:0},{status:503});}
}
