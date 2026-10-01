import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { telegramConfig } from '@/lib/telegram';
import { generateLinkCode, linkExpiry, subscriptionStatus, telegramLinkUrl, type TelegramSubscription } from '@/lib/telegram-link';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('link')}),
 z.object({action:z.literal('unlink')}),
 z.object({action:z.literal('settings'),digest_enabled:z.boolean(),actions_enabled:z.boolean()}),
]);
const table='/rest/v1/telegram_subscriptions';
async function own(token:string,userId:string){
 const response=await supa(table+'?select=*&user_id=eq.'+userId,{},token);
 if(!response.ok)throw Error('Telegram settings are unavailable. Check that migration 075 is installed.');
 return (await response.json() as TelegramSubscription[])[0];
}
export async function GET(){
 try{
  const s=await session();
  if(!s)return Response.json({error:'Please sign in again.'},{status:401});
  return Response.json(subscriptionStatus(await own(s.token,s.user.id),telegramConfig()?.botUsername??null),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:(error as Error).message},{status:503});}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const s=await session();
  if(!s)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=schema.safeParse(await req.json());
  if(!parsed.success)return Response.json({error:'Check the Telegram settings.'},{status:400});
  const config=telegramConfig();
  if(!config)return Response.json({error:'Telegram notifications are awaiting server setup.'},{status:503});
  const now=new Date().toISOString();
  if(parsed.data.action==='link'){
   const code=generateLinkCode(max=>randomInt(max));
   // Not an upsert: its conflict path rewrites user_id, which the authenticated role may not update (migration 081 grants column by column).
   const fresh={link_code:code,link_code_expires_at:linkExpiry(new Date()),updated_at:now};
   const patched=await supa(table+'?user_id=eq.'+s.user.id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(fresh)},s.token);
   if(!patched.ok)throw Error('Could not start the Telegram link. Try again.');
   if(!(await patched.json() as unknown[]).length){
    const created=await supa(table,{method:'POST',body:JSON.stringify({user_id:s.user.id,...fresh})},s.token);
    if(!created.ok)throw Error('Could not start the Telegram link. Try again.');
   }
   return Response.json({url:telegramLinkUrl(config.botUsername,code)});
  }
  const patch=parsed.data.action==='unlink'?{chat_id:null,linked_at:null,link_code:null,link_code_expires_at:null,updated_at:now}:{digest_enabled:parsed.data.digest_enabled,actions_enabled:parsed.data.actions_enabled,updated_at:now};
  const response=await supa(table+'?user_id=eq.'+s.user.id,{method:'PATCH',body:JSON.stringify(patch)},s.token);
  if(!response.ok)throw Error('Could not save the Telegram settings. Try again.');
  return Response.json(subscriptionStatus(await own(s.token,s.user.id),config.botUsername));
 }catch(error){return Response.json({error:(error as Error).message},{status:503});}
}
