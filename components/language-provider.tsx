"use client";

import { useContext, useEffect, useState } from 'react';
import { detectLanguage, directionOf, isLanguage, Language, locales, translate } from '@/lib/i18n';

import { LanguageContext } from '@/components/language-context';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>('en');
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('hoggish-default-language'); } catch { /* Language selection also works when browser storage is blocked. */ }
    // Nothing chosen yet: follow the browser. Only an explicit choice is ever saved as the default.
    const initial = isLanguage(saved) ? saved : detectLanguage(typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
    if (initial !== 'en') queueMicrotask(() => updateLanguage(initial));
    const sync = (event: StorageEvent) => {
      if (event.key === 'hoggish-default-language' && isLanguage(event.newValue)) updateLanguage(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
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
