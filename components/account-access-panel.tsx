"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLanguage} from '@/components/language-provider';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
export function AccountAccessPanel({settings=false,tokenHash='',tokenType='email',onSignedOut}:{onSignedOut?:()=>void;settings?:boolean;tokenHash?:string;tokenType?:string}){
 const {t}=useLanguage();const router=useRouter();const [mode,setMode]=useState(settings?'change_password':tokenHash?'verify':'recover'),[email,setEmail]=useState(''),[current,setCurrent]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[confirmation,setConfirmation]=useState('');
 const [capabilities,setCapabilities]=useState({signup:false,deletion:false}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/api/account-access',{signal:controller.signal}).then(r=>r.json()).then(data=>{if(!controller.signal.aborted)setCapabilities({signup:(data as {signup?:unknown}).signup===true,deletion:(data as {deletion?:unknown}).deletion===true});}).catch(()=>{});return()=>controller.abort();},[]);
 const actions=settings?['change_password',...(capabilities.deletion?['delete_account']:[])]:tokenHash?[]:['recover',...(capabilities.signup?['signup']:[])];
 const needsPassword=['signup','reset','change_password'].includes(mode);
 return <section className={settings?"panel tools-panel account-security-panel":"panel tools-panel"} data-mode={mode}><h2>{t(settings?'Account security':'Account access')}</h2><p>{t('Use a unique password with at least 12 characters.')}</p>
 {actions.length>1&&<div className="entry-actions">{actions.map(action=><Button type="button" key={action} variant={mode===action?'default':'outline'} onClick={()=>{setMode(action);setError('');setMessage('');}}>{t(({change_password:'Change password',delete_account:'Delete account',recover:'Forgot password',signup:'Create account'} as Record<string,string>)[action])}</Button>)}</div>}
 <form className="record-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');setMessage('');try{const response=await fetch('/api/account-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:mode,email,password,current_password:current,confirmation,token_hash:tokenHash,type:tokenType})});const result=await response.json() as {error?:string;message?:string;next?:string};if(!response.ok)throw Error(result.error);setMessage(result.message??'');setPassword('');setRepeat('');setCurrent('');if(result.next==='reset')setMode('reset');else if(result.next==='signed_in'){router.replace('/');router.refresh();}if(['reset','change_password','delete_account'].includes(mode)){onSignedOut?.();router.replace('/');router.refresh();}}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="tracker-fields">
 {['signup','recover'].includes(mode)&&<label>{t('Email address')}<Input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>}
 {['change_password','delete_account'].includes(mode)&&<label>{t('Current password')}<Input type="password" autoComplete="current-password" required value={current} onChange={event=>setCurrent(event.target.value)}/></label>}
 {needsPassword&&<><label>{t('New password')}<Input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/></label><label>{t('Confirm password')}<Input type="password" autoComplete="new-password" required value={repeat} onChange={event=>setRepeat(event.target.value)}/></label></>}
 {mode==='delete_account'&&<><p role="alert">{t('This permanently deletes your account and financial records. Download a backup first. This cannot be undone.')}</p><Link href="/api/backup">{t('Download complete backup')}</Link><label>{t('Type DELETE to confirm')}<Input value={confirmation} onChange={event=>setConfirmation(event.target.value)} required pattern="DELETE"/></label></>}
 {mode==='verify'&&<p>{t('Continue to verify this email link. Links expire and can only be used once.')}</p>}
 </fieldset><Button disabled={busy||(needsPassword&&password!==repeat)||(mode==='delete_account'&&confirmation!=='DELETE')}>{t(busy?'Saving…':mode==='change_password'?'Change password':mode==='verify'?'Verify email link':mode==='delete_account'?'Permanently delete account':'Continue')}</Button>
 </form>{error&&<p className="error" role="alert">{t(error)}</p>}{message&&<p role="status">{t(message)}</p>}{!settings&&<Link href="/">{t('Back to sign in')}</Link>}
 </section>;
}
