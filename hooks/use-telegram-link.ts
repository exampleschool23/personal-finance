"use client";
import { useEffect, useRef, useState } from 'react';
import { showSaved } from '@/lib/feedback';
import { telegramBotUrl, type TelegramStatus } from '@/lib/telegram-link';
// The bot's web sign-in link lasts fifteen minutes (connectMinutes in telegram-connect.ts).
const pollMs=3000,pollMinutes=15;
export const demoStatus:TelegramStatus={configured:false,linked:false,digest_enabled:true,actions_enabled:true,bot_username:null};
async function call(body:unknown){
 const response=await fetch('/api/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json() as {error?:string};
 if(!response.ok)throw Error(result.error??'Could not save the Telegram settings. Try again.');
 return result;
}
/** The owner's Telegram link: its status, a Connect that opens the bot and waits until the chat signs in, and the two toggles. Shared by Settings and the Overview nudge. */
export function useTelegramLink(demo:boolean){
 const [status,setStatus]=useState<TelegramStatus|null>(demo?demoStatus:null);
 const [loadError,setLoadError]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [waiting,setWaiting]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const waitingSince=useRef(0);
 useEffect(()=>{
  if(demo)return;
  const controller=new AbortController();
  fetch('/api/telegram',{signal:controller.signal,cache:'no-store'}).then(async response=>{const result=await response.json() as TelegramStatus&{error?:string};if(!response.ok)throw Error(result.error);setStatus(result);setLoadError('');}).catch(reason=>{if(!controller.signal.aborted)setLoadError((reason as Error).message);});
  return()=>controller.abort();
 },[demo,attempt]);
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
  try{after(await call(body) as TelegramStatus);}catch(reason){setError((reason as Error).message);}
  finally{setBusy(false);}
 }
 function connect(){
  // The bot is opened plainly: the chat connects itself through the bot's phone or web sign-in, never a code in the link.
  if(!status?.bot_username)return;
  window.open(telegramBotUrl(status.bot_username),'_blank','noopener');
  waitingSince.current=Date.now();setWaiting(true);
 }
 return {
  status,loadError,error,busy,waiting,
  retry:()=>{setLoadError('');setAttempt(count=>count+1);},
  connect,
  stopWaiting:()=>setWaiting(false),
  setToggles:(digest_enabled:boolean,actions_enabled:boolean)=>run({action:'settings',digest_enabled,actions_enabled},result=>{setStatus(result);showSaved();}),
  unlink:(after:()=>void)=>run({action:'unlink'},result=>{setStatus(result);after();showSaved();}),
 };
}
