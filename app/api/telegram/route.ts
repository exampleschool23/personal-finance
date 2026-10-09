import { z } from 'zod';
import { crossSite, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { telegramConfig } from '@/lib/telegram';
import { subscriptionStatus, unlinkedChat, type TelegramSubscription } from '@/lib/telegram-link';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('unlink')}),
 z.object({action:z.literal('settings'),digest_enabled:z.boolean(),actions_enabled:z.boolean()}),
]);
const table='/rest/v1/telegram_subscriptions';
const unavailable='Telegram settings are unavailable. Check that migration 075 is installed.';
const notSaved='Could not save the Telegram settings. Try again.';
/** Only this route's own messages reach the page; anything else thrown (a network or parse error) gets the fallback. */
const failure=(error:unknown,fallback:string)=>{
 const message=error instanceof Error?error.message:'';
 return Response.json({error:message===unavailable||message===notSaved?message:fallback},{status:503});
};
async function own(token:string,userId:string){
 const response=await supa(table+'?select=*&user_id=eq.'+userId,{},token);
 if(!response.ok)throw Error(unavailable);
 return (await response.json() as TelegramSubscription[])[0];
}
export async function GET(){
 try{
  const s=await session();
  if(!s)return signInAgain();
  return Response.json(subscriptionStatus(await own(s.token,s.user.id),telegramConfig()?.botUsername??null),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return failure(error,unavailable);}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return crossSite();
 try{
  const s=await session();
  if(!s)return signInAgain();
  const parsed=schema.safeParse(await readJson(req));
  if(!parsed.success)return Response.json({error:'Check the Telegram settings.'},{status:400});
  const config=telegramConfig();
  if(!config)return Response.json({error:'Telegram notifications are awaiting server setup.'},{status:503});
  const now=new Date().toISOString();
  // The owner cannot write the Telegram identity columns, so Disconnect keeps them; the bot releases a stale identity when needed.
  const patch=parsed.data.action==='unlink'?unlinkedChat(now,false):{digest_enabled:parsed.data.digest_enabled,actions_enabled:parsed.data.actions_enabled,updated_at:now};
  const response=await supa(table+'?user_id=eq.'+s.user.id,{method:'PATCH',body:JSON.stringify(patch)},s.token);
  if(!response.ok)throw Error(notSaved);
  return Response.json(subscriptionStatus(await own(s.token,s.user.id),config.botUsername));
 }catch(error){return failure(error,notSaved);}
}
