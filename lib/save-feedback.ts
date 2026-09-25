"use client";

import { toast } from 'sonner';
import { isLanguage, translate, type Language } from '@/lib/i18n';

/** Call only after a user-initiated save has succeeded, never on reads or retries. */
export function showSaved(language?: Language) {
  const current = language ?? (typeof document === 'undefined' ? 'en' : document.documentElement.lang);
  toast.success(translate(isLanguage(current) ? current : 'en', 'Saved'), {
    id: 'save-confirmation',
    duration: 3000,
    className: 'save-confirmation',
  });
}
