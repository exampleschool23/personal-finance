"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { isLanguage, Language, locales, translate } from '@/lib/i18n';

type LanguageState = {
  language: Language;
  setLanguage: (language: Language) => void;
  setDefaultLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>('en');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hoggish-default-language');
      if (isLanguage(saved)) updateLanguage(saved);
    } catch { /* Language selection also works when browser storage is blocked. */ }
    const sync = (event: StorageEvent) => {
      if (event.key === 'hoggish-default-language' && isLanguage(event.newValue)) updateLanguage(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
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

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  return <select className="language-selector" aria-label={t('Language')} title={t('Language')} value={language} onChange={event => { if (isLanguage(event.target.value)) setLanguage(event.target.value); }}>
    <option value="en" lang="en">EN · English</option>
    <option value="ru" lang="ru">RU · Русский</option>
    <option value="uz" lang="uz">UZ · O‘zbekcha</option>
  </select>;
}
