"use client";
import { useEffect, useRef, useState } from 'react';
import { showSaved } from '@/lib/feedback';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { requestJson } from '@/lib/api-client';
import { telegramBotUrl, type TelegramStatus } from '@/lib/telegram-link';
// The bot's web sign-in link lasts fifteen minutes (connectMinutes in telegram-connect.ts).
const pollMs=3000,pollMinutes=15;
const demoStatus:TelegramStatus={configured:false,linked:false,digest_enabled:true,actions_enabled:true,bot_username:null};
const call=(body:unknown)=>requestJson<TelegramStatus>('/api/telegram',{body,fallback:'Could not save the Telegram settings. Try again.'});
const noStatus:TelegramStatus|null=null;
/** The owner's Telegram link: its status, a Connect that opens the bot and waits until the chat signs in, and the two toggles. Shared by Settings and the Overview nudge. */
export function useTelegramLink(demo:boolean){
 // The link belongs to the signed-in person, not the open workspace.
 const remote=useOwnerResource('/api/telegram','session',!demo,0,noStatus);
 // A later answer from a save or the link watch replaces the loaded status.
 const [changed,setStatus]=useState<TelegramStatus|null>(null);
 const status=demo?demoStatus:changed??remote.data;
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [waiting,setWaiting]=useState(false);
 const waitingSince=useRef(0);
 // After the owner opens the bot, watch for the link until it lands or the bot's sign-in link would have expired.
 useEffect(()=>{
  if(!waiting)return;
  const timer=setInterval(async()=>{
   if(Date.now()-waitingSince.current>pollMinutes*60000){setWaiting(false);return;}
   try{const response=await fetch('/api/telegram',{cache:'no-store'});if(!response.ok)return;const result=await response.json() as TelegramStatus;if(result.linked){setStatus(result);setWaiting(false);showSaved();}}catch{/* keep waiting */}
  },pollMs);
  return()=>clearInterval(timer);
 },[waiting]);
 async function run(body:unknown,after:(result:TelegramStatus)=>void){
  setBusy(true);setError('');
  try{after(await call(body));}catch(reason){setError((reason as Error).message);}
  finally{setBusy(false);}
 }
 function connect(){
  // The bot is opened plainly: the chat connects itself through the bot's phone or web sign-in, never a code in the link.
  if(!status?.bot_username)return;
  window.open(telegramBotUrl(status.bot_username),'_blank','noopener');
  waitingSince.current=Date.now();setWaiting(true);
 }
 return {
  status,loadError:remote.error,error,busy,waiting,
  retry:remote.retry,
  connect,
  stopWaiting:()=>setWaiting(false),
  setToggles:(digest_enabled:boolean,actions_enabled:boolean)=>run({action:'settings',digest_enabled,actions_enabled},result=>{setStatus(result);showSaved();}),
  unlink:(after:()=>void)=>run({action:'unlink'},result=>{setStatus(result);after();showSaved();}),
 };
}
