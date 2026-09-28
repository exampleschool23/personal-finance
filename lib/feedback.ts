"use client";

import { toast } from 'sonner';
import { isLanguage, translate, type Language } from '@/lib/i18n';

function currentLanguage(language?: Language): Language {
  const current = language ?? (typeof document === 'undefined' ? 'en' : document.documentElement.lang);
  return isLanguage(current) ? current : 'en';
}

/** Call only after a user-initiated save has succeeded, never on reads or retries. */
export function showSaved(language?: Language) {
  toast.success(translate(currentLanguage(language), 'Saved'), {
    id: 'save-confirmation',
    duration: 3000,
    className: 'app-feedback save-confirmation',
  });
}

/** Shows a failed user action in the same popup as save confirmations. Messages are translation keys. */
export function showError(message: string, options: { detail?: string; language?: Language } = {}) {
  if (!message) return;
  const language = currentLanguage(options.language);
  toast.error(translate(language, message), {
    id: 'error-feedback',
    duration: 6000,
    className: 'app-feedback error-feedback',
    description: options.detail ? translate(language, options.detail) : undefined,
  });
}
