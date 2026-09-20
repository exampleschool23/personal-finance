"use client";

import { createContext } from 'react';
import type { Language } from '@/lib/i18n';

type LanguageState = {
 language: Language;
 setLanguage: (language: Language) => void;
 setDefaultLanguage: (language: Language) => void;
};

// Keep context identity independent of translation and component hot updates.
// Recreating it during refresh disconnects mounted providers from consumers.
export const LanguageContext = createContext<LanguageState | null>(null);
