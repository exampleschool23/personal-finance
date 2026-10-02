"use client";
import { useEffect, useState } from 'react';

export type PhoneSignInStatus = { enabled: boolean; botUsername: string | null };

/** Whether the server has phone sign-in set up, and which Telegram bot serves it. Off until the server answers. */
export function usePhoneSignIn(): PhoneSignInStatus {
  const [status, setStatus] = useState<PhoneSignInStatus>({ enabled: false, botUsername: null });
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/phone', { signal: controller.signal, cache: 'no-store' }).then(response => response.ok ? response.json() as Promise<PhoneSignInStatus> : null).then(data => { if (data && !controller.signal.aborted) setStatus({ enabled: !!data.enabled, botUsername: data.botUsername ?? null }); }).catch(() => {});
    return () => controller.abort();
  }, []);
  return status;
}
