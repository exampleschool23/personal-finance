"use client";

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { legalPaths } from '@/lib/legal';
import { PhoneSignIn } from '@/components/phone-sign-in';
import { AuthShowcase } from '@/components/auth-showcase';
import { usePhoneSignIn } from '@/hooks/use-phone-sign-in';
import styles from './sign-in-screen.module.css';

/**
 * The public account pages share one frame: the form side (brand, a single card, the legal footer) and, on wide
 * screens, a showcase panel in the brand colour. On phones the brand sits on a band of that colour above the card.
 */
export function AuthPage({ brand, preferences, title, subtitle, children }: { brand: ReactNode; preferences?: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useLanguage();
  return <main className={styles.page}>
    <div className={styles.formSide}>
      <header className={styles.header}>{brand}{preferences && <div className={styles.preferences}>{preferences}</div>}</header>
      <section className={styles.card} aria-labelledby="auth-heading">
        <div className={styles.cardHeading}><h1 id="auth-heading">{t(title)}</h1>{subtitle && <p>{t(subtitle)}</p>}</div>
        {children}
      </section>
      <footer className={styles.footer}><nav className={styles.legal} aria-label={t('Legal')}><Link href={legalPaths.terms}>{t('Terms of use')}</Link><Link href={legalPaths.privacy}>{t('Privacy policy')}</Link></nav><span><LockKeyhole size={13}/>{t('Your records are private to your account.')}</span></footer>
    </div>
    <AuthShowcase/>
  </main>;
}

/**
 * The email form comes first; Google and phone follow a divider as a row of icon buttons, then `footer` (the way to
 * sign in or sign up). Choosing phone leaves only the phone form and its Back button. Phone appears only when the
 * server has it set up.
 */
export function ProviderChoices({ disabled, children, footer }: { disabled: boolean; children: ReactNode; footer?: ReactNode }) {
  const { t } = useLanguage();
  const phone = usePhoneSignIn();
  const [byPhone, setByPhone] = useState(false);
  if (byPhone) return <PhoneSignIn botUsername={phone.botUsername} onBack={() => setByPhone(false)}/>;
  return <>
    {children}
    <div className={styles.divider}>{t('or continue with')}</div>
    <div className={styles.providers}>
    <form action="/api/auth/google" method="post"><Button type="submit" variant="outline" className={styles.provider} disabled={disabled} aria-label={t('Continue with Google')} title={t('Continue with Google')}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.96Z"/></svg></Button></form>
    {phone.enabled && <Button type="button" variant="outline" className={styles.provider} aria-label={t('Continue with phone')} title={t('Continue with phone')} onClick={() => setByPhone(true)}><Smartphone size={22} aria-hidden="true"/></Button>}
    </div>
    {footer}
  </>;
}

/** The invitation to try sample data, below a hairline. */
export function SampleInvite({ busy, onDemo }: { busy: boolean; onDemo: () => void }) {
  const { t } = useLanguage();
  const label = <>{t('Explore sample workspace')}<ArrowRight size={16}/></>;
  return <div className={styles.demo}><p>{t('Take a look around first.')}</p>
    <Button type="button" variant="outline" onClick={onDemo} disabled={busy}>{label}</Button>
    <small>{t('No account needed. Just sample data.')}</small></div>;
}
