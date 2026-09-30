import { timingSafeEqual } from 'node:crypto';
import { dueReminders, type ReminderSettings } from '@/lib/daily-finance';
import { depositToday } from '@/lib/deposit-interest';
import { digestMessage } from '@/lib/digest-message';
import type { Entry } from '@/lib/finance';
import { isLanguage } from '@/lib/i18n';
import type { Occurrence } from '@/lib/planning';
import { serviceDatabase, type ServiceDatabase } from '@/lib/service-role';
import { sendTelegramMessage, telegramConfig } from '@/lib/telegram';
export const maxDuration=60;
const defaultReminders:ReminderSettings={enabled:true,days_ahead:7,snoozed:[]};
async function ownerRows<T>(db:ServiceDatabase,table:string,owner:string,select='*'){
 const rows:T[]=[];
 for(let offset=0;;offset+=500){const batch=await db.read<T[]>(`/rest/v1/${table}?select=${select}&user_id=eq.${owner}&order=id.asc&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)return rows;}
}
/** Sends each linked owner their digest. One owner's failure never blocks the others; the response says how many were reached. */
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET,authorization=req.headers.get('authorization')??'';
 const expected=secret?'Bearer '+secret:'';
 if(!secret||Buffer.byteLength(authorization)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(authorization),Buffer.from(expected)))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram digest is not configured.'},{status:503});
 const today=depositToday();
 let sent=0,empty=0,failed=0;
 try{
  const subscriptions=await db.read<Array<{user_id:string;chat_id:number}>>('/rest/v1/telegram_subscriptions?select=user_id,chat_id&chat_id=not.is.null&digest_enabled=is.true');
  for(const {user_id,chat_id} of subscriptions){
   try{
    const [records,occurrences,preferences,reminders]=await Promise.all([
     ownerRows<Entry>(db,'finance_records',user_id),
     ownerRows<Occurrence>(db,'payment_occurrences',user_id,'id,record_id,due_on,status'),
     db.read<Array<{language?:string}>>('/rest/v1/user_preferences?select=language&user_id=eq.'+user_id),
     db.read<Array<{data:ReminderSettings}>>('/rest/v1/workspace_preferences?select=data&key=eq.reminders&user_id=eq.'+user_id),
    ]);
    // The digest has its own switch, so the in-app reminder toggle only lends its window and snoozes.
    const settings={...defaultReminders,...reminders[0]?.data,enabled:true};
    const language=isLanguage(preferences[0]?.language)?preferences[0].language:'en';
    const text=digestMessage(dueReminders({records,occurrences,categories:[],goals:[],activity:[]},settings,today),language,today);
    if(!text){empty++;continue;}
    if(await sendTelegramMessage({chat_id,text},config))sent++;else failed++;
   }catch{failed++;}
  }
  return Response.json({sent,empty,failed},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Telegram digest failed. Digests already sent are not repeated on retry.',sent,empty,failed},{status:503});}
}
