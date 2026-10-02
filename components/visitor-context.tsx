"use client";
import { createContext, useContext, type ReactNode } from 'react';
import type { Language } from '@/lib/i18n';

/** What the server knows about a visitor before the browser has checked the session. */
export type Visitor = { signedOut: boolean; language: Language };

const VisitorContext = createContext<Visitor>({ signedOut: false, language: 'en' });

export function VisitorProvider({ visitor, children }: { visitor: Visitor; children: ReactNode }) {
  return <VisitorContext.Provider value={visitor}>{children}</VisitorContext.Provider>;
}

export const useVisitor = () => useContext(VisitorContext);
