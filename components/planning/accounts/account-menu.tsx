"use client";
import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/components/ui/dropdown-menu';

/** An account's or holding's rarer actions, behind ⋯. */
export function AccountMenu({ name, children }: { name: string; children: ReactNode }) {
 const { t } = useLanguage();
 return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="account-card-menu" aria-label={`${t('Account actions')}: ${name}`}><MoreHorizontal size={20} aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="account-menu-content">{children}</DropdownMenuContent></DropdownMenu>;
}
