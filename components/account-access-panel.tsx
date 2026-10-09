"use client";
import { Trash2 } from 'lucide-react';
import { showNotice } from '@/lib/feedback';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import {useEffect,useId,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLanguage} from '@/components/language-provider';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {maxPasswordLength,minPasswordLength} from '@/lib/password-policy';
import {signInPath} from '@/lib/sign-in-path';
import {requestAccountAccess} from '@/lib/account-access-request';
/** Account security in Settings, and the emailed-link confirmation. Create account and Forgot password are `AccountAccessCard`. */
export function AccountAccessPanel({settings=false,tokenHash='',tokenType='email',onSignedOut}:{onSignedOut?:()=>void;settings?:boolean;tokenHash?:string;tokenType?:string}){
 const {t}=useLanguage();const router=useRouter();const [chosenMode,setMode]=useState(settings?'change_password':'verify'),[email,setEmail]=useState(''),[current,setCurrent]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[confirmation,setConfirmation]=useState('');
 const [capabilities,setCapabilities]=useState({deletion:false,phoneOnly:false}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const passwordHint=useId();
 // A phone-only account has no password to change: it can add an email and password, or delete the account.
 const mode=settings&&capabilities.phoneOnly&&chosenMode==='change_password'?'add_email':chosenMode;
 useEffect(()=>{const controller=new AbortController();fetch('/api/account-access',{signal:controller.signal}).then(r=>r.json()).then(data=>{if(!controller.signal.aborted)setCapabilities({deletion:(data as {deletion?:unknown}).deletion===true,phoneOnly:(data as {phoneOnly?:unknown}).phoneOnly===true});}).catch(()=>{});return()=>controller.abort();},[]);
 const needsPassword=['reset','change_password','add_email'].includes(mode);
 const Heading=settings?'h2':'h1';
 return <section className={settings?"panel tools-panel account-security-panel":"panel tools-panel"} data-mode={mode}>{/* On its own page (an emailed link) the panel is the page's one h1; inside Settings it is a section. */}<Heading>{t(settings?(mode==='add_email'?'Add an email and password':'Account security'):'Account access')}</Heading>{mode==='add_email'&&<p>{t('Your account was created with a phone number. Add an email and password to sign in with them too.')}</p>}
 <form className="record-form" onSubmit={async event=>{event.preventDefault();if(busy||(mode==='delete_account'&&!capabilities.deletion))return;setBusy(true);setError('');try{const result=await requestAccountAccess({action:mode,email,password,current_password:current,confirmation,token_hash:tokenHash,type:tokenType});if(result.message)showNotice(result.message);setPassword('');setRepeat('');setCurrent('');setConfirmation('');if(result.next==='reset')setMode('reset');else if(result.next==='signed_in'){router.replace('/');router.refresh();}if(['reset','change_password','delete_account'].includes(mode)){onSignedOut?.();router.replace('/');router.refresh();}}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy||(mode==='delete_account'&&!capabilities.deletion)} className="tracker-fields">
 {mode==='add_email'&&<label>{t('Email address')}<Input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>}
 {(mode==='change_password'||(mode==='delete_account'&&!capabilities.phoneOnly))&&<label>{t('Current password')}<Input type="password" autoComplete="current-password" required value={current} onChange={event=>setCurrent(event.target.value)}/></label>}
 {needsPassword&&<><label>{t('New password')}<Input type="password" autoComplete="new-password" aria-describedby={passwordHint} minLength={minPasswordLength} maxLength={maxPasswordLength} required value={password} onChange={event=>setPassword(event.target.value)}/><small id={passwordHint} className="muted">{t('Use a unique password with at least 8 characters.')}</small></label><label>{t('Confirm password')}<Input type="password" autoComplete="new-password" required value={repeat} onChange={event=>setRepeat(event.target.value)}/></label></>}
 {mode==='delete_account'&&<><p role="alert">{t('This permanently deletes your account and financial records. Download a backup first. This cannot be undone.')}</p><Link href="/api/backup">{t('Download complete backup')}</Link><label>{t('Type DELETE to confirm')}<Input value={confirmation} onChange={event=>setConfirmation(event.target.value)} required pattern="DELETE"/></label></>}
 {mode==='verify'&&<p>{t('Continue to verify this email link. Links expire and can only be used once.')}</p>}
 </fieldset>{mode==='delete_account'&&!capabilities.deletion&&<p role="status">{t('Account deletion is awaiting server setup.')}</p>}<Button variant={mode==='delete_account'?'destructive':'default'} disabled={busy||(needsPassword&&password!==repeat)||(mode==='delete_account'&&(!capabilities.deletion||confirmation!=='DELETE'||(!current&&!capabilities.phoneOnly)))}>{t(busy?'Saving…':mode==='change_password'?'Change password':mode==='verify'?'Verify email link':mode==='delete_account'?'Permanently delete account':'Continue')}</Button>
 {mode==='delete_account'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setMode('change_password');setCurrent('');setConfirmation('');setError('');}}>{t('Cancel')}</Button>}
 </form>{settings&&mode!=='delete_account'&&<div className="account-danger-zone mt-6 border-t border-destructive/30 pt-6"><h3 className="font-semibold negative">{t('Permanently delete account')}</h3><p className="my-3 text-sm text-muted-foreground">{t('This permanently deletes your account and financial records. Download a backup first. This cannot be undone.')}</p><Button type="button" variant="destructive" disabled={busy} onClick={()=>{setMode('delete_account');setCurrent('');setPassword('');setRepeat('');setConfirmation('');setError('');}}><Trash2 aria-hidden="true"/>{t('Delete account')}</Button></div>}<ErrorPopup message={error}/>{!settings&&<Link href={signInPath}>{t('Back to sign in')}</Link>}
 </section>;
}
