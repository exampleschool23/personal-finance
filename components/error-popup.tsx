"use client";

import { useEffect } from 'react';
import { showError } from '@/lib/feedback';

/** Shows an action error as a popup whenever it becomes set. Clear the error before retrying. */
export function ErrorPopup({ message, detail }: { message?: string | null; detail?: string }) {
  useEffect(() => { if (message) showError(message, { detail }); }, [message, detail]);
  return null;
}
