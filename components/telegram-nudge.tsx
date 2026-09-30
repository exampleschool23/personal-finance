"use client";
import { useState, useSyncExternalStore } from 'react';
import { Send } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { Button } from '@/components/ui/button';
import { useTelegramLink } from '@/hooks/use-telegram-link';
const dismissedKey='hoggish-telegram-nudge-dismissed';
function readDismissed(){try{return localStorage.getItem(dismissedKey)==='1';}catch{return false;}}
const subscribeDismissed=(notify:()=>void)=>{window.addEventListener('storage',notify);return()=>window.removeEventListener('storage',notify);};
/** Invites a signed-in owner who has not linked Telegram to do it from Overview. Hidden once linked, once dismissed on this device, and in demo mode. */
export function TelegramNudge({demo}:{demo:boolean}){
 const {t}=useLanguage();
 const link=useTelegramLink(demo);
 // The server renders nothing; the browser reads the device's choice without a state update in an effect.
 const dismissed=useSyncExternalStore(subscribeDismissed,readDismissed,()=>true);
 const [hidden,setHidden]=useState(false);
 const {status,busy,waiting,error}=link;
 if(demo||dismissed||hidden||!status?.configured||status.linked)return null;
 return <section className="panel telegram-nudge" aria-label={t('Get reminders in Telegram')}>
  <div className="telegram-nudge-text"><Send size={18} aria-hidden="true"/><div><strong>{t('Get reminders in Telegram')}</strong><p className="muted">{t('A morning digest of upcoming payments, a message after every saved action, and quick entry with buttons. Press Connect, then Start in Telegram.')}</p></div></div>
  <div className="entry-actions">
   <Button type="button" disabled={busy} onClick={link.connect}>{t(waiting?'Waiting for Telegram…':'Connect to Telegram')}</Button>
   <Button type="button" variant="ghost" onClick={()=>{try{localStorage.setItem(dismissedKey,'1');}catch{/* private mode */}setHidden(true);}}>{t('Not now')}</Button>
  </div>
  <ErrorPopup message={error}/>
 </section>;
}
