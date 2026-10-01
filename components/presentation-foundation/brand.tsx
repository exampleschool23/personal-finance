"use client";
import type { ComponentProps } from 'react';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';

/** The product mark and name, shared by the sidebar, sign-in and account pages. It always links to the main page: the sign-in screen when signed out, Overview when signed in. */
export function Brand({ onClick }: { onClick?: ComponentProps<typeof DrawerLink>['onClick'] }) {
 const { t } = useLanguage();
 return <DrawerLink href="/" className="brand" onClick={onClick}><span className="mark">h.</span><span>HOGGISH<small className="block">{t("PERSONAL FINANCE")}</small></span></DrawerLink>;
}
