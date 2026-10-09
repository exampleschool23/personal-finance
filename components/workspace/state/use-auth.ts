"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { requestJson } from '@/lib/api-client';

const authErrors: Record<string, string> = { google_setup: 'Google sign-in is awaiting setup. You can still sign in with email.', google_unavailable: 'Google sign-in is temporarily unavailable. Please try again.', google_cancelled: 'Google sign-in was not completed. Please try again.', google_expired: 'Your sign-in attempt expired. Please start again.', google_failed: 'Google sign-in failed. Please try again or use email.' };
type Session = { configured: boolean; user: null | { email: string }; next?: string };

/** Who is signed in, read once on load, and email sign-in. A failed Google attempt returns with `auth_error`, shown
 * once and taken out of the address bar. A Telegram chat waiting to be connected (`next`) takes over right after. */
export function useAuth({ setError, setBusy }: { setError: Dispatch<SetStateAction<string>>; setBusy: Dispatch<SetStateAction<boolean>> }) {
    const [user, setUser] = useState<string | null>(null), [ready, setReady] = useState(false), [configured, setConfigured] = useState(true);
    useEffect(() => {
        const url = new URL(window.location.href); const authError = url.searchParams.get('auth_error');
        if (authError) {
            queueMicrotask(() => setError(authErrors[authError] ?? 'Sign-in could not be completed. Please try again.'));
            url.searchParams.delete('auth_error');
            window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
        fetch('/api/auth').then(r => r.json() as Promise<Session>).then(async (d) => {
            setConfigured(d.configured);
            if (d.next) { window.location.replace(d.next); return; }
            if (d.user) setUser(d.user.email);
        }).catch(e => setError(e.message)).finally(() => setReady(true));
        // Once per load: the setters it receives are state setters, which never change.
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    async function login(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault(); setBusy(true); setError('');
        try {
            const f = new FormData(e.currentTarget);
            const d = await requestJson<{ user: { email: string }; next?: string }>('/api/auth', { body: Object.fromEntries(f), fallback: 'Sign-in could not be completed. Please try again.' });
            // A Telegram chat waiting to be connected takes over right after signing in.
            if (d.next) { window.location.replace(d.next); return; }
            setUser(d.user.email);
        }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
    }
    return { user, setUser, ready, configured, login };
}
