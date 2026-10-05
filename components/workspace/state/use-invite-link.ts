"use client";
import { useEffect, useState } from 'react';
import { inviteToken } from '@/lib/household';

/** A household invite link (/settings?invite=…) waits through sign-in or sign-up, then asks to join. The token is
 * kept for the visit and taken out of the address bar. */
export function useInviteLink() {
    const [pendingInvite, setPendingInvite] = useState<string | null>(null);
    useEffect(() => {
        const url = new URL(window.location.href), token = inviteToken(url.search);
        let stored: string | null = null;
        try { if (token) sessionStorage.setItem('hf_invite', token); stored = sessionStorage.getItem('hf_invite'); } catch { stored = token; }
        if (token) { url.searchParams.delete('invite'); window.history.replaceState(null, '', url.pathname + url.search + url.hash); }
        if (stored) queueMicrotask(() => setPendingInvite(stored));
    }, []);
    const dismissInvite = () => { try { sessionStorage.removeItem('hf_invite'); } catch {} setPendingInvite(null); };
    return { pendingInvite, dismissInvite };
}
