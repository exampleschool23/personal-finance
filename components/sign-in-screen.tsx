"use client";

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChartNoAxesCombined, Eye, EyeOff, LockKeyhole, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import styles from './sign-in-screen.module.css';

type Props = {
  brand: ReactNode;
  preferences: ReactNode;
  busy: boolean;
  configured: boolean;
  error: string;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onDemo: () => void;
};

export function SignInScreen({ brand, preferences, busy, configured, error, onLogin, onDemo }: Props) {
  const { t, locale } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  return <main className={styles.page}>
    <header className={styles.header}>{brand}<div className={styles.preferences}>{preferences}</div></header>
    <div className={styles.layout}>
      <section className={styles.story} aria-labelledby="welcome-heading">
        <p className={styles.eyebrow}><span />{t('YOUR MONEY. THE WHOLE PICTURE.')}</p>
        <h1 id="welcome-heading">{t('A clear view.')}<br /><span>{t('A stronger future.')}</span></h1>
        <p className={styles.description}>{t('From your next payday to your long-term investments.')} {t('Keep your financial life in one place.')}</p>
        <div className={styles.preview}>
          <div className={styles.previewHeader}><span><ChartNoAxesCombined size={17} />{t('Your financial overview')}</span><span className={styles.sample}>{t('Sample data')}</span></div>
          <div className={styles.balance}><p>{t('Net worth today')}</p><strong>{formatMoney(24800, 'USD', locale)}</strong></div>
          <svg className={styles.chart} viewBox="0 0 480 112" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="signin-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c4f36b" stopOpacity=".22"/><stop offset="100%" stopColor="#c4f36b" stopOpacity="0"/></linearGradient></defs><path d="M0 94 L40 83 L80 89 L120 62 L160 72 L200 45 L240 54 L280 29 L320 38 L360 18 L400 25 L440 9 L480 3 V112 H0Z" fill="url(#signin-chart-fill)"/><path d="M0 94 L40 83 L80 89 L120 62 L160 72 L200 45 L240 54 L280 29 L320 38 L360 18 L400 25 L440 9 L480 3" fill="none" stroke="#c4f36b" strokeWidth="3" strokeLinejoin="round"/></svg>
          <div className={styles.previewStats}><div><span>{t('Income')}</span><strong>{formatMoney(4200, 'USD', locale)}</strong></div><div><span>{t('Expenses')}</span><strong>{formatMoney(1850, 'USD', locale)}</strong></div></div>
        </div>
        <div className={styles.features}><span><Wallet size={17}/>{t('Multiple currencies')}</span><span><ChartNoAxesCombined size={17}/>{t('Assets & investments')}</span></div>
      </section>
      <section className={styles.card} aria-labelledby="signin-heading">
        <div className={styles.cardHeading}><span className={styles.lock}><LockKeyhole size={20}/></span><h2 id="signin-heading">{t('Welcome back.')}</h2><p>{t('Sign in to your financial overview.')}</p></div>
        <form action="/api/auth/google" method="post"><Button type="submit" variant="outline" className={styles.google} disabled={busy || !configured}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.96Z"/></svg>{t('Continue with Google')}</Button></form>
        <div className={styles.divider}>{t('or sign in with email')}</div>
        <form className={styles.form} onSubmit={onLogin} aria-busy={busy}>
          <label htmlFor="signin-email">{t('Email address')}</label><Input id="signin-email" name="email" type="email" placeholder="you@example.com" required autoComplete="username" autoCapitalize="none" spellCheck={false}/>
          <div className={styles.passwordLabel}><label htmlFor="signin-password">{t('Password')}</label><Link href="/auth/access">{t('Forgot password?')}</Link></div>
          <div className={styles.password}><Input id="signin-password" name="password" type={showPassword ? 'text' : 'password'} placeholder={t('Enter your password')} required autoComplete="current-password"/><Button type="button" variant="ghost" size="icon" aria-label={t(showPassword ? 'Hide password' : 'Show password')} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</Button></div>
          {error && <p className={styles.error} role="alert">{t(error)}</p>}
          {!configured && <p className={styles.notice} role="status">{t('Account connection is awaiting setup. You can explore the sample workspace below.')}</p>}
          <Button type="submit" className={styles.submit} disabled={busy || !configured}>{t(busy ? 'Signing in…' : 'Sign in')}<ArrowRight size={18}/></Button>
        </form>
        <p className={styles.register}>{t('New to Hoggish?')} <Link href="/auth/access">{t('Create an account')}<ArrowUpRight size={14}/></Link></p>
        <div className={styles.demo}><p>{t('Take a look around first.')}</p><Button type="button" variant="outline" onClick={onDemo} disabled={busy}>{t('Explore sample workspace')}<ArrowRight size={16}/></Button><small>{t('No account needed. Just sample data.')}</small></div>
      </section>
    </div>
    <footer className={styles.footer}><span>{t('Personal finance, thoughtfully organized.')}</span><span><LockKeyhole size={13}/>{t('Your records are private to your account.')}</span></footer>
  </main>;
}
