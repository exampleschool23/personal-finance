"use client";
import type { ComponentProps } from 'react';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';

/** The product mark and name, with an optional badge such as Demo, shared by the sidebar, sign-in and account pages. It always links to the main page: the sign-in screen when signed out, Overview when signed in. */
/** `compact` shows the mark alone, as the app drawer's header does; the name stays as its accessible label. */
export function Brand({ onClick, badge, compact }: { onClick?: ComponentProps<typeof DrawerLink>['onClick']; badge?: string; compact?: boolean }) {
 const { t } = useLanguage();
 if (compact) return <DrawerLink href="/" className="brand brand-compact" aria-label="Hoggish" onClick={onClick}><span className="mark">h.</span>{badge && <span className="brand-badge">{badge}</span>}</DrawerLink>;
 return <DrawerLink href="/" className="brand" onClick={onClick}><span className="mark">h.</span><span>HOGGISH<small className="block">{t("PERSONAL FINANCE")}</small></span>{badge && <span className="brand-badge">{badge}</span>}</DrawerLink>;
}
