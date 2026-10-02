"use client";

import { useContext, useEffect, useState } from 'react';
import { detectLanguage, directionOf, isLanguage, Language, locales, translate } from '@/lib/i18n';

import { LanguageContext } from '@/components/language-context';

/** `initial` is the language the server rendered in; a saved choice or the browser's own list still takes over after loading. */
export function LanguageProvider({ children, initial = 'en' }: { children: React.ReactNode; initial?: Language }) {
  const [language, updateLanguage] = useState<Language>(initial);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('hoggish-default-language'); } catch { /* Language selection also works when browser storage is blocked. */ }
    // Nothing chosen yet: follow the browser. Only an explicit choice is ever saved as the default.
    const chosen = isLanguage(saved) ? saved : detectLanguage(typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
    if (chosen !== initial) queueMicrotask(() => updateLanguage(chosen));
    const sync = (event: StorageEvent) => {
      if (event.key === 'hoggish-default-language' && isLanguage(event.newValue)) updateLanguage(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [initial]);
  useEffect(() => {
    document.documentElement.lang = language;
    // Arabic and Urdu read right to left.
    document.documentElement.dir = directionOf(language);
  }, [language]);
  const setLanguage = (next: Language) => updateLanguage(next);
  const setDefaultLanguage = (next: Language) => {
    updateLanguage(next);
    try { localStorage.setItem('hoggish-default-language', next); } catch {}
  };
  return <LanguageContext.Provider value={{ language, setLanguage, setDefaultLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return { ...context, locale: locales[context.language], t: (key: string, params?: Record<string, string | number>) => translate(context.language, key, params) };
}
