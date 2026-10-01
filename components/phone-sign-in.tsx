"use client";
import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { showNotice } from '@/lib/feedback';
import styles from './sign-in-screen.module.css';

async function call(body: { action: 'send'; phone: string } | { action: 'verify'; phone: string; code: string }) {
  const response = await fetch('/api/auth/phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw Error(result.error ?? 'Account service is unavailable. Please try again.');
  return result;
}

/** Sign in with a phone number: the code goes to the person's Telegram chat, so no SMS is involved. */
export function PhoneSignIn({ botUsername, onUseEmail }: { botUsername: string | null; onUseEmail: () => void }) {
  const { t } = useLanguage();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (step === 'phone') {
        const result = await call({ action: 'send', phone });
        if (result.message) showNotice(result.message);
        setStep('code');
      } else {
        await call({ action: 'verify', phone, code });
        // A full load picks up the new session cookie.
        window.location.replace('/');
      }
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-busy={busy}>
    {step === 'phone'
      ? <><label htmlFor="signin-phone">{t('Phone number')}</label><Input id="signin-phone" name="phone" type="tel" placeholder="+1 555 123 4567" required autoComplete="tel" inputMode="tel" autoFocus value={phone} onChange={event => setPhone(event.target.value)}/>
        <p className={styles.notice}>{t('We send a code to your Telegram chat. No account yet? Open our bot to create one.')}{botUsername && <> <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">{t('Open the bot')}</a></>}</p></>
      : <><label htmlFor="signin-code">{t('Code')}</label><Input id="signin-code" name="code" inputMode="numeric" pattern="[0-9]{4,10}" maxLength={10} required autoComplete="one-time-code" autoFocus value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}/>
        <p className={styles.notice}>{t('Enter the code we sent to your Telegram chat.')}</p></>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    <Button type="submit" className={styles.submit} disabled={busy}>{t(step === 'phone' ? 'Send code' : 'Verify')}<ArrowRight size={18}/></Button>
    <Button type="button" variant="ghost" onClick={step === 'code' ? () => { setStep('phone'); setCode(''); setError(''); } : onUseEmail}>{t(step === 'code' ? 'Use a different number' : 'Use email instead')}</Button>
  </form>;
}
