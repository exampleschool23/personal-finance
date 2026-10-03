"use client";

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { AuthPage, ProviderChoices, SampleInvite } from '@/components/auth-card';
import { recoverPath, signUpPath } from '@/lib/sign-in-path';
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
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  return <AuthPage brand={brand} preferences={preferences} title="Welcome back." subtitle="Sign in to your financial overview.">
    <ProviderChoices disabled={busy || !configured} emailDivider="or sign in with email">
      <form className={styles.form} onSubmit={onLogin} aria-busy={busy}>
        <label htmlFor="signin-email">{t('Email address')}</label><Input id="signin-email" name="email" type="email" placeholder="you@example.com" required autoComplete="username" autoCapitalize="none" spellCheck={false}/>
        <div className={styles.passwordLabel}><label htmlFor="signin-password">{t('Password')}</label><Link href={recoverPath}>{t('Forgot password?')}</Link></div>
        <div className={styles.password}><Input id="signin-password" name="password" type={showPassword ? 'text' : 'password'} placeholder={t('Enter your password')} required autoComplete="current-password"/><Button type="button" variant="ghost" size="icon" aria-label={t(showPassword ? 'Hide password' : 'Show password')} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</Button></div>
        {error && <p className={styles.error} role="alert">{t(error)}</p>}
        {!configured && <p className={styles.notice} role="status">{t('Account connection is awaiting setup. You can explore the sample workspace below.')}</p>}
        <Button type="submit" className={styles.submit} disabled={busy || !configured}>{t(busy ? 'Signing in…' : 'Sign in')}</Button>
      </form>
      <p className={styles.register}>{t('New to Hoggish?')} <Link href={signUpPath}>{t('Create an account')}</Link></p>
      <SampleInvite busy={busy} onDemo={onDemo}/>
    </ProviderChoices>
  </AuthPage>;
}
