"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { Brand } from '@/components/presentation-foundation/brand';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { Button } from '@/components/ui/button';
type Result = { state: 'sign_in' | 'confirm' | 'expired' | 'cancelled' | 'connected'; telegram?: string | null; account?: string; bot?: string };
type View = { state: 'loading' } | { state: 'error'; message: string } | Result;
async function request(action: 'preview' | 'confirm' | 'cancel'): Promise<Result> {
  const response = await fetch('/api/telegram/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
  const result = await response.json().catch(() => ({})) as Result & { error?: string };
  if (!response.ok) throw Error(result.error ?? 'Could not connect Telegram. Please try again.');
  return result;
}
/** Where the bot's "I already have an account" link lands. The person signs in with any method, checks which chat and account are being joined, and confirms. */
function ConnectTelegram() {
  const { t } = useLanguage(), router = useRouter();
  const [view, setView] = useState<View>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const run = async (action: 'preview' | 'confirm' | 'cancel') => {
    setBusy(true);
    try { setView(await request(action)); } catch (reason) { setView({ state: 'error', message: (reason as Error).message }); } finally { setBusy(false); }
  };
  useEffect(() => { if (started.current) return; started.current = true; void run('preview'); }, []);
  const anotherAccount = async () => { setBusy(true); await fetch('/api/auth', { method: 'DELETE' }).catch(() => null); router.push('/'); };
  const bot = 'bot' in view && view.bot ? `https://t.me/${view.bot}` : null;
  const openTelegram = bot && <Button asChild><a href={bot}>{t('Open Telegram')}</a></Button>;
  return <section className="panel connect-telegram">
    <h2>{t('Connect Telegram')}</h2>
    {view.state === 'loading' && <LoadingPlaceholder label={t('Connect Telegram')} rows={1}/>}
    {view.state === 'error' && <>
      <p role="alert">{t(view.message)}</p>
      <div className="entry-actions"><Button disabled={busy} onClick={() => void run('preview')}>{t('Retry')}</Button><Button variant="outline" disabled={busy} onClick={() => void run('cancel')}>{t('Cancel')}</Button></div>
    </>}
    {view.state === 'sign_in' && <>
      <p>{t('Sign in to the account you want to use in Telegram. You will come back here to finish.')}</p>
      <div className="entry-actions"><Button onClick={() => router.push('/')}>{t('Continue to sign in')}</Button><Button variant="outline" disabled={busy} onClick={() => void run('cancel')}>{t('Cancel')}</Button></div>
    </>}
    {view.state === 'confirm' && <>
      <dl className="connect-facts">
        <div><dt>{t('Telegram')}</dt><dd>{view.telegram || '—'}</dd></div>
        <div><dt>{t('Account')}</dt><dd>{view.account || '—'}</dd></div>
      </dl>
      <p>{t('Only connect if you pressed Sign in in the Hoggish bot yourself.')}</p>
      <div className="entry-actions">
        <Button disabled={busy} onClick={() => void run('confirm')}>{t('Connect')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void anotherAccount()}>{t('Use another account')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run('cancel')}>{t('Cancel')}</Button>
      </div>
    </>}
    {view.state === 'connected' && <>
      <p role="status">{t('Telegram is connected. Go back to the chat to continue.')}</p>
      <div className="entry-actions">{openTelegram}<Button variant="outline" asChild><Link href="/">{t('Open app')}</Link></Button></div>
    </>}
    {(view.state === 'expired' || view.state === 'cancelled') && <>
      <p>{t(view.state === 'expired' ? 'This link has expired or was already used. Open the bot and press I already have an account again.' : 'Nothing was connected.')}</p>
      <div className="entry-actions">{openTelegram}<Button variant="outline" asChild><Link href="/">{t('Open app')}</Link></Button></div>
    </>}
  </section>;
}
export default function ConnectTelegramPage() {
  return <LanguageProvider><main className="auth-page"><header className="auth-page-header"><Brand/></header><ConnectTelegram/></main></LanguageProvider>;
}
