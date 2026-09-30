"use client";
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { Button } from '@/components/ui/button';
import { showSaved } from '@/lib/feedback';
import type { TelegramStatus } from '@/lib/telegram-link';
const pollMs=3000,pollMinutes=10;
async function call(body:unknown){
 const response=await fetch('/api/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json() as {error?:string};
 if(!response.ok)throw Error(result.error??'Could not save the Telegram settings. Try again.');
 return result;
}
/** Links the owner's Telegram chat and keeps the two message kinds switchable. Every change saves at once; nothing waits for the preferences form. */
export function TelegramPanel({demo}:{demo:boolean}){
 const {t}=useLanguage();
 const [status,setStatus]=useState<TelegramStatus|null>(demo?{configured:false,linked:false,digest_enabled:true,actions_enabled:true,bot_username:null}:null);
 const [loadError,setLoadError]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [waiting,setWaiting]=useState(false);
 const [confirmUnlink,setConfirmUnlink]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const waitingSince=useRef(0);
 useEffect(()=>{
  if(demo)return;
  const controller=new AbortController();
  fetch('/api/telegram',{signal:controller.signal,cache:'no-store'}).then(async response=>{const result=await response.json() as TelegramStatus&{error?:string};if(!response.ok)throw Error(result.error);setStatus(result);setLoadError('');}).catch(reason=>{if(!controller.signal.aborted)setLoadError((reason as Error).message);});
  return()=>controller.abort();
 },[demo,attempt]);
 // After the owner opens the bot, watch for the link until it lands or the code expires.
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
  // The tab opens before the request so browsers treat it as a user action.
  const tab=window.open('','_blank');
  void run({action:'link'},result=>{const {url}=result as unknown as {url:string};if(tab)tab.location.href=url;else window.open(url,'_blank');waitingSince.current=Date.now();setWaiting(true);}).then(()=>{if(error&&tab)tab.close();});
 }
 return <section className="panel preferences-card telegram-panel"><header><h3>{t('Telegram notifications')}</h3><p className="muted">{t('Get a morning digest of upcoming payments and a message after every saved action, and add records from Telegram with buttons.')}</p></header>
  {loadError&&<InlineError message={t(loadError)}><Button type="button" variant="outline" onClick={()=>{setLoadError('');setAttempt(count=>count+1);}}>{t('Retry')}</Button></InlineError>}
  {!loadError&&!status&&<LoadingPlaceholder label={t('Loading Telegram settings…')}/>}
  {status&&!status.configured&&<p className="muted">{t(demo?'Sign in to connect Telegram to your own workspace.':'Telegram notifications are awaiting server setup.')}</p>}
  {status?.configured&&!status.linked&&<div className="telegram-connect">
   <p>{t('Press Connect, then press Start in Telegram. The link works for ten minutes.')}</p>
   <div className="entry-actions"><Button type="button" disabled={busy} onClick={connect}><Send size={16} aria-hidden="true"/>{t(waiting?'Waiting for Telegram…':'Connect to Telegram')}</Button>{waiting&&<Button type="button" variant="outline" onClick={()=>setWaiting(false)}>{t('Cancel')}</Button>}</div>
  </div>}
  {status?.configured&&status.linked&&<div className="telegram-linked">
   <p><span className="status-badge">{t('Connected')}</span> {status.bot_username&&<a href={`https://t.me/${status.bot_username}`} target="_blank" rel="noreferrer">@{status.bot_username}</a>}</p>
   <label className="telegram-option"><input type="checkbox" disabled={busy} checked={status.digest_enabled} onChange={event=>void run({action:'settings',digest_enabled:event.target.checked,actions_enabled:status.actions_enabled},result=>{setStatus(result);showSaved();})}/><span>{t('Morning digest of upcoming payments')}</span></label>
   <label className="telegram-option"><input type="checkbox" disabled={busy} checked={status.actions_enabled} onChange={event=>void run({action:'settings',digest_enabled:status.digest_enabled,actions_enabled:event.target.checked},result=>{setStatus(result);showSaved();})}/><span>{t('A message after every saved action')}</span></label>
   <div className="entry-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>setConfirmUnlink(true)}>{t('Disconnect')}</Button></div>
   <ConfirmDialog open={confirmUnlink} onClose={()=>setConfirmUnlink(false)} busy={busy} title={t('Disconnect Telegram?')} description={t('The bot stops sending messages and can no longer add records. Your records stay as they are.')} confirmLabel={t('Disconnect')} destructive error={error} onConfirm={()=>run({action:'unlink'},result=>{setStatus(result);setConfirmUnlink(false);showSaved();})}/>
  </div>}
  {!confirmUnlink&&<ErrorPopup message={error}/>}
 </section>;
}
