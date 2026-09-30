"use client";
import { useState } from 'react';
import { Send } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { Button } from '@/components/ui/button';
import { useTelegramLink } from '@/hooks/use-telegram-link';
/** Links the owner's Telegram chat and keeps the two message kinds switchable. Every change saves at once; nothing waits for the preferences form. */
export function TelegramPanel({demo}:{demo:boolean}){
 const {t}=useLanguage();
 const link=useTelegramLink(demo);
 const {status,loadError,error,busy,waiting}=link;
 const [confirmUnlink,setConfirmUnlink]=useState(false);
 return <section className="panel preferences-card telegram-panel"><header><h3>{t('Telegram notifications')}</h3><p className="muted">{t('Get a morning digest of upcoming payments and a message after every saved action, and add records from Telegram with buttons.')}</p></header>
  {loadError&&<InlineError message={t(loadError)}><Button type="button" variant="outline" onClick={link.retry}>{t('Retry')}</Button></InlineError>}
  {!loadError&&!status&&<LoadingPlaceholder label={t('Loading Telegram settings…')}/>}
  {status&&!status.configured&&<p className="muted">{t(demo?'Sign in to connect Telegram to your own workspace.':'Telegram notifications are awaiting server setup.')}</p>}
  {status?.configured&&!status.linked&&<div className="telegram-connect">
   <p>{t('Press Connect, then press Start in Telegram. The link works for ten minutes.')}</p>
   <div className="entry-actions"><Button type="button" disabled={busy} onClick={link.connect}><Send size={16} aria-hidden="true"/>{t(waiting?'Waiting for Telegram…':'Connect to Telegram')}</Button>{waiting&&<Button type="button" variant="outline" onClick={link.stopWaiting}>{t('Cancel')}</Button>}</div>
  </div>}
  {status?.configured&&status.linked&&<div className="telegram-linked">
   <p><span className="status-badge">{t('Connected')}</span> {status.bot_username&&<a href={`https://t.me/${status.bot_username}`} target="_blank" rel="noreferrer">@{status.bot_username}</a>}</p>
   <label className="telegram-option"><input type="checkbox" disabled={busy} checked={status.digest_enabled} onChange={event=>void link.setToggles(event.target.checked,status.actions_enabled)}/><span>{t('Morning digest of upcoming payments')}</span></label>
   <label className="telegram-option"><input type="checkbox" disabled={busy} checked={status.actions_enabled} onChange={event=>void link.setToggles(status.digest_enabled,event.target.checked)}/><span>{t('A message after every saved action')}</span></label>
   <div className="entry-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>setConfirmUnlink(true)}>{t('Disconnect')}</Button></div>
   <ConfirmDialog open={confirmUnlink} onClose={()=>setConfirmUnlink(false)} busy={busy} title={t('Disconnect Telegram?')} description={t('The bot stops sending messages and can no longer add records. Your records stay as they are.')} confirmLabel={t('Disconnect')} destructive error={error} onConfirm={()=>link.unlink(()=>setConfirmUnlink(false))}/>
  </div>}
  {!confirmUnlink&&<ErrorPopup message={error}/>}
 </section>;
}
