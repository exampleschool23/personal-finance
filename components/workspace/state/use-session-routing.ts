"use client";
import { useEffect, useState } from 'react';
import { isPreviewFrame, previewPath, previewReady } from '@/lib/app-preview';
import { signInPath } from '@/lib/sign-in-path';

type Router = { push: (path: string) => void; replace: (path: string) => void };

/** Where a visitor may be: signed out, only the product tour and the sign-in page; signed in, anywhere but sign-in.
 * Inside a public page's app preview the app opens its sample workspace by itself and shows the screen the page asks
 * for. Returns whether this is such a preview. */
export function useSessionRouting({ ready, user, demo, pathname, router, pendingInvite, startDemo }: { ready: boolean; user: string | null; demo: boolean; pathname: string; router: Router; pendingInvite: string | null; startDemo: () => Promise<void> }) {
    const [preview, setPreview] = useState(false);
    useEffect(() => { if (isPreviewFrame(window.location.search, window.self !== window.top)) queueMicrotask(() => setPreview(true)); }, []);
    useEffect(() => { if (preview && ready && !user && !demo) void startDemo(); }, [preview, ready, user, demo]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!preview || !demo) return;
        const open = (event: MessageEvent) => { const path = event.origin === window.location.origin ? previewPath(event.data) : null; if (path) router.push(path); };
        window.addEventListener('message', open);
        window.parent.postMessage(previewReady, window.location.origin);
        return () => window.removeEventListener('message', open);
    }, [preview, demo, router]);
    useEffect(() => {
        // Signed out, only the product tour and the sign-in page are open; signed in, the sign-in page has nothing to show.
        if (ready && (user || demo ? pathname === signInPath : pathname !== '/' && pathname !== signInPath)) router.replace('/');
    }, [ready, user, demo, pathname, router]);
    // Someone following an invite link signs in (or up) first.
    useEffect(() => { if (ready && !user && !demo && pendingInvite && pathname === '/') router.replace(signInPath); }, [ready, user, demo, pendingInvite, pathname, router]);
    return preview;
}
