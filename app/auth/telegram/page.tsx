"use client";
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { Brand } from '@/components/presentation-foundation/brand';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { signInPath } from '@/lib/sign-in-path';
type WebApp = { initData?: string; ready?: () => void; expand?: () => void };
async function signIn(body: { token?: string; initData?: string }) {
  const response = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw Error(result.error ?? 'Account service is unavailable. Please try again.');
}
/** The landing page of the bot's "Open in browser" link and "Open app" Mini App button. */
function TelegramSignIn() {
  const query = useSearchParams(), { t } = useLanguage();
  const [error, setError] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = (body: { token?: string; initData?: string }) => signIn(body).then(() => window.location.replace('/')).catch(reason => setError((reason as Error).message));
    const token = query.get('t');
    if (token) { void finish({ token }); return; }
    // Inside Telegram, the Mini App script provides signed data that proves who opened the page.
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = () => {
      const webApp = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
      webApp?.ready?.(); webApp?.expand?.();
      if (webApp?.initData) void finish({ initData: webApp.initData }); else setError('This sign-in link is not valid. Open the bot and press Open app again.');
    };
    script.onerror = () => setError('This sign-in link is not valid. Open the bot and press Open app again.');
    document.head.appendChild(script);
  }, [query]);
  return <section className="panel tools-panel">
    <h1>{t(error ? 'Sign in' : 'Signing you in…')}</h1>
    {error ? <><p role="alert">{t(error)}</p><Link href={signInPath}>{t('Back to sign in')}</Link></> : <LoadingPlaceholder label={t('Signing you in…')} rows={1}/>}
  </section>;
}
export default function TelegramPage() {
  return <LanguageProvider><main className="auth-page"><header className="auth-page-header"><Brand/></header><Suspense><TelegramSignIn/></Suspense></main></LanguageProvider>;
}
