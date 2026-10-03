"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { showNotice } from '@/lib/feedback';
import { formatNumber } from '@/lib/format';
import { browserPhoneCountry, internationalPhone } from '@/lib/phone-countries';
import { PhoneNumberField } from '@/components/phone-number-field';
import styles from './sign-in-screen.module.css';

async function call(body: { action: 'send'; phone: string } | { action: 'verify'; phone: string; code: string }) {
  const response = await fetch('/api/auth/phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw Error(result.error ?? 'Account service is unavailable. Please try again.');
  return result;
}

/** Supabase sends at most one code a minute to a number; the resend button waits the same time. */
export const resendSeconds = 60;
/** Sign in with a phone number: the code goes to the person's Telegram chat, so no SMS is involved. */
export function PhoneSignIn({ botUsername, onBack }: { botUsername: string | null; onBack: () => void }) {
  const { t, locale } = useLanguage();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  // The browser's region (en-US → United States) picks the starting country; the person can change it.
  const [country, setCountry] = useState(() => typeof navigator === 'undefined' ? '' : browserPhoneCountry(navigator.languages ?? [navigator.language]));
  const number = country ? internationalPhone(country, phone) : '';
  useEffect(() => { if (wait <= 0) return; const timer = setTimeout(() => setWait(seconds => seconds - 1), 1000); return () => clearTimeout(timer); }, [wait]);
  async function resend() {
    if (busy || wait > 0) return;
    setBusy(true); setError(''); setCode('');
    try { const result = await call({ action: 'send', phone: number }); if (result.message) showNotice(result.message); setWait(resendSeconds); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (step === 'phone') {
        const result = await call({ action: 'send', phone: number });
        if (result.message) showNotice(result.message);
        setStep('code'); setWait(resendSeconds);
      } else {
        await call({ action: 'verify', phone: number, code });
        // A full load picks up the new session cookie.
        window.location.replace('/');
      }
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-busy={busy}>
    {step === 'phone'
      ? <><label htmlFor="signin-phone">{t('Phone number')}</label><PhoneNumberField id="signin-phone" country={country} national={phone} onChange={(next, national) => { setCountry(next); setPhone(national); }}/>
        <p className={styles.notice}>{t('We send a code to your Telegram chat. No account yet? Open our bot to create one.')}{botUsername && <> <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">{t('Open the bot')}</a></>}</p></>
      : <><label htmlFor="signin-code">{t('Code')}</label><Input id="signin-code" name="code" inputMode="numeric" pattern="[0-9]{4,10}" maxLength={10} required autoComplete="one-time-code" autoFocus value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}/>
        <p className={styles.notice}>{t('Enter the code we sent to your Telegram chat.')}</p></>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    <Button type="submit" className={styles.submit} disabled={busy}>{t(step === 'phone' ? 'Send code' : 'Verify')}<ArrowRight size={18}/></Button>
    {step === 'code' && <Button type="button" variant="outline" disabled={busy || wait > 0} onClick={() => void resend()}>{wait > 0 ? t('Send a new code in {seconds} s', { seconds: formatNumber(wait, locale, 0) }) : t('Send a new code')}</Button>}
    {step === 'code'
      ? <Button type="button" variant="ghost" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>{t('Use a different number')}</Button>
      : <Button type="button" variant="ghost" className={styles.back} onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>{t('Back')}</Button>}
  </form>;
}
